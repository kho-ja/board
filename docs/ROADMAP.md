# Roadmap

Separated into **Completed / In progress / Next / Future ideas**. We do not claim
things are done before they are done.

## Completed

- Planning session: agreed product vision, guiding principles, and the major
  strategic decisions (canvas-first, custom canvas, product-before-package,
  held-back scope). See DECISIONS.md.
- Finalized the core knowledge-model design and decisions in docs-first
  fashion. See DESIGN.md and DECISIONS.md.
- **M0 — TanStack Start scaffold:** migrated the provisional Vite scaffold to
  full-send TanStack Start (Router + Query + DB), added Drizzle + pg deps,
  fixed the Windows scaffold quirks, verified `dev`/`build`. See START_PLAN.md.
- **M1 — Postgres schema + server functions + reactive collections (data
  path foundation):** Drizzle tables (`blocks`, `placements`, `memberships`,
  `types`, `views`, `schema_version`) pushed to local `kho_ja`; singleton DB
  client; server-only query helpers (`queries.server.ts`) behind `createServerFn`
  wrappers (`queries.functions.ts`); TanStack DB QueryCollection per table
  (live queries + optimistic mutations); ESLint toolchain added; verified
  seed → `useLiveQuery`, optimistic update → Postgres, persistence across reload.
  See START_PLAN.md §M1.
- **M2 — Infinite canvas with pan/zoom + free-floating draggable blocks:**
  `transform.ts` (world/screen math + culling), `ViewportProvider`/`useViewport`,
  `usePanZoom` (hot path in refs + rAF direct-DOM writes, cold commit on gesture
  end), `Canvas` (dot grid + transformed world div), `BlockShell` (pointer-capture
  drag, scaled world delta). Blocks read from `blocks`/`placements` collections;
  drag-end commits position to Postgres; off-viewport blocks are culled. Verified:
  pan, zoom (wheel + buttons), drag, culling (2/3 visible), persistence across
  reload. See START_PLAN.md §M2 and `src/routes/index.tsx`.
- **M3 — Text block (render + in-place edit):** `BlockRenderer` switch,
  safe `@tanstack/markdown/react` rendering and a double-click textarea editor.
  Enter persists through TanStack DB/server functions/Postgres; Escape or blur
  cancels. Verified formatted rendering, cancellation, and persistence across
  reload. See START_PLAN.md §M3.
- **Chrome — Figma-style docked UI:** top bar, tool rail (Move/Hand/Text), left
  Layers/Assets dock, right Inspector (editable X/Y), bottom status bar, block
  selection + highlights, and a zoom-aware dot grid that re-snaps per zoom. See
  CHANGELOG 2026-09-02.
- **M4 — File blocks + paste:** "Place files" button + hidden multi-file input in
  the top bar, plus a canvas drop zone; dropped/picked files become `file` blocks
  (metadata only) rendered as file cards, auto-placed in a cascade grid, with the
  first selected. Text blocks render plain-text Figma-style. Also fixed a
  placement FK race by awaiting `tx.isPersisted.promise` on the block insert
  before inserting the placement. See CHANGELOG 2026-09-02.
- **M6 — File Groups:** generic schema system + reference grouping: `file-group` block on
  canvas with create, drop-file-to-add (membership CRUD), card/list view toggle
  (persisted), rename, remove from board (memberships preserved for re-place),
  delete (memberships dropped, member placements survive). Tested: persistence,
  re-place restores members, member click selects underlying placed file, two-step
  delete confirm.
- **M7 — Custom Object Types & Schema Editor:** schema definition modal (`types` table),
  dynamic field types (`text`, `number`, `boolean`, `date`), block instances (`object` kind),
  type-specific card rendering, in-place field value editing in Inspector, dynamic Types tab
  in LeftDock with instance creation.
- **M8 — Integration Polish & Canvas UX:** action-based undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z`),
  marquee selection, batched unplace and permanent delete with cascade cleanup, clipboard paste
  support for OS files and markdown text directly centered on viewport, keyboard hotkeys
  (`V`, `H`, `T`, `A`, `Space`, `Del`, `Esc`).
- **Asset Management & Category Sorting:** automatic file categorization (`Images`,
  `Documents`, `Code & Data`, `Media`, `Notes & Text`, Custom Types), category section
  dividers and badges in Assets dock, 6 sort modes with Category default, keyboard shortcuts
  (`A` toggle dock, `S` cycle sort, `↑`/`↓` navigate, `Enter` place, `Del` delete), and
  explicit "Place files" affordances in both top bar and Assets dock.

## Completed

- **M9 — v1 Relationships ("Link with a Line"):** simple, untyped visual connections
  between blocks. Added `links` table with foreign-key cascades in Postgres, TanStack DB
  reactive `linksCollection`, SVG bezier curve routing (`LinksLayer`), interactive cardinal
  port handles on blocks, Connector Tool (`C` hotkey) with live animated draft preview,
  real-time line re-routing during drag, link selection/inspection, cascade deletion, and
  full undo/redo integration.
- **Link anchors track live block size:** `getBlockRect` no longer assumes fixed block
  dimensions — a `ResizeObserver` size cache keeps connection ports glued to
  `max-content` text blocks and every other kind.
- **M10 — Multi-Block Group Drag & Layout Tools:** dragging a block inside a
  multi-selection moves all selected placements together (single undo step);
  Inspector align (Left/Center/Right/Top/Middle/Bottom) and distribute (H/V)
  actions, each atomic in the undo stack. Verified: marquee-select 3 → drag one
  → all move with offsets → `Ctrl+Z` reverts all 3.
- **M11 — Board Serialization & Export / Import:** one-click versioned JSON
  export of the full board; validated import that replaces the board in one
  undoable action (wipe → restore, FK-ordered); 2x PNG snapshot of the content
  bounds with cards, text, and link curves. Verified: export → modify → import
  → exact state restored → undo/redo round-trip; malformed files rejected with
  the board untouched.
- **M12 — Spatial Mini-Map & Quick Navigation:** corner overview with live
  block dots and a viewport box; click/drag pans the board, `M` toggles.
  Verified: click centers, drag pans 1:1, dots track drags with a frozen frame.
- **M13 — Typed Connections & Edge Labels:** `related-to` (symmetric, generic
  fallback), `depends-on`, `responsible-for`, `part-of` (directed — the drawn
  arrow expresses the meaning). Connector-tool picker for the pending type,
  per-type colors + arrowheads, semantic dedupe (same pair may carry many
  typed edges; only a same-type same-direction duplicate is a no-op), optional
  edge labels, Inspector Type select / Label field with undo/redo, JSON export
  v2 (+ v1 upgrade), and PNG per-type rendering. Verified live: typed drags,
  dedupe rules, Inspector edits persisting to Postgres, undo/redo round-trip.
  (After M13: fixed connection lines being unselectable — the marquee was
  swallowing link clicks, `a794afa`.)
- **M14 — Board Search (Ctrl/Cmd+K):** search palette over all block content
  (titles, text markdown, object field keys/values, file and group names)
  with substring + multi-word matching, ranked title/prefix-first. Selecting a
  result pans the board to center the block and selects it; unplaced blocks are
  discovered and placed at the view center. Verified live: palette toggling,
  real queries over file/text/group blocks, arrow-key navigation, Enter/Esc.

## In progress

- **M15 — Ask, the AI assistant:** agentic chat over the whole board in the left
  dock ("Ask" tab). Multi-provider (OpenAI / OpenRouter / Ollama / custom
  OpenAI-compatible), per-provider model choice, and API-key management stored
  AES-GCM encrypted at rest (dev fallback plaintext without `AI_ENCRYPTION_KEY`).
  Tools: `board_context` (read-only snapshot of blocks/connections/types/
  memberships), `board_create_blocks` and `board_connect_blocks` (mutation,
  gated behind per-call user approval). Working tree, uncommitted.

## Next (in rough order)

- **The v1 canvas scope from START_PLAN is complete.** The consciously deferred
  power features remain — real-time collaboration, and AI agents that answer
  questions about structured board data — along with hardening and the eventual
  public package (product-first, package-later).

## Future ideas (do not pretend these exist yet)

- Authentication (login) — deferred deliberately; "anyone can use freely" was
  raised, but login is not a v1 requirement.
- Backend + local PostgreSQL + persistence ("one board = one project").
- Real-time collaboration (accepted as eventually desirable, "too hard" for now).
- AI agents that answer questions about the project's real structured data and
  generate/connect blocks.
- A publishable npm package to build a community — extracted only *after* a
  stable, proven core exists (product-first, package-later).

## Notes on scope

We are intentionally holding back. This is a months-long project meant to be built
"perfectly, slowly, little by little." Over-scoping is a known risk; we guard
against it by keeping v1 narrow and expanding iteratively.
