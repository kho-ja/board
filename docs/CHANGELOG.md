# Changelog

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
