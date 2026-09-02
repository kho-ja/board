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
- **M4 — File blocks + paste:** "Paste files" button + hidden multi-file input in
  the top bar, plus a canvas drop zone; dropped/picked files become `file` blocks
  (metadata only) rendered as file cards, auto-placed in a cascade grid, with the
  first selected. Text blocks render plain-text Figma-style. Also fixed a
  placement FK race by awaiting `tx.isPersisted.promise` on the block insert
  before inserting the placement. See CHANGELOG 2026-09-02.

## In progress

- Nothing currently blocked — next work item below.

## Next (in rough order)

0. **Generic schema system / group creation** — block types defined by composed
   fields (with `file` / `file-group` as the first preset types), rendered on a
   pan/zoom canvas (in-memory). **Milestone = model + reference grouping, not just
   dragging:** paste file **references** → group them into a File Group → switch
   card/list view. (Per DECISIONS.md, v1 files are references/metadata only — no
   real preview yet.)
2. **v1 relationships** — simple "link with a line" between blocks, plus **group
   membership** made by pasting files into a File Group (a File Group renders its
   members as card/list per view). Many-to-many: a file can belong to multiple
   groups.
3. Save/load of the canvas layout (see OQ-13 schema versioning).
4. The side-panel / asset library, and how group membership is stored (OQ-10).

> **Typed connections** (`depends-on`, `responsible-for`, `part-of`, `related-to`)
> are consciously **deferred out of v1** — they become an optional power feature
> later. The full design is preserved in DECISIONS.md and DESIGN.md §2.

> Earlier "proving set" note: the Person/Feature/API-first idea was **dropped**.
> Under the schema-driven model those become example presets, not built-in code;
> the generic schema system is the actual deliverable.

## Future ideas (do not pretend these exist yet)

- Authentication (login) — deferred deliberately; "anyone can use freely" was
  raised, but login is not a v1 requirement.
- Backend + local PostgreSQL + persistence ("one board = one project").
- Real-time collaboration (accepted as eventually desirable, "too hard" for now).
- Indexed / full-text / semantic search across block content.
- AI agents that answer questions about the project's real structured data and
  generate/connect blocks.
- A publishable npm package to build a community — extracted only *after* a
  stable, proven core exists (product-first, package-later).

## Notes on scope

We are intentionally holding back. This is a months-long project meant to be built
"perfectly, slowly, little by little." Over-scoping is a known risk; we guard
against it by keeping v1 narrow and expanding iteratively.
