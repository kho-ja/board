# kho-ja v1 START PLAN (full-stack TanStack)

> Scope: locked content model → shippable increments. **Client + server + PostgreSQL in v1.**
> Stack: **TanStack Start** (server functions, SSR, Vinxi/Nitro) + **TanStack Router** +
> **TanStack Query** + **TanStack DB QueryCollection** + **Drizzle ORM** + **`pg`** + **PostgreSQL**.
> Toolchain: React 19, Vite 8 (via Start), TS, npm, ESLint (from scaffold). Scripts: `dev`, `build`, `start`, `lint`.
> Stack decision: full-send TanStack (see DECISIONS.md); no persistence deferral.

## 1. Recommended Repo / Package Layout

**Single app** (TanStack Start convention). Server-only code in `.server.ts` / inside
server functions; client-safe code elsewhere. `types/` + `engine/` remain the future
extraction boundary.

```
kho-ja.board/
  src/
    routes/
      __root.tsx                    # root layout: providers (QueryClient, DB), shell
      index.tsx                     # the board (single route for v1)
    router.tsx                      # TanStack Router factory
    routeTree.gen.ts                # auto-generated (do not edit)

    db/
      index.ts                      # Drizzle + pg Pool singleton (server-only)
      schema.ts                     # table definitions (blocks, placements, memberships, types, views)
      queries.functions.ts          # createServerFn wrappers (safe to import anywhere)
      queries.server.ts             # DB query helpers (server-only)

    collections/                    # TanStack DB QueryCollections (client reactive)
      blocks.ts, placements.ts, memberships.ts, schemas.ts, views.ts

    types/                          # shared domain types
      ids.ts, block.ts, schema.ts, view.ts, membership.ts, link.ts, board.ts, index.ts

    engine/                         # pure logic, no React
      id.ts, board.ts, block.ts, schema.ts, view.ts, membership.ts, placement.ts, index.ts

    canvas/                         # infinite canvas (React)
      Canvas.tsx, ViewportContext.tsx, transform.ts, BlockRenderer.tsx,
      useCulling.ts, usePanZoom.ts, GridOverlay.tsx, SelectionBox.tsx

    blocks/                         # per-type rendering + edit affordance
      file/ (FileCard, FileListRow, FileEditPanel)
      file-group/ (FileGroupCard, FileGroupList, FileGroupEditPanel)
      text/ (TextBlock, TextEditor, markdown.ts)
      object/ (ObjectCard, ObjectEditPanel)
      shared/ (BlockShell.tsx)

    schema/                         # custom object type creator
      SchemaCreator.tsx, FieldEditor.tsx, fieldTypes.ts

    panel/                          # side panel / library
      SidePanel.tsx, TypeTabs.tsx, BlockLibrary.tsx

    views/                          # view system
      ViewSelector.tsx, NamedViews.tsx, applyView.ts, registry.ts

  drizzle.config.ts                 # Drizzle Kit config
  .env                              # DATABASE_URL (not committed)
```

## 2. Implementation Milestones (Ordered)

Now server/DB-first. The canvas milestone depends on a working data path through
Postgres.

### M0 — Scaffold TanStack Start + verify toolchain
- Scaffold with `npx @tanstack/cli@latest create . --add-ons tanstack-query -y`
  (or `--blank` + manual if the CLI has issues; handle the Windows `mkdir C:\` quirk).
- Add DB deps: `npm i @tanstack/react-db @tanstack/query-db-collection @tanstack/query-core drizzle-orm pg`
  and dev: `npm i -D drizzle-kit @types/pg`.
- Verify: `npm run dev` starts, a route renders, `npm run build` + lint clean.

### M1 — Postgres schema + server functions + reactive collection  ← data path foundation
- Drizzle schema: `blocks`, `placements`, `memberships`, `types` (custom schemas),
  `views` tables; `drizzle-kit push` to local Postgres.
- DB client singleton (`src/db/index.ts`) with `DATABASE_URL`.
- Server functions (`queries.functions.ts`): list/save/update/delete per table.
- TanStack DB QueryCollection per table, wired to server functions (optimistic
  mutations + live queries), provided in `__root.tsx`.
- Add `schemaVersion` column/field now (OQ-13 on critical path).
- Verify: seed a block via server fn → appears via `useLiveQuery`; optimistic update
  round-trips to Postgres; persists across reload.

### M2 — Infinite canvas with pan/zoom + one free-floating draggable block
- transform.ts, ViewportContext, usePanZoom, Canvas (dot grid + transform div),
  BlockShell; blocks read from the `blocks`/`placements` collections; drag-end commits
  position (hot path = refs + rAF, cold = DB).
- Verify: pan, zoom, drag block; position persists across reload.

### M3 — Text block (render + in-place edit)
- TextBlockData `{ markdown }`; TanStack Markdown React renderer; double-click
  editor; BlockRenderer switch; update round-trips to server fn/Postgres.
- Verify: dbl-click → edit → Escape → formatted render; persists.

### M4 — File blocks + paste (drag-drop + hidden input)
- FileBlockData `{ name, size, mimeType }`; FileCard; onDrop + hidden
  `<input type=file multiple>`; create server fn reads metadata only (no bytes);
  cascade placement.
- Verify: drop/pick files → cards with metadata; persists across reload.

### M5 — Placed/not-placed model + side panel (library)
- `placements` table/collection separates position from canonical block;
  `placeBlock`/`unplaceBlock`; SidePanel (view-based) + TypeTabs + BlockLibrary;
  "Remove from board" unplaces (not-placed, still in library); re-place from panel.
- Verify: paste → on canvas + in panel; remove → unplaced but in panel; re-place;
  all persist.

### M6 — File Group (create, add members, card/list view switch)  ← ★ interaction milestone
- FileGroupBlockData `{ name, viewMode }`; `memberships` table/collection
  (many-to-many); membership engine + server fns; FileGroupCard/List views; view
  registry + applyView + ViewSelector; drop files onto group to add members; delete
  group → unplace members with no other refs (reference-removal).
- Verify: create group → drop files → toggle Card/List → view change doesn't alter
  data → delete group relocates members per GRILL 47; all persist.

### M7 — Custom object type creator + schema-driven blocks
- `types` table/collection (FieldDef/SchemaDef); engine schema CRUD (data survives
  type edits — never-destroy rule); SchemaCreator modal; ObjectBlockData
  `{ schemaId, values }`; ObjectCard + ObjectEditPanel; dynamic TypeTabs.
- Verify: define type → add fields → create instance → edit values → appears on board
  + in panel under its type tab; persists.

### M8 — Integration polish + uniform UX
- BlockShell: selection highlight, dbl-click edit per type, Delete to unplace,
  Escape to deselect; full BlockRenderer switch; final layout + toolbar; footer hint.
- Verify: full walkthrough (paste → group → views → text → custom type → remove/
  re-place → delete group → pan/zoom/drag smooth), everything persists.

## 3. Data Model (TypeScript Sketch)

Same domain model as before; now backed by Postgres tables + TanStack DB collections.

```typescript
type BlockId = string & { readonly __brand: 'BlockId' }
type SchemaId = string & { readonly __brand: 'SchemaId' }
type ViewId = string & { readonly __brand: 'ViewId' }
type MembershipId = string & { readonly __brand: 'MembershipId' }
type LinkId = string & { readonly __brand: 'LinkId' }
type BoardId = string & { readonly __brand: 'BoardId' }

type Vec = { x: number; y: number }
type BlockKind = 'file' | 'file-group' | 'text' | (string & {})  // last = custom schema

interface FileBlockData        { kind: 'file'; name: string; size: number; mimeType: string }
interface FileGroupBlockData   { kind: 'file-group'; name: string; currentView: 'card' | 'list' }
interface TextBlockData        { kind: 'text'; markdown: string }
interface ObjectBlockData      { kind: string; schemaId: SchemaId; values: Record<string, unknown> }
type BlockData = FileBlockData | FileGroupBlockData | TextBlockData | ObjectBlockData

interface Block     { id: BlockId; data: BlockData; viewOverride?: ViewId | string }
interface Placement { blockId: BlockId; position: Vec }             // placed if present
interface GroupMembership { id: MembershipId; groupId: BlockId; memberId: BlockId }
interface Link      { id: LinkId; blockA: BlockId; blockB: BlockId }

interface ViewOptions { fields?: string[]; layout: 'card' | 'list' | 'grid';
                        sort?: { field: string; dir: 'asc' | 'desc' }; density?: string }
interface ViewDef    { id: ViewId; name: string; targetKind: string; options: ViewOptions }

interface FieldDef   { id: string; name: string; fieldType: 'text' | 'number' | 'boolean' | 'date' }
interface SchemaDef  { id: SchemaId; name: string; fields: FieldDef[]; defaultView?: ViewId }

// Persisted as Postgres tables; hydrated into TanStack DB collections.
// blocks, placements, memberships, types, views  + a schema_version column.
```

**Key structural decisions reflected:**
- Tables mirror the collections: `blocks`, `placements`, `memberships`, `types`,
  `views`, plus `schema_version`.
- `placements` = separate table (placed iff a row exists); `memberships` = separate
  many-to-many table; both independent of canonical block data.
- Custom types = `types` table (`SchemaDef`); instances = rows in `blocks` whose kind
  references a type.

## 4. Open Build-Time Decisions + Recommended Defaults

| Decision | Options | Recommended Default | Defer? |
|----------|---------|---------------------|--------|
| OQ-6 Monorepo | single app vs workspaces | **Single app** (TanStack Start layout; `types/`+`engine/` = future extract) | Yes |
| Membership storage | field on group vs flat edge record/table | **Flat `memberships` table/record** | Yes |
| Placements separation | flag on block vs separate table | **Separate `placements` table** | Yes |
| OQ-13 Persistence | JSON / IndexedDB / server | **PostgreSQL now** (resolved — full-send) | No |
| Schema versioning | add now vs later | **Add `schema_version` column/field now** | Partial |
| Edge/link lifecycle | cascade on unplace vs permanent delete | **Cascade on permanent delete only** | Yes |
| Schema-edit UX | modal / panel / page | **Modal dialog for v1** | Yes |
| File Group constraint | files only / any type | **Files only (locked)** — enforce in server fn validation | Yes |
| Rich text lib | TanStack Markdown / hand-rolled / ProseMirror / Lexical | **TanStack Markdown React renderer + textarea for v1** | Yes |
| Sync/RT engine | QueryCollection vs ElectricSQL | **QueryCollection** (no Electric in v1; Electric only if realtime multi-user later) | Yes |

## 5. Verification Checklist (Run at Every Milestone)

```bash
npm run lint          # zero errors/warnings
npm run build         # typecheck + build succeed
npm run dev           # starts; browser loads without console errors
# + Postgres: db must be running; DATABASE_URL set; drizzle-kit push reflects schema.
```

Manual per-milestone checks mirror grind-then-verify: pan/zoom/drag (M2+); text edit
(M3); file paste with metadata (M4); remove/re-place via panel (M5); File Group drop +
card/list toggle + delete (M6); custom type create/edit instance (M7); full walkthrough
(M8). **Every milestone also verifies persistence** (reload keeps state) since the DB
layer is in place from M1.
