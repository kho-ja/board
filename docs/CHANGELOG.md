# Changelog

## 2026-09-11 — M17 (in progress): Block views — render how a block shows itself

- **Views registry** (`src/lib/blocks/views.ts`): every block kind declares the
  switchable ways it can render (purely presentational — a view only picks
  which existing data is shown). A block stores its active view in `data.view`
  and falls back to the kind's default (`resolveView` sanitizes bad values).
- **File views** (`FileBlockData.view`, `FileCard.tsx`): `card` (default —
  name/size/type + inline preview), `content` (media only — SVG/images render,
  text scroll-capped, no header; metadata-only uploads show an oversized
  emblem), and `meta` (compact chip). No schema/migration — existing rows
  simply resolve `card`.
- **View drives footprint** (`styles.css`): `content` sizes to the media up to
  a cap (≈360×300), `meta` snaps to a small chip; ports and connection arrows
  move with the block. No resize interaction needed.
- **Right-click context menu** (`BlockShell.tsx`): placed file blocks open a
  small view menu (active view checked, future-actions slot reserved) on
  right-click; backdrop click or Escape closes it. Select/drag semantics
  untouched. The menu renders via a portal to `document.body` so the canvas
  pan/zoom transform can't displace it offscreen.
- **Schema alignment** (`src/types/schemas.ts`): `FileBlockDataSchema` now
  includes `content` and `view`, matching the TS type. react-db validates each
  optimistic write against this schema, so without these keys the literal
  bytes the view change writes would be rejected server-side and silently
  rolled back — this round-trip is now pinned by tests.
- **Tests**: `FileCard.test.tsx` (5 render-mode tests) + views-registry tests
  + `BlockShell.test.tsx` (4 menu-interaction tests: opens on right-click,
  default card checked, picks/commits a view and closes, text blocks left
  alone) + schema acceptance tests; 130 total green.
- Route (`index.tsx`) persists each switch via the existing undoable
  `runRecorded`/`updateBlockData` path (`handleBlockViewChange`).
- **Live smoke** (Postgres `data->>'view'` verified): created inline-SVG file
  blocks, right-click → Content fills the shell to the media (360px cap, no
  header), Meta snaps to a compact chip, choices survive a page reload, and
  text blocks keep the browser's native menu.

## 2026-09-11 — M16 (in progress): Ask, the builder

- **`board_edit_blocks`** (`src/lib/ai/tools.ts` / `tools.server.ts`,
  approval-gated): rewrite a text block's markdown, set field values on a
  structured card (keyed by type field names, omitted fields preserved),
  rename file blocks / file groups, and place or move blocks
  (`upsertPlacement` added to `src/db/queries.server.ts`).
- **Inline content files** (`FileBlockData.content`, `FileCard.tsx`,
  `src/routes`): file blocks can now carry real content — markdown, JSON, CSV,
  code, HTML, and SVG. The AI's `board_create_files` tool authors them
  (`size` = UTF-8 byte length); SVG content renders as an image on the card,
  other text renders as a monospace preview (truncated at 400 chars). Uploaded
  files stay metadata-only. The AI snapshot exposes inline file content as the
  block body so Ask can read and edit what's inside files.
- **`board_make_diagram`** (`src/lib/ai/tools.server.ts`, approval-gated): one
  call describes diagram nodes (indexed) + edges; the server creates text
  blocks, lays them out with longest-path layering (`src/lib/ai/diagram.ts`,
  unit-tested, left-to-right or top-to-bottom, anchored near existing placed
  content), places them, and connects them with typed links (default
  `depends-on`). AskPanel pans/selects the first created node into view after
  approval (`onFocusBlock`).
- **Ask persona updated** (`src/lib/ai/system.ts`): rule 3 now routes builder
  intent to the right tool and prefers one batched call over many.

## 2026-09-10 — M15 (in progress): Ask, the AI assistant

- **Ask panel** (`src/components/canvas/AskPanel.tsx`): a chat tab in the left
  dock over `POST /api/chat` (`src/routes/api.chat.ts`, `@tanstack/ai`'s
  `chat()` + SSE + AG-UI thread/resume, `maxIterations(8)`). Provider + model
  pickers (choice persisted to localStorage), suggestion chips, thinking /
  tool-call / approval cards in the thread, and localStorage conversation
  persistence.
- **Multi-provider adapters** (`src/lib/ai/providers.server.ts`): OpenAI,
  OpenRouter, Ollama (local), and a custom OpenAI-compatible provider. Keys are
  resolved DB-first (Ask panel "API Keys" section) then env fallback; adapters
  are built per-request so config is always fresh.
- **Key management + encryption at rest** (`api_keys` table,
  `src/lib/ai/encryption.ts`): upsert/delete server fns; keys are AES-GCM
  encrypted with a master key derived from `AI_ENCRYPTION_KEY` (32-byte base64)
  and stored in `encrypted_key`. Without the env var the dev fallback stores
  plaintext and the panel warns. Unit-tested (`encryption.test.ts`).
- **Agent tools** (`src/lib/ai/tools.ts`, approval-gated):
  - `board_context` — read-only full-board snapshot (blocks incl. text bodies and
    custom-type field values, typed connections, memberships, type schemas).
  - `board_create_blocks` — unplaced text/file-group/custom-type blocks.
  - `board_connect_blocks` — typed `depends-on` / `responsible-for` / `part-of` /
    `related-to` edges with semantic dedupe against existing links.
  Both mutation tools require user approval before running.
- **Snapshot serialization** (`src/lib/ai/board.ts`, unit-tested): compact
  JSON-safe view of the live rows with `placed` / `group` / `in-group` flags,
  per-block titles/bodies/fields, and normalized connections.
- **Ask persona** (`src/lib/ai/system.ts`): read-snapshot-first + never-invent-ids
  rules guiding tool use.
- **Markdown in assistant messages**: assistant text parts render through
  `@tanstack/markdown` with the shared board theme components
  (`src/lib/markdown/components.tsx`, also used by text blocks), so lists, code
  blocks, headings etc. display live while streaming.

## 2026-09-09 — M14: Board Search (Ctrl/Cmd+K)

- **Command palette** (`src/components/canvas/SearchOverlay.tsx`): `Ctrl+K` /
  `Cmd+K` opens a search overlay (another press or `Esc` closes) with a
  keyboard-navigable result list (↑/↓ + Enter, mouse hover/click). The active
  result is highlighted and auto-scrolled into view.
- **Search index** (`src/lib/board/search.ts`, unit-tested): every block is
  indexed by its title plus block-kind and — per shape — text markdown, file
  name, group name, or all object field keys/values (numbers and date strings
  included). Queries are lowercase substring matches; multi-word queries AND the
  words together. Ranking: title prefix > term prefix > title substring > term
  substring, ties alphabetical, capped at 12 results.
- **Jump to result**: selecting a result pans the viewport so the block is
  centered at the current zoom and selects it (Inspector shows it). Unplaced
  blocks are discoverable too — selecting one places it at the view center in
  one undoable action. Results show a "not placed" badge and a kind caption
  (Text / File / Group / schema name). Matched text is bolded in the title.
- **Shortcut wiring**: `Ctrl/Cmd+K` is handled in the same window keydown
  handler as undo/redo, so it stays out of the way while typing in inputs;
  the overlay's input handles its own keys so board shortcuts don't fire while
  the palette is focused.

## 2026-09-09 — Fixed after M13: connection lines could not be selected

- The marquee (`usePanZoom`) started for any press not on a `.block-shell`,
  capturing the pointer and swallowing the `click` on link hit paths — so a
  connection could never be selected and its Delete action was unreachable.
  Added an `onLink` bail-out (`.canvas-link-group`) before the marquee starts.
  Verified live: click a line → Inspector "Connection" → Del/Backspace or
  "Delete connection" → Ctrl+Z restores. (`a794afa`)

## 2026-09-09 — M13: Typed Connections & Edge Labels

- **Typed connection set** (`src/lib/board/connections.ts`, unit-tested):
  `depends-on`, `responsible-for`, `part-of`, `related-to`. `related-to` is the
  only symmetric type and the generic fallback; the drawn arrow on the other
  three expresses the canonical meaning, so reversing a drag reverses the fact.
  Per DECISIONS.md, the set stays deliberately small.
- **Connection-type picker** (ToolRail, appears only while the Connector tool
  is active): four color-coded chips, `related-to` by default. The live draft
  line previews the chosen type — color + arrowhead, or a plain undirected
  curve for `related-to`.
- **Semantic dedupe**: a second drag between the same pair is a no-op unless
  either the type or (for directed types) the direction differs, so the board
  carries multiple typed edges per pair — many-to-many with distinct meaning.
- **Edge labels**: optional free-text note on a connection, edited in the
  Inspector label field, rendered centered on the curve with a paint-order halo.
- **Inspector rework for connections**: title "Connection", connected-from/to
  names, a Type select (`ConnectionTypeField`) and a Label field
  (`ConnectionLabelField`). Type and label updates are recorded into the same
  undo/redo stack as the rest of the board.
- **Data layer**: `links.type` (not-null, default `related-to`) and nullable
  `links.label`; the old unique per-pair index is gone; `linksCollection`
  gained the missing `onUpdate` via the new `updateLink` server fn
  (`updateLinkFn`), matching every other collection.
- **Rendering** (`src/components/canvas/LinksLayer.tsx`): per-type stroke color
  `var(--conn-*)`, SVG `marker` arrowheads per directed type
  (`#conn-arrow-<type>`), invisible wide hit path, selection halo, and midpoint
  type/label text.
- **Export / import** (`src/lib/board/json.ts`): board JSON is now **v2**
  (imports accept v1 and upgrade in place, backfilling `related-to`); typed
  links including labels round-trip. PNG export strokes per-type colors plus
  arrowheads and port dots.
- **Fix — stale relational metadata**: `listLinks` now uses the direct
  `select()` instead of `db.query.links.findMany()`, whose first-import column
  cache silently dropped the new `type`/`label` columns (same class of bug as
  `bc8e313`). Verified live: typed drags, dedupe, Inspector type/label,
  undo/redo round-trip, and persistence in Postgres.

## 2026-09-08 — M12: Spatial Mini-Map & Quick Navigation

- **Mini-map overview** (`src/components/canvas/MiniMap.tsx`): bottom-right corner
  frame rendering every placed block as a live dot (selected blocks highlighted,
  same rects as the link layer) plus a lagoon viewport box. Hidden when the
  board is empty and on narrow screens; `M` toggles it.
- **Click-to-center & drag-to-pan**: pressing anywhere in the mini-map centers
  that world point and starts a pan gesture (1:1 pointer tracking) with the
  frame frozen for the gesture so it never rescales under the cursor.
- **Stable frame during block drags**: the bounds also freeze while
  `livePositions` is non-empty, so only the dragged dots travel instead of the
  whole frame breathing.
- **Projection math** (`src/lib/canvas/minimap.ts`, unit-tested): content
  bounds + margin, aspect-fit letterboxing, world/mini conversion, and
  center-offset navigation.

## 2026-09-08 — M11: Board Serialization & Export / Import

- **JSON export** (`src/lib/board/json.ts`, TopBar): one click downloads the full
  board state (`blocks`, `placements`, `memberships`, `links`, `types`, `views`)
  as versioned `kho-ja.board` JSON with a transient StatusBar confirmation.
- **JSON import** (`JsonImport.tsx` + board route): validated with Zod row schemas
  plus referential-integrity checks (placements/memberships/links must point at
  exported blocks) with plain-language errors in the StatusBar. A valid file
  **replaces** the board through an FK-safe ordered write (wipe children, wipe
  parents, insert parents, insert children — timestamps refreshed server-side),
  captured as a single undoable action, so `Ctrl+Z` restores the previous board.
- **PNG export** (`src/lib/board/png.ts`): renders content bounds at 2x with the
  2D canvas API — theme-aware cards, plain-text blocks, member rows, and the
  exact cubic-bezier link curves with port dots. (An SVG-foreignObject version
  was abandoned: Chromium taints the canvas for any SVG containing
  foreignObject, and remote `@import`s are stripped for the same reason.)
- Views are now preloaded and included in export/import.

## 2026-09-08 — M10: Multi-Block Group Drag & Layout Tools + link anchor fix

- **Link anchors track live block size** (`src/routes/index.tsx`): `getBlockRect`
  previously assumed fixed `sizeForBlock` dimensions, so connection lines missed
  `max-content`-sized text blocks (e.g. a 36×20 pill vs the assumed 180×92).
  Rects now come from a `ResizeObserver`-measured size cache (world units,
  pruned on delete) with a sync DOM read as first-paint fallback.
- **Relative group drag**: dragging any block inside a multi-selection moves all
  selected placements by the same world delta in real time (links re-route live)
  and commits in a single batched `runRecorded` action, so one `Ctrl+Z` reverts
  the whole move. Pressing a multi-selected block preserves the selection for
  the drag; a plain click (≤4px) still collapses back to that block.
- **Alignment & distribution** (`src/lib/canvas/layout.ts` + Inspector): new pure
  helpers `groupDragTargets` / `alignTargets` / `distributeTargets` (unit-tested
  in `layout.test.ts`) behind Inspector buttons for multi-selections — Align
  Left/Center/Right/Top/Middle/Bottom and Distribute H/V (needs 3+ blocks, keeps
  extremes fixed). Each is one atomic undo step; no-ops record nothing.
- **Robustness**: `setPointerCapture` calls in `BlockShell`/`usePanZoom` are now
  guarded — capture failures no longer abort drag/marquee gestures.

## 2026-09-08 — M9: v1 Relationships ("Link with a Line")

- **PostgreSQL Database Schema & Server Functions for Links**: Added `links` table
  with `id`, `block_a_id`, `block_b_id`, `created_at`, foreign-key constraints cascading on
  block deletion, and a unique composite index. Pushed schema changes to Postgres via
  Drizzle Kit.
- **TanStack DB Reactive Collection**: Created `linksCollection` (`src/collections/links.ts`)
  supporting live queries, optimistic insertion, and deletion.
- **Canvas Geometry & Bezier Curve Routing** (`src/lib/canvas/geometry.ts`): Added
  automatic connection anchor calculation choosing optimal cardinal ports (top, bottom,
  left, right) with directional penalties, smooth cubic Bezier paths, and quadratic preview
  paths. Added unit tests for anchor calculations and schema validation.
- **Connector Tool & Interactive Affordances**:
  - Added Connector tool to ToolRail with hotkey `C`.
  - Cardinal port handles on blocks that appear on hover or when Connector tool is active.
  - Interactive click-to-connect and drag-to-connect affordances with real-time animated
    dashed draft line.
  - Real-time line tracking as connected blocks are dragged across the canvas at 60fps.
- **Link Selection & Inspector Panel**:
  - Click on connection line selects it with glow filter and highlight halo.
  - Dedicated Relationship Inspector panel displaying source and target block names and a
    "Delete connection" action.
  - Keyboard deletion via `Delete` / `Backspace` when link is selected.
  - Automatic cascade deletion of attached links when blocks are permanently deleted.
  - All link additions and deletions fully recorded in `useUndoRedo` stack for atomic
    `Ctrl+Z` / `Ctrl+Shift+Z`.

## 2026-09-08 — Asset categorization, sort modes, keyboard navigation, and Place Files affordance

- **Asset Category System** (`src/lib/assets/categories.ts`): Added smart classification
  partitioning unplaced blocks and files into 6 standard categories (`Images`, `Documents`,
  `Code & Data`, `Media`, `Notes & Text`, and Custom Schema Types).
- **Dock Group Dividers & Sorting**: LeftDock Assets tab now defaults to Category sorting,
  displaying sticky visual group headers with per-category count badges. Added 6 sort modes
  (Category, Name A-Z, Name Z-A, Newest, Oldest, Size) with hotkey `S` to cycle modes.
- **Dedicated Asset Hotkeys & Smooth Navigation**:
  - `A` toggles/focuses the Assets tab in LeftDock.
  - `↑` / `↓` navigate assets without prematurely placing them.
  - `Enter` / `Space` or `+ Place` places highlighted asset at view center.
  - `Del` / `Backspace` or `×` button permanently deletes asset with undo support.
  - Drag & drop from dock onto canvas places asset at cursor coordinate.
- **Permanent Deletion & Cascade**: Two-step permanent deletion in Inspector (single and
  multi-selection) and Assets dock, cascading to `blocks`, `placements`, and `memberships`
  with atomic `runRecorded` undo/redo.
- **Explicit "Place files" Affordance**: Renamed TopBar button from "Paste files" to
  "Place files" and added a direct "+ Place files" file picker in the Assets dock toolbar.

## 2026-09-08 — M7: Custom Object Types & Schema-Driven Blocks

- **Custom Schema Definition** (`types` table + collection): Added schema creator modal
  allowing users to define custom types with fields (`text`, `number`, `boolean`, `date`).
- **Object Block Instances**: Added `object` block kind rendering custom type cards with
  field values, editable values in Inspector, and a Types tab in LeftDock.

## 2026-09-03 — Ctrl+Z undo / Ctrl+Shift+Z redo for board mutations

- Added an **action-based undo stack** (`src/hooks/useUndoRedo.ts`):
  `runRecorded(label, apply, undo, redo)` executes the forward mutation and
  registers a pair of closures that replay the inverse (undo) and forward
  (redo) mutations through the same TanStack DB collections. `undo()`/`redo()`
  replay the captured closures and are themselves never re-recorded, so replay
  doesn't nest. The stack is trackable via `canUndo`/`canRedo`.
- **Wired into the canvas keydown handler:** `Ctrl/Cmd+Z` → undo,
  `Ctrl/Cmd+Shift+Z` **and** `Ctrl/Cmd+Y` → redo. These are intercepted before
  the existing modifier early-return, and the `isTyping()` guard (INPUT /
  TEXTAREA / contenteditable) still applies, so undo works while typing in an
  editor is unaffected.
- **Every reversible mutation now records an action:** move / set position
  (drag-end, X/Y inputs), text commit, add text, drag-to-place, import files
  (and add-files-to-group), create group, group card/list view toggle, rename
  group, remove-from-board, and delete group (undo restores the group's
  memberships and placement; blocks are references and are never deleted).
- Verified in the browser: create a File Group → `Ctrl+Z` removes it (back to
  44 placed · 46 total from 45 · 47) → `Ctrl+Shift+Z` restores it, with no
  console errors. `npm run tsc`, `npm run lint`, and `npm run build` pass.

## 2026-09-02 — M6: File Group blocks (create, drop-to-add, view toggle, delete)

- **File Group block** (`file-group`): a placed block that renders its members as
  a card or list and supports creating new groups via the top-bar "File Group"
  button. Group view (card/list) persists in block data and survives reload.
- **Drop files onto a group** to add memberships: dropped files are imported as
  `file` blocks (placed on the canvas) and added as group members via the
  `memberships` collection; the FK race rule (`await tx.isPersisted.promise`)
  applies to both file and group inserts.
- **Remove from board** on a group unplaces the group but keeps memberships,
  so re-placing the group restores its member cards/list. **Delete group**
  (two-step confirm) drops memberships; member placements survive.
- **Rename group** via an editable name input in the Inspector (commits on blur
  or Enter). **Member click** selects the underlying placed file block without
  selecting the group.
- **Guard:** File Groups hold only files in v1 — the client dedupes
  memberships and the DB enforces a unique `(group_id, member_id)` index.
- Verified in the browser: create → drop 2 files → toggle card → list shows
  members → Inspector shows "2 files in this group" → rename → remove from
  board (memberships preserved) → re-place restores members → delete group
  (two-step) leaves file placements. `npm run tsc`, `npm run lint`, and
  `npm run build` pass.

## 2026-09-02 — Canvas tools rework: marquee select, panning, cursors

- **Move tool** is now exclusively select/drag: dragging from empty canvas draws
  a **box (marquee) select** and selects every block intersecting the box; empty
  click deselects. Plain click selects one; ctrl/cmd/shift-click toggles.
  Multi-select ripples through the chain — Inspector shows "N blocks selected"
  with per-kind counts, and Layers rows highlight alongside canvas shells.
- **Panning** is restricted to the Hand tool, holding **Space** (temporary pan
  in any tool), and **middle-mouse** drag. Move-tool empty-drag no longer pans.
- **Text tool** always activates on `T` (no more toggle), so consecutive clicks
  at different spots create multiple text blocks.
- **Escape** returns to the Move tool and clears the selection.
- Per-tool cursors: default arrow over empty canvas, `grab` over blocks and in
  the Hand tool, `grabbing` while panning, text-insert cursor in the Text tool.
- Shortcut hint in the top bar: `V Move · H Hand · T Text · Space pan`.
- Verified in the browser: marquee selected 15 blocks with Inspector summary,
  ctrl-click toggle, Hand/Space/middle-mouse pans update the transform, Text
  stays active and places committed blocks (count rose in lockstep), Esc resets.
  `npm run tsc`, `npm run lint`, and `npm run build` pass.

## 2026-09-02 — In-place Figma-style text editor

- The text-block editor is now an **in-place transparent editor** instead of a
  boxed card: borderless, transparent, no padding/glow, with only the blinking
  caret visible and a Figma-style selection outline around the text extent while
  editing. The textarea auto-grows to match the rendered content's height, so
  entering and leaving edit mode does not shift or clip the text.
- Enter still commits and Escape cancels (commit-on-blur unchanged).

## 2026-09-02 — M4 file blocks + paste, FK race fix

- **File blocks:** dropped or picked files become `file` blocks storing metadata
  (name, size, mimeType) via `makeFileBlock`, rendered as a file card with a
  mimetype colour chip, name, and formatted size (`formatBytes`).
- **Import surface:** a "Paste files" button + hidden multi-file picker in the
  top bar, plus a canvas drop zone (`onDragEnter/Over/Leave/Drop`) that highlights
  the canvas while a drag is over it and anchoring the cascade placement at the
  drop point (or the m2 screen corner for the picker).
- **Cascade placement:** imported files are auto-placed on a `GRID_SPACING` grid
  fanning out from the anchor, and the first file is selected.
- **Schema hardening:** `BlockSchema.superRefine` asserts `block.kind` matches
  `data.kind`, so a mismatched block insert is rejected instead of silently
  accepted.
- **Plain-text (Figma) text blocks:** text blocks render as bare grey text with
  no card chrome/border/background/padding; only the selection outline shows.
  Double-click still enters in-place edit.
- **Fixed a placement FK race:** `collection.insert()` returns a `Transaction`
  whose `await` only settles the optimistic local write, not the server commit.
  Because a placement row references the block row (`block_id → blocks.id`),
  inserting block+placement back-to-back let the placement POST race ahead and
  fail the FK check, silently dropping placement rows (23 placements for 28
  blocks in the DB). Creation paths now `await tx.isPersisted.promise` on the
  block insert before inserting the placement, serializing the writes so the
  placement always commits. Verified in the browser: block commits first, then
  placement, and placed count now rises in lockstep with total.
- Verified in the browser: drop/pick of multiple files creates blocks and
  renders file cards on canvas, placed count matches total. `npm run tsc`,
  `npm run lint`, and `npm run build` pass.

## 2026-09-02 — Figma-style chrome + zoom-aware dot grid

- Replaced the floating pill UI (top-right brand card, floating library dock,
  floating zoom cluster) with a docked Figma-like chrome: full-width top bar
  (brand + theme toggle + shortcut hints), a left vertical tool rail, a left
  Layers/Assets dock, a right Inspector, and a bottom status bar with the zoom
  cluster and block counts.
- **Tools:** Move (V) / Hand (H, or hold Space) / Text (T). The Move tool drags
  blocks and pans the canvas; the Hand tool pans from anywhere (including on
  blocks); the Text tool drops a new text block where you click, then selects it.
- **Selection:** clicking a block selects it (Figma-style highlight ring);
  clicking empty canvas deselects. The Inspector shows the selected block's kind,
  title, editable X/Y position (commits through the placement collection), ID,
  and schema version. The Layers tab lists placed blocks (click to select), the
  Assets tab lists unplaced blocks with a Place action.
- **Dot grid is now zoom-aware (Figma behaviour):** a screen-space grid layer
  whose spacing snaps to "nice" steps (1/2/5 × 10ⁿ world units) per zoom level and
  whose background-position tracks the viewport offset modulo the on-screen step,
  so the dots pan seamlessly and hold constant density instead of scaling.
  Grid geometry updates on the same rAF hot path as the world transform
  (`usePanZoom`) and on committed viewport changes.
- Verified in the browser: layout geometry of all five chrome regions, tool
  switching + shortcuts, text-tool placement, selection + inspector + X/Y edit,
  deselect on empty click, zoom re-snap (50px → 27px at 135%), and pan-gird
  tracking. `npm run lint` and `npm run build` pass.

## 2026-09-02 — Product-route cleanup

- Promoted the working canvas from `/demo/m2` to the root `/` route.
- Removed the default Start home/about pages, sample Query/Drizzle/chat/M1 routes,
  their supporting components and hooks, starter header/footer, and sample asset.
- Replaced the starter README and favicon with Kho-ja project equivalents.
- Removed unused Typography/tsx development dependencies and pruned demo-only CSS.

## 2026-09-01 — M3 complete (text block render + in-place edit)

- Added `BlockRenderer` and a text-block view/editor on the infinite canvas.
- Added safe `@tanstack/markdown/react` rendering for headings, lists, bold,
  `*italic*` / `_italic_`, inline code, and the library's wider syntax profile.
- Text blocks enter edit mode on double-click. Enter commits through the existing
  TanStack DB collection → server function → Postgres path; Escape or blur cancels.
- Removed the renderer/shell runtime import cycle and kept non-text rendering behind
  the renderer switch for the next block kinds.
- Verified in the browser: formatted render, deterministic Escape cancellation,
  Enter persistence across a full reload, and restoration of the original test data.
  `npm run lint` and `npm run build` pass.

## 2026-09-01 — M2 complete (infinite pan/zoom/drag canvas)

- **M2 — Infinite canvas with pan/zoom + free-floating draggable blocks** (per
  START_PLAN.md §M2), verified end-to-end in the browser:
  - `src/lib/canvas/transform.ts`: world↔screen math (`worldToScreen`,
    `screenToWorld`, `matrix`), pan/zoom-at-cursor, viewport culling
    (`visibleWorldRect`, `rectsOverlap`), scale clamping.
  - `src/components/canvas/ViewportProvider.tsx` (`useViewport`) holds the
    viewport transform as React state (cold); `usePanZoom` keeps the hot path
    (pan/zoom frames) in refs + `requestAnimationFrame` direct-DOM writes and
    commits to state on gesture end (per the locked rendering direction).
  - `Canvas.tsx`: dot-grid world container inside a transformed viewport div;
    blocks only translate via the container transform (no per-frame block
    re-render). Off-viewport blocks are culled.
  - `BlockShell.tsx`: pointer-capture drag in world coordinates (scaled by the
    viewport), commits the new `position_x/y` to the `placements` collection on
    drag-end → server fn → Postgres.
  - `src/routes/demo/m2.tsx`: canvas demo — add/place/drag text blocks, pan, zoom
    (wheel + buttons), viewport HUD, unplaced-blocks panel.
  - Verified: pan (via pointer), zoom (wheel + buttons), drag (+100/+60),
    culling (2/3 placed visible), and **position persists across reload**
    (DB-confirmed `position_x=250, position_y=140`).
- Found usages are docs-first and follow the plan's file layout
  (`src/lib/canvas/*`, `src/components/canvas/*`).
- **Docs:** ROADMAP/DEVELOPMENT/ARCHITECTURE updated for M2 completion.

## 2026-09-01 — M0 + M1 complete (TanStack Start + Postgres data path)

- **M0 — Scaffold.** Migrated to the full-send TanStack Start structure
  (`src/routes/`, `src/router.tsx`, root provider with QueryClient + collections),
  removed the provisional scaffold leftovers, added Drizzle + `pg` deps, fixed the
  Windows scaffold quirks, and verified `dev` / `build`.
- **M1 — Data path foundation** (per START_PLAN.md §M1), all verified end-to-end:
  - Drizzle schema in `src/db/schema.ts`: `blocks`, `placements`, `memberships`,
    `types`, `views` (typed jsonb, `schema_version` default `'1'`, cascade FKs);
    applied to local `kho_ja` via `drizzle-kit push` (no drift).
  - Singleton Drizzle/pg client (`src/db/client.ts`, `src/db/index.ts`) — server-only.
  - Server-only query helpers in `src/db/queries.server.ts`, wrapped by thin
    `createServerFn`s in `src/db/queries.functions.ts` (list/insert/update/delete
    per table). Verified the `pg` Pool does not leak to client bundles.
  - Per-table TanStack DB QueryCollections (`src/collections/{blocks,placements,
    memberships,types,views}.ts`, composed in `index.ts`) with live queries +
    optimistic mutations, provided to the router context in the root provider.
  - Shared domain types (`src/types/`) and Zod schemas (`src/types/schemas.ts`);
    fixed the Object-block zod union issue (discriminated union → `z.union`).
  - Verification: blocked insert via `useLiveQuery`, round-trip to Postgres,
    persisted across reload (`src/routes/demo/m1.tsx`).
- **Tooling:** added ESLint 9 flat config (`eslint.config.js`) + `npm run lint`
  (zero errors/warnings) — closes the missing `lint` gate from the verify checklist.
- **Docs:** ROADMAP/DEVELOPMENT/ARCHITECTURE updated for M0/M1 completion.

## 2026-08-31 — Project inception & planning

- Established the project vision and guiding principles (visual project-knowledge
  platform, canvas-first, working software over architecture).
- Agreed key strategic decisions (recorded in DECISIONS.md):
  - Canvas-first development order (block/canvas model before auth/DB).
  - Custom canvas (Canvas API + pan/zoom) rather than a canvas library.
  - Product-first, extract a shared npm package only after a stable core exists.
  - Scope deliberately held back; build slowly over months.
- Created `docs/`: README, ARCHITECTURE, ROADMAP, DECISIONS, DEVELOPMENT, CHANGELOG.
- Added **[DESIGN.md](./DESIGN.md)** — a working analysis of the core
  knowledge-model questions (block model, typed connections, multi-view
  semantics) with options, trade-offs, and leans. This is the current focus: we
  are finalizing the plan and design before writing real implementation code.
- Provisionally scaffolded a Vite + React + TypeScript app at the repo root to
  validate tooling (Node 24, npm, oxlint). This scaffold is a **placeholder** and
  will be reworked against the locked plan.

### Process note (important for future sessions)

Implementation code (a provisional canvas prototype under `src/`) was written
before the plan was finalized, which was a mistake — the user explicitly wanted the
docs/plan perfected first. We corrected course to **docs-first**: the design and
plan are the source of truth; the scaffold is provisional. Rule going forward:
finalize the core design (DESIGN.md) and decisions before writing real code.

### Design refinements (grilling, same date)

- **Relationships settled** in DECISIONS.md / DESIGN.md §2:
  - v1 connection type set: `depends-on`, `responsible-for`, `part-of`, `related-to`.
  - Direction is **normalized** (one canonical direction per type), not stored as
    drawn — enables search/AI traversal.
  - Many-to-many, multiple typed edges allowed between a pair; edges carry minimal
    optional data; `related-to` is the only symmetric type.
- **Block model pivoted to user-definable schemas** (DECISIONS.md, DESIGN.md §1):
  - Block types are no longer a fixed set — users compose types from **fields**,
    "infinitely expandable like Notion."
  - "Object" is a **preset**, not a universal base. Other presets: `file`,
    `file-group` (a container you paste files into — no rows/columns).
  - **Dropped** the Person/Feature/API proving set (too abstract, would be
    special-cased). The generic schema system is the real deliverable; `file` /
    `file-group` are the first concrete types.
- **v1 relationships de-scoped to simple lines (later in same session):**
  - Users think in folders/groups/relations, **not arrows**. v1 ships a simple
    optional "link with a line" (untyped) plus hidden **group membership** (pasting
    files into a File Group); a File Group is a view-based "special folder"
    (renders members as card/list per view), and files can belong to multiple
    groups (many-to-many).
  - **Typed connections** (`depends-on`, `responsible-for`, `part-of`,
    `related-to`, normalized direction, many-to-many edge data) are preserved as a
    **future power feature** — consciously deferred out of v1. The
    "Person/Feature/API validation" decision was formally marked **superseded**.
- **Remaining v1 decisions from grilling:**
  - **Schema evolution is data-safe (Notion-like):** never destroy user data when
    a type/field is edited or deleted.
  - **v1 files are references/metadata only** — no real content bytes/preview yet.
  - **The interaction milestone = model + reference grouping**, i.e. paste file
    refs → group into a File Group → switch card/list view; not just dragging cards.
- **Structural refinements (later in same session):**
  - **One canonical block per thing** — placements and group memberships are
    references, never copies.
  - **File Group is itself a block** that contains members (positioned like any
    block, not a "parent" abstraction).
  - **Two states only: placed / not placed** — no separate trash. Removing from the
    board keeps content in the side panel (all types); explicit delete is permanent.
  - **File Groups hold only files in v1** — generic containers deferred.
  - **Views**: type-level default + per-block overrides; reusable named views.
  - **Uniform capabilities** across all block types (preset or user-defined) — the
    uniform-primitive architecture; `file`/`file-group` are presets, not privileged.
- **Correction + further refinements (GRILL 35–38):**
  - **CORRECTED "total uniformity":** not every block is schema-driven. Two kinds
    of types **coexist**: first-class **default types** (`file`, `file-group`, more
    later) and **custom schema-driven types** (via an "object"-style schema). The
    type system does NOT count for every block.
  - **v1 paste-files** = real file picker / drag-drop reading only **metadata**
    (name/size/type); no bytes stored.
  - **File Group members are read-only** within the group (provisional); editing
    targets the canonical file block.
  - **Side panel = view-based browser** (reuses card/list view system), not a flat
    list.
- **Type-system shape pinned (GRILL 39–42):**
  - **`text` is a first-class default** in v1 — v1 defaults = `file`, `file-group`,
    `text`. (100% confirmed.)
  - **Schema system + custom `object`-type creator ARE in v1** (option b): users can
    define a custom object schema and place instances.
  - **Uniform base + layered defaults:** all types share placement/library/views;
    defaults add code-backed behavior; custom schema types are fields-only.
  - **Uniform UX, with per-type affordance (GRILL 42, accepted with nuance):**
    uniform base experience (place/drag/group/edit path) but presentation + edit
    can vary per type (e.g. `text` = in-place Figma-style double-click edit; BG may
    be absent on text by default). v1 uses a more generic edit path.
- **Board shape & scope (GRILL 43–46):**
  - **Free-floating blocks** on an infinite canvas; Figma-like auto-snap is a
    **future** feature — do not scaffold for it in v1.
  - **Membership & placement are independent:** a block can be in many groups, zero
    groups, and placed standalone, all at once (canonical/reference model).
  - **Deleting a File Group unplaces the group AND its members** back to the library
    (GRILL 45 chose cascade, differing from the lean).
  - **Single board in v1**, but board/project is a first-class unit for later
    multi-project navigation.
- **Final UX/scope decisions (GRILL 47–49):**
  - **Group deletion is reference removal (GRILL 47 = a):** deleting a group only
    drops that membership; members with independent placements keep them; only
    members with no other refs become unplaced. Resolves the GRILL 45 cascade seam.
  - **`text` is rich text (GRILL 48 = c):** partial markdown subset (bold/italic/
    headings/lists).
  - **Create & edit on the board (GRILL 49 = a):** new blocks land on the canvas and
    also appear in the side panel.
- Setup decisions from grilling:
  - Rendering direction: **DOM/React blocks + viewport transform + culling + memo**;
    canvas/overlay for grid, edges, selection (guardrails recorded in DECISIONS.md).
  - **Nodes are pointers, not content** — assets persist in a side panel/library;
    deleting a node never deletes the content (README updated: project = asset
    library + board, not board alone).
  - Scope held: interaction-first validation (persistence deferred, per grilling).
- **Tech stack decision (TanStack, full send) + scope reversal:**
  - User chose **full TanStack for v1**: TanStack Start (server) + Router + Query +
    TanStack DB (QueryCollection) + Drizzle ORM + **PostgreSQL** (local, already
    installed).
  - **REVERSED** earlier "in-memory first / no backend / persistence deferred" v1
    scoping. v1 now has a **client + server + Postgres** architecture. OQ-13
    (persistence/versioning) is on the critical path.
  - Verified via research: TanStack DB **QueryCollection** (v1.2.x, post-1.0) binds
    reactive live-queries + optimistic mutations to Start server functions → Drizzle →
    Postgres. **No ElectricSQL needed** for v1 (only for future realtime multi-user).
    Risk rated Medium-Low; Start is RC, DB core is 0.x. Windows scaffold quirk noted.
  - START_PLAN rewritten: server/DB-first milestones (M0 scaffold → M1 DB+data path
    foundation → M2–M8 canvas/model/interaction on top).
  - Artifacts: `docs/START_PLAN.md` (full-stack) and `docs/BUILD_QUESTIONS.md`
    (build-time questions for the original SPA framing — still useful for the model
    engine and canvas layers).
