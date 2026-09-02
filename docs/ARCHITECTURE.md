# Architecture

> Status: **M0–M3 implemented.** TanStack Start, the Postgres data path, the
> pan/zoom/drag infinite canvas, and text-block rendering/editing are in place and
> verified. M4 (file blocks + paste) is next per START_PLAN.md.

## Current state

- TanStack Start scaffold (React 19, Vite via Start) with `src/routes/` file-based
  routing, TanStack Query + DB collections wired in the root provider.
- M1 data path complete and verified: Postgres `kho_ja` DB with `blocks`,
  `placements`, `memberships`, `types`, `views` tables; server-only Drizzle query
  helpers (`src/db/queries.server.ts`); `createServerFn` wrappers
  (`src/db/queries.functions.ts`); per-table QueryCollections
  (`src/collections/*`). Reading via `useLiveQuery`, mutations are optimistic and
  persist to Postgres on reload.
- M2 infinite canvas complete and verified: `src/lib/canvas/transform.ts`
  (world/screen math, culling), `ViewportProvider`/`useViewport`,
  `usePanZoom` (hot path in refs + rAF direct-DOM writes, cold commit on gesture
  end), `Canvas` (dot-grid world div + transformed container), `BlockShell`
  (pointer-capture drag). The board is the root route at `src/routes/index.tsx`.
- M3 text blocks complete and verified: `BlockRenderer` selects the block view;
  `TextBlockView` renders through `@tanstack/markdown/react`; double-click opens the
  textarea editor; Enter persists through the blocks collection and Escape/blur
  cancels.
- The documentation is the source of truth for the roadmap: see ROADMAP.md (scope)
  and DECISIONS.md + DESIGN.md (decisions and the core knowledge-model design).

## Direction (from planning)

- **Canvas-first.** The canvas and block model are the highest-risk, most
  differentiating deliverable and should be built first, with in-memory/local
  data, before adding persistence, auth, or collaboration.
- **Custom canvas.** We plan a custom canvas (Canvas API + pan/zoom), not a canvas
  library, for maximum control. This is a deliberate trade-off (more work, more
  control).
- **Block model.** **Schema-driven, user-definable block types** (a type is a
  named set of fields; "object"/`file`/`file-group` are presets), with switchable
  **views** (projections over a canonical shape). **v1 relationships** are simple
  untyped "link with a line" plus hidden **group membership**; typed connections
  are a future power feature. The detailed working design (options, trade-offs) is
  in [DESIGN.md](./DESIGN.md).
- **Monorepo** rooted at the repository root. The exact workspace flavor
  (pnpm workspaces vs. a single app with clean module separation) is an *open
  question* — see DECISIONS.md (OQ-6).
- **Future-only** (not in v1): authentication, real-time multi-user collaboration,
  ElectricSQL sync, indexed search, AI agents, a publishable npm package, typed
  connections (see DECISIONS.md).

## Stack (full-send TanStack, client + server + PostgreSQL)

- **Client (React 19):** TanStack Router (file-based, single route for the board) +
  TanStack Query + **TanStack DB (QueryCollections)** as the reactive store —
  `blocks`, `placements`, `memberships`, `types`, `views` collections with
  `useLiveQuery` + optimistic mutations.
- **Server (TanStack Start):** `createServerFn` server functions (SSR, Vinxi/Nitro).
  Server-only code in `.server.ts` / inside server functions; DB credentials never
  reach the client.
- **DB:** Drizzle ORM + `pg` driver → **PostgreSQL** (local). Tables mirror the
  collections: `blocks`, `placements`, `memberships`, `types`, `views`,
  `schema_version`. QueryCollection binds client collections to server functions;
  **no ElectricSQL** needed for v1.
- **Hot/cold perf split:** TanStack DB holds the cold model + derived live queries;
  the per-frame viewport transform / active drag stay in refs + `requestAnimationFrame`
  + direct DOM writes, committing back to the DB on drag-end.

## Data model (v1 working direction — see DESIGN.md)

The full design space (options, trade-offs, lean) is in [DESIGN.md](./DESIGN.md).
v1 working summary:

```text
BlockType  # user-definable (schema-driven) type: a named set of fields
  name, fields: Field[]
Block      # an instance of a BlockType (custom, schema-driven) OR a default,
           # built-in type; one canonical block per thing
  id, type, position (x, y), view, values: { [fieldName]: value },
  placed: boolean        # derived: a row exists in the placements table

Link       # v1: a simple optional line between two blocks (untyped)
  id, blockA, blockB
Group      # e.g. File Group (file-only in v1): holds member references
  membership stored under the hood (many-to-many)
```

**Key structural rules (see DECISIONS.md):**
- One canonical block per thing; canvas placements and group memberships are
  **references**, never copies.
- Blocks are **placed / not placed** (no separate trash state); the side panel is a
  type-generic library holding every block type.
- **Two kinds of types coexist:** first-class **default types** (`file`,
  `file-group`, `text`) and **custom schema-driven types** (via an "object"-style
  schema). The schema **creator is in v1**; the type system does NOT count for
  every block (defaults coexist alongside it).
- **Uniform base + layered defaults:** all types share placement, library
  (placed/not-placed), and views; defaults add code-backed behavior; custom schema
  types are built from fields only. UX is uniform in the base (place/drag/group/
  edit) but presentation + edit affordance can vary per type (e.g. `text` edit is
  in-place, Figma-style double-click; BG may be absent on text by default).
- Shared capabilities (placed/not placed, library, views) apply to all types, but
  type *definition* is not uniform — defaults can be code-backed first-class blocks.
- Views are user-editable option-sets; type-level defaults + per-block overrides.
- The side panel is a view-based browser (reuses the card/list view system), not a
  flat list.
- **Free-floating blocks** on an infinite canvas (no auto-arrange/snap in v1;
  Figma-like snap is a future feature — do not scaffold for it).
- **Membership and placement are independent:** a block can be in many groups, zero
  groups, and placed standalone, all at once (canonical-block/reference model).
- **Deleting a File Group** removes only that membership reference; members with
  independent placements (standalone / other groups) keep them, members with none
  become unplaced (see DECISIONS.md).
- **Single board in v1**, but board/project is a first-class unit for later
  multi-project navigation.

> Note: the earlier `Connection { source, target, type }` (typed, directed) is the
> **future** model for queryable knowledge-graph traversal — deferred out of v1.


## External services

None yet.
