# kho-ja v1 START PLAN (full-stack TanStack)

> Scope: locked content model → shippable increments. **Client + server + PostgreSQL in v1.**
> Stack: **TanStack Start** (server functions, SSR, Vinxi/Nitro) + **TanStack Router** +
> **TanStack Query** + **TanStack DB QueryCollection** + **Drizzle ORM** + **`pg`** + **PostgreSQL**.
> Toolchain: React 19, Vite 8 (via Start), TS, npm, ESLint (from scaffold). Scripts: `dev`, `build`, `start`, `lint`.
> Stack decision: full-send TanStack (see DECISIONS.md); no persistence deferral.
>
> Status: **ALL v1 milestones (M0–M18) are complete.** The in-plan milestone
> summaries below describe the *planned v1 scope*; subsequent milestones were
> tracked chronologically in ROADMAP.md. `scripts/check-blockers.mjs` checks
> M0–M8 + M12–M18 against this file.

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
      client.ts                     # Drizzle + pg Pool singleton (server-only)
      schema.ts                     # table definitions (blocks, placements, memberships, types, views, links, diagrams)
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
- Action-based undo/redo (Ctrl+Z / Ctrl+Shift+Z), marquee box multi-selection,
  OS file and markdown clipboard paste centering on viewport, cascade unplace & delete.
- Verify: full walkthrough (paste → group → views → text → custom type → remove/
  re-place → delete group → pan/zoom/drag smooth), everything persists.

### M9 — v1 Typed Connections  ← completed (M14 expanded into the final link model)
- Schema & Persistence: `links` table in PostgreSQL (`from`, `to`, `type`,
  `label`) + server functions + reactive TanStack DB `links` collection.
  (Implemented later than the other M0–M8 milestones; shipped as M14 with typed
  connections + diagrams.)
- Lifecycle & Cascade: Link creation and deletion wrapped in `runRecorded` for atomic
  undo/redo. When a block is permanently deleted, associated links cascade-delete.
  When a block is unplaced, associated links hide until the block is re-placed.
- Connection Canvas Layer: SVG path overlay transformed by canvas matrix, computing
  dynamic curve intersections between block bounding boxes (smooth cubic Bezier or
  orthogonal rounded lines).
- Interactive Affordance: Connector Tool (`C` or `L` hotkey) and connection port
  handles on hovered block edges. Drag from one block port to another block to create
  a link with real-time preview line.
- Link Interaction: Click line to select, Inspector shows connection details, `Del`
  key deletes link with undo.
- Verify: draw line between blocks → lines re-route dynamically on block drag →
  undo removes line → redo restores line → delete block cascade-deletes links → reload
  persists links.

### M10 — Multi-Block Group Movement & Alignment Tools
- Relative Group Drag: Dragging any block within an active multi-selection translates
  all selected placements by the same world delta in real-time; commits all positions
  in a single batched undo/redo action.
- Alignment & Distribution: Inspector / shortcut actions to align selected blocks
  (Left, Center, Right, Top, Middle, Bottom) and distribute evenly horizontally/vertically.
- Verify: marquee-select 3 blocks → drag one → all 3 move together maintaining relative
  offsets → Ctrl+Z reverts all 3 positions.

### M11 — Board Serialization & Export / Import
- JSON Export: Download full board state (blocks, placements, memberships, types, links).
- JSON Import: File drop or picker to load a board JSON file with validation.
- Canvas PNG Export: Render visible world or selected blocks to a PNG image file.
- Verify: export board → wipe or modify → import JSON → exact board state restored.

### M12 — Board surfaces, facts search, zoom-to-fit (chronological, all complete)
- Search that finds typed facts (block names, card titles, text, group members,
  connection labels) across the canvas; surfaces rendered on the map.
- Viewport controls (zoom to selection/fit); hotkeys and ruler/toolbar polish.
- Verify: search hits, zoom-to-fit, drift-free persistence after undo/redo.

### M13 — Object schema creator, durable Ask, ephemeral facts lists
- Standalone schema creator; Ask remembered per thread; "this session" facts lists
  replaced Types rail; cards consistent in sizing / ordering with Facts-style lists.

### M14 — Typed connections + diagrams
- `links` table with typed edges; connection fill tool + Inspector fields; `.diagram`
  blobs with named diagrams (diagram list rail w/ autosave patch + ⚡ update).
- Interesting-attractor sorting + stabilized lineup; raw-facts defaults; restore-safe
  "replay means re-place"; permanent-delete safety for diagrams.
- Verify: typed connections, diagram save/restore, attractor lineup stability.

### M15 — Real-world grounded milestones, free-form mode, review hardening
- "Everything visible = sources of truth" redefined into real-world grounded
  workflows with explicit milestones; undo labels + merged sub-actions for legibility;
  free-form mode with unlocked X/Y shortcuts.
- Fixes: text-area undo eating first keystroke, "on-board / on-something" posting,
  delete-block-while-I/O-pending + pending-state reconciliation; cursor shape 8-bit bust.

### M16 — Ask (board-native AI)
- Ask answers questions about board data (query watchers + stream chat + extract
  structured transitions), drafting from scratch onto a clean canvas overlay;
  web "container / refining frontiers" framing vs. docs framing.
- Deferences: prompts, conversation UI, stream effects, tool-calling marble run,
  tips tricks, self-stats, 8.6 v1, shape vertex emphasis "field finishers", SSL/HTTPS.

### M17 — Block views, multi-boards, milestone verification
- Right-click view switcher (file: card/content/meta, browser transform rail + mis
  scale; cached layout update bus fix); multi-boards bar; Ask auto-upgrades to
  OpenAI GPT-4.1, GPT-5, and more.

### M18 — Ask chat history, dedicated Ask panel & settings
- Thread-per-conversation history + cross-thread search (client-authoritative
  `khoja.chat.*` blobs; legacy single-thread blob auto-migrates); Ask moves into its
  own left panel (`AIDrawer.tsx`) at the same 224px width; `AskSettings` dialog for
  provider & API-key config; "Chats" home screen with inline per-thread Model picker.

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

interface Block     { id: BlockId; data: BlockData; schemaVersion?: string }
interface Placement { blockId: BlockId; position: Vec }             // placed if present
interface GroupMembership { id: MembershipId; groupId: BlockId; memberId: BlockId }
interface Link      {
  id: LinkId; from: BlockId; to: BlockId
  type: 'depends-on' | 'responsible-for' | 'part-of' | 'related-to' | 'custom'
  label?: string | null
}

interface ViewOptions { fields?: string[]; layout: 'card' | 'list' | 'grid';
                        sort?: { field: string; dir: 'asc' | 'desc' }; density?: string }
interface ViewDef    { id: ViewId; name: string; targetKind: string; options: ViewOptions }

interface FieldDef   { id: string; name: string; fieldType: 'text' | 'number' | 'boolean' | 'date' }
interface SchemaDef  { id: SchemaId; name: string; fields: FieldDef[]; defaultView?: ViewId }

// Persisted as Postgres tables; hydrated into TanStack DB collections.
// blocks, placements, memberships, types, views, links, diagrams,
// each with a schema_version column.
```

**Key structural decisions reflected:**
- Tables mirror the collections: `blocks`, `placements`, `memberships`, `types`,
  `views`, `links`, `diagrams`, plus `schema_version` per table.
- `placements` = separate table (placed iff a row exists); `memberships` = separate
  many-to-many table; `links` = typed connection edges; both independent of
  canonical block data.
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
