# Design: The Core Knowledge Model

This document is the **working design space** for the parts of the system that
matter most and are not yet decided. It exists to capture our thinking — the
options, trade-offs, and the direction we are converging on — so that real
decisions can be made deliberately rather than reactively, and so the next
session can pick up the reasoning instead of restarting it.

Status per item is tracked at the top of each section in `Status:`.
When an item is settled, move it into DECISIONS.md with a full decision record.

---

## 1. The Block & User-Defined Types

**Status:** Settled in direction — schema-driven, user-definable block types.
See [DECISIONS.md](./DECISIONS.md). Open details remain (OQ-1, OQ-10).

### The core idea

Block types are **not** a hardcoded, predetermined set. Instead, there is a
**generic schema system**: a block is an instance of a block *type*, and a block
type is a named set of **fields** (each field has a name and a field type: text,
number, date, boolean, relation, ...). Users can define **brand-new block types**
by composing fields — this is the Notion-like "infinitely expandable" capability.

```text
BlockType { name, fields: Field[] }      // user- or preset-defined
Field     { name, fieldType }            // 'text' | 'number' | 'date' | 'boolean' | 'relation' | ...
Block     = { id, type, position, view, values: { [fieldName]: value } }
```

- Adding a type is a runtime data operation (define the schema), not a code change.
- Rendering is driven by the schema (render whatever fields the type declares).
- A `data` blob is replaced by typed field **values** validated against the schema.

### "Object" is a preset, not a universal base

Not everything is forced to be an "object." **"Object" is one preset** among several
— a starting schema for creating object-like block types. User-defined types are
created from presets or from scratch as fields composed arbitrarily.

**Presets (starter schemas):**
- `object` — a generic typed object (fields composed freely).
- `file` — a file/document reference (ties into the asset library / side panel).
- `file-group` — a **container block** you paste a bunch of files into (not a
  database grid — no rows/columns; you just place files into it).

> The earlier idea of "Person / Feature / API as the first proving set" was
> **dropped** (see DECISIONS.md). Those are too abstract and would have been
> special-cased code. Under the schema-driven model, they become *example presets*
> users could define, not built-in behavior — so building the generic schema system
> is the real deliverable. `File` / `File Group` are the first concrete types.

### Why this over fixed concrete classes

- One generic mechanism, no per-type code or migrations.
- Aligns with the product goal (users model their own project knowledge) rather
  than the system dictating types.
- The same "type as schema" idea makes views, search, and AI work generically.

### Open refinements (OQ-1, OQ-10)

- How "relation to many blocks" as a field type interacts with typed Connections
  (is a relation field expressed as a Connection, a field value, or both?). This
  is the containment question (OQ-10) reopened under the schema model.
- Whether a block's `position`/`view` are part of the type or per-instance
  (per-instance, almost certainly — position is a placement concern).
- How schema changes are versioned so existing blocks don't break (related to
  persistence versioning, OQ-13).

---

## 2. Connections / Relationships

**Status:** v1 is **simple lines** + under-the-hood group membership. Typed,
normalized connections are the **future** direction (see "Future: typed
connections" below). See [DECISIONS.md](./DECISIONS.md).

### The user mental model (settled by grilling)

Users do **not** think in terms of arrows or connection types. They think in terms
of **folders, groups, and related items**. The relationship system is a transparent
data layer underneath.

### v1 model (settled)

- **"Link with a line"** is the only user-facing connection: you draw a simple line
  between two blocks. No type, no arrowhead direction, no labels. It is an optional
  utility for organization — a user may or may not use it; it is never required.
- **Group membership** (e.g. a File Group holding files) is created by *pasting
  files into a group*. Under the hood this is stored as a relationship (a `part-of`
  edge), but the user never manages it as an arrow.
- **Many-to-many:** a file can belong to more than one group (settled — see GRILL 23).

```text
// v1
Link   { id, blockA, blockB }        // a simple drawn line (untyped, optional)
Group  { ... }                        // holds members; membership stored as edges
```

### Future: typed connections (direction, NOT v1)

The long-term value is a **queryable knowledge graph**: relationships carry meaning
("Feature depends on API"), enabling search and AI traversal. When typed
relationships ship (as an optional power feature, not the default UX), they use:

- **v1 future connection type set:** `depends-on`, `responsible-for`, `part-of`,
  `related-to`.
- **Normalized direction** — one canonical direction per type, so the graph is
  queryable regardless of how arrows were drawn.
- **Cardinality:** many-to-many, multiple typed edges allowed between a pair;
  minimal optional edge data; `related-to` is the only symmetric type.

This section preserves the full analysis from the earlier grilling so it is not
lost, even though it is consciously **deferred** out of v1.

---

## 3. Block Views

**Status:** Sketching. Open question OQ-3 in DECISIONS.md.

### The question

A single block can have several switchable views (e.g. a File Group can show as a
card, a list, or a grid). The user said changing the view **does not change the
items** — it just changes presentation. The open question is where that line is.

### Option A — Purely presentational views

- A view is a different *layout over the same data*.
- `view: 'card' | 'list' | 'grid'` — same block data, three renderers.
- Cleanest model: view never touches the data. Simple to guarantee.

### Option B — Views may drive which fields/data are shown

- The *items* are identical, but a view may *surface* fields that another view
  hides (a list view shows size/date columns; a card view shows only a title).
- The data is one canonical set; views are projections/filters over it.
- The subtlety we flagged: "list view needs metadata the card view doesn't
  render." This is still a *projection* if the data exists. It only becomes a
  data-model change if the view demands new fields that don't exist anywhere.

### The clarifying rule

The distinction that resolves this:

> **Views are projections over a single canonical data shape.**
> Choosing a view never changes, adds, or removes data — it only selects which
> known fields are rendered and in what layout.
> If a view needs a field that doesn't exist in the canonical shape, that's a
> block-type data-model change, not a view change — and it applies to all views.

### Direction

Adopt the rule above for v1. Each block type defines **one canonical data shape**
and a set of **views** that are projections over it. Multi-view is presentational;
new field types are a data-model change handled at the type level.

**Refinement to decide per type:** what views does each type ship with? Start with
File (card view only) and File Group (card/list/grid) to validate the model.

---

## 4. Relations between the parts (how it hangs together)

### v1 (current milestone)

```text
Project
  ├─ Asset library / side panel   (content that persists; e.g. file references)
  └─ Board (a canvas over the project)
       └─ Block (instance of a user-defined BlockType at x,y)
            ├─ type   → which schema (BlockType)
            ├─ view   → projection of the canonical values
            └─ values → the block's data for the type's fields
       └─ Link       (optional simple line between two blocks)
       └─ Group      (e.g. File Group — holds members; rendered card/list)
```

The board is a placeable surface; content persists independently (see the
nodes-are-pointers decision). Relationships in v1 are simple lines + group
membership.

### Future (typed knowledge graph — deferred, see DESIGN.md §2)

The long-term vision: typed, directed Connections turn the board into a
**queryable knowledge graph** — every brief diagram (Feature → API → Database →
Table) is expressed as typed edges. That dual nature is what makes search (graph
traversal + full-text) and AI (answering "which API is responsible for this
feature?") possible later without restructuring. This is consciously **not** built
in v1 (see DECISIONS.md).

---

## Design candidates not yet explored (future)

- Persistence, serialization format & schema versioning (OQ-13), and the backend
  API shape.
- Exact canonical field shapes for the `file` / `file-group` presets.
- How group membership is stored (field vs. link) — OQ-10.
- Indexing / full-text search strategy.
- Real-time sync / collaboration strategy.
- The typed-connection "power feature" UI (when re-introduced).

These are intentionally out of scope for the current canvas-first phase; they are
tracked in ROADMAP.md / DECISIONS.md as open or future items.
