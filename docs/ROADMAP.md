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
  reload. See START_PLAN.md §M2 and `src/routes/demo/m2.tsx`.

## In progress

- **Design / planning phase (docs-first).** Finalizing the core knowledge-model
  design — schema-driven user-defined block types, typed relationships, and
  multi-view semantics — in [DESIGN.md](./DESIGN.md), and settling the open
  questions in DECISIONS.md. The current code scaffold is provisional and will be
  reworked against this plan.

## Next (in rough order)

0. **M3 — Text block (render + in-place edit).** `TextBlockData { markdown }`;
   hand-rolled markdown-subset parser; double-click editor; `BlockRenderer`
   switch; update round-trips to the server fn / Postgres (block-editing path on
   the M2 canvas). Verify: dbl-click → edit → Escape → formatted render; persists.
   See START_PLAN.md §M3.

1. **M4 — File blocks + paste (drag-drop + hidden input).** See START_PLAN.md §M4.

2. **The generic schema system** — block types defined by composed fields (with
   `file` / `file-group` as the first preset types), rendered on a pan/zoom canvas
   (in-memory). **Milestone = model + reference grouping, not just dragging:** paste
   file **references** → group them into a File Group → switch card/list view.
   (Per DECISIONS.md, v1 files are references/metadata only — no real preview yet.)
3. **v1 relationships** — simple "link with a line" between blocks, plus **group
   membership** made by pasting files into a File Group (a File Group renders its
   members as card/list per view). Many-to-many: a file can belong to multiple
   groups.
4. Save/load of the canvas layout (see OQ-13 schema versioning).
5. The side-panel / asset library, and how group membership is stored (OQ-10).

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
