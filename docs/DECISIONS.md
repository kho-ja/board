# Decisions

Only meaningful decisions are recorded here — not trivial implementation details.
Each entry follows: Context / Decision / Why / Alternatives / Consequences.

---

## Decision: Canvas-first development order (instead of DB+auth first)

**Date:** 2026-08-31
**Status:** Accepted

**Context:** The product is fundamentally a visual canvas. Auth + database are
commodity work with many templates; the canvas + block + relationship model is
where there is no precedent and the highest risk.

**Decision:** Build and validate the canvas/block model first (with in-memory
data) before adding authentication, a database, or persistence.

**Why:** The canvas *is* the product. Deferring it would mean building an auth
wall around nothing, and would push the riskiest unknown to the end.

**Alternatives considered:** DB + auth first (originally proposed by the user);
rejected after discussion.

**Consequences:** Infrastructure (auth, DB, persistence) is deferred. The canvas
and block model must be validated before those are layered on.

---

## Decision: Custom canvas (Canvas API + pan/zoom) rather than a canvas library

**Date:** 2026-08-31
**Status:** Accepted

**Context:** The brief wants a FigJam-like infinite, freely moveable canvas with
maximum flexibility.

**Decision:** Build a custom canvas (Canvas API + pan/zoom), not tldraw, react-flow,
or Excalidraw.

**Why:** Maximum control over block rendering and interactions. A library would be
opinionated and fighting it is painful.

**Alternatives considered:** tldraw, react-flow, Excalidraw — all rejected in favor
of control.

**Consequences:** More engineering work. The interaction model must be built and
maintained ourselves. *(Open risk: this is the hardest and most differentiating
part — validate the interaction model early with a prototype.)*

---

## Decision: Monorepo — product-first, extract shared package later

**Date:** 2026-08-31
**Status:** Accepted

**Context:** The user wants to eventually publish an npm package for a community.
Building the product *and* a public package simultaneously is twice the work and
risks designing a public API before real usage exists.

**Decision:** Build the product first; extract a reusable package **only after** a
stable, proven core exists. Do not design a public API preemptively.

**Why:** Premature package-ization is how projects get stuck. A public API is a
commitment that should be based on real usage.

**Alternatives considered:** Package from day one; rejected as over-scoping.

**Consequences:** The exact monorepo flavor (pnpm workspaces + `packages/` now, vs.
a single app with clean module separation and later extraction) is an **open
question** — see Open Questions below.

---

## Decision: Scope is deliberately held back

**Date:** 2026-08-31
**Status:** Accepted

**Context:** The full vision (auth, collaboration, search, AI, package) is large.
The user explicitly acknowledged over-scoping and wants to build "perfectly,
slowly, little by little."

**Decision:** v1 is narrow: the canvas, block model, and first block types with
in-memory data. Future features are tracked in ROADMAP.md as future ideas, not
built.

**Why:** Working software > impressive architecture; clear knowledge > complexity.

**Consequences:** Many features are deferred. Avoids building unused infrastructure.

---

## Decision: On-canvas nodes are pointers, not copies of content (assets vs. nodes)

**Date:** 2026-08-31
**Status:** Accepted (working direction / clarified in grilling)

**Context:** The user clarified the intended relationship between uploaded files
and the canvas: when you upload files they "move to a side panel," and deleting a
canvas node "does not delete the file — only a point on the canvas."

**Decision:** A block on the canvas is a **reference/pointer** into a separate
asset store (e.g. the side panel), not an embedded copy. Deleting a block removes
only the canvas placement (the pointer); the underlying file/asset persists.

**Why:** This matches the user's vision and avoids data loss from casual node
deletion. It also separates "what exists in the project" (assets) from "what is
placed on the board" (references).

**Consequences:** The schema needs a notion of an asset library (side panel)
separate from board placement. This interacts with the open question about
containers, and is worth firming up alongside the block-model decision.
*Related open question: see OQ-9 (asset store) and the container question below.*

---

## Decision: The board is a placeable view; assets persist independently (side panel)

**Date:** 2026-08-31
**Status:** Accepted (working direction / clarified in grilling)

**Context:** Follow-up to the "nodes are pointers" decision. The user explicitly
wants no data loss from deleting a node, and wants pointers saved to a side panel
as well. They also raised the idea that a node/placement could be saved as a
*different type* in the side panel (a type change producing a saved variant).

**Decision:** The project has a persistent **side panel / asset library** holding
content, and a **board** holding placements (pointers into the library). Deleting a
placement never destroys the underlying content. A placement can additionally be
saved as another type in the side panel.

**Consequences:** This extends the "board = project" framing from README.md: the
*project* is the union of the asset library and the board, not the board alone.
README/ARCHITECTURE need updating to reflect this. The relationship between the
side panel's saved variants and the board's placements is an open question (OQ-9).

---

## Decision: Rendering — DOM/React blocks with a transformed container (custom canvas)

**Date:** 2026-08-31
**Status:** Accepted (working direction / answered in grilling)

**Context:** The user asked whether DOM rendering will lag, and accepted the
React/DOM approach with a note to prevent lag during design.

**Decision:** Render blocks as **DOM nodes** (React), on top of a custom
pan/zoom canvas. The world-space is kept in a **viewport transform**; the
container uses a CSS `transform` so pan/zoom does not re-render blocks. Use
**viewport culling** (only mount blocks intersecting the viewport) and
**memoized block components** so state changes re-render only what changed.
Use the Canvas API (or an overlay) for the background grid, connection edges, and
selection box — things that are cheap on canvas and hard in DOM.

**Why:** DOM gives trivial text editing (native textarea), styling, and
accessibility; performance is bounded by culling + transform + memoization, not by
total block count. This is the established pattern for serious whiteboard apps.

**Consequences / guardrails recorded for future work:**
- Do **not** re-render all blocks on every pan/zoom frame (use the container transform).
- Do **not** animate per-block transforms each frame.
- Cull off-viewport blocks.
- Memoize block components.
- Prefer DOM for blocks + text; use canvas/overlay only for grid, edges, selection.

---

## Decision: Validate the model first with `Person`, `Feature`, `API`

**Date:** 2026-08-31
**Status:** **SUPERSEDED** (same day) — see the "Block types are user-definable
schemas" and "File and File Group are the first concrete types" decisions below.

**Context:** The user wanted "the best decisions for this project." The product's
core value is relationships between things with different meanings, not just
rendering boxes. The question was which block types should exist in the first
working canvas.

**Decision (original):** The first block types are **`Person`**, **`Feature`**, and
**`API`** — three types that force building *typed relationships*. This proved the
knowledge/relationship model first.

**Why it was superseded:** During continued grilling the user pivoted decisively.
Person/Feature/API are too abstract and would have been special-cased code. The
real deliverable is the **generic, user-defined schema system** ("object" is a
preset, everything is composable fields); Person/API become example presets, not
built-in types. First concrete types are instead `File` / `File Group`. Typed
relationships were dropped from v1 (simple lines + group membership instead), so
the "typed arrows between Person/Feature/API" premise no longer applies.

**Alternatives considered:** (as originally) `File` / `File Group` first; the finer
reasoning is captured in DESIGN.md.

---

## Decision: v1 relationships — simple lines + hidden group membership

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Users think in folders/groups/relations, not arrows. In v1, the system
should not force users to manage typed connections or pick relationship types.

**Decision:**
- The only user-facing connection in v1 is **"link with a line"** — a simple,
  optional line between two blocks. No type, no arrowhead, no labels. It is a
  utility for organization, never required.
- **Group membership** (e.g. pasting files into a File Group) is stored under the
  hood as a relationship, but the user never manages it as an arrow.
- **Many-to-many:** a block can belong to more than one group.

**Why:** Prioritizes a simple "folders and relations" user model over premature
arrow/type mechanics, matching the product's ease-of-use priority.

**Alternatives considered:** user-facing typed connections in v1 (see the following
decisions) — deferred because the user explicitly wants to "not concentrate on
arrows" in v1.

**Consequences:** The v1 data model needs a simple `Link` (blockA, blockB) and a
way to store group membership. The *typed* connection model below is preserved as
**future direction**, not built in v1.

---

## Decision: typed connection set (FUTURE direction, not v1)

**Date:** 2026-08-31
**Status:** **Deferred out of v1** — direction for a future "power feature."

**Context:** (Original) Connections typed as stored data. The type list must be
small and clear, but meaningful enough to represent real project knowledge.

**Decision (future):** When typed relationships ship, the connection types are:

- `depends-on` — A depends on B (directional).
- `responsible-for` — a Person responsible for a Feature/API (directional).
- `part-of` — containment/categorization, e.g. a Feature part of a bigger Feature
  (directional).
- `related-to` — the one symmetric connection and the generic fallback.

**Why:** Small, clear, and covers the archetypal knowledge-graph diagrams. This
becomes the queryable graph for search/AI later.

**Consequences:** This is consciously **not part of v1** — v1 ships simple lines
(see previous decision). The enum must stay small; each new type must earn its place.

---

## Decision: Normalize relationship direction in the data model

**Date:** 2026-08-31
**Status:** **Deferred out of v1** — applies to the *future* typed-connection model
(see the "typed connection set (FUTURE)" decision above). Not used by the v1 simple
`Link` model.

**Context:** A relationship such as "Feature depends on API" has a direction, but a
user might draw the arrow either way. Storing arrows exactly as drawn would let the
*same meaning* be stored in two directions, breaking search and AI (e.g. "which
APIs does this feature use?" vs. "which features use this API?").

**Decision:** Relationship direction is **normalized** to one canonical direction
per type. The `type` carries its meaning; the UI may flip the visual arrow without
changing the stored meaning.

**Why:** Enables consistent graph traversal for search and AI later. "depends-on"
always means dependant → dependency regardless of drawing order.

**Consequences:** More semantic precision in the model; the UI must map the user's
drawn direction to the canonical direction.

---

## Decision: Relationship cardinality & edge data

**Date:** 2026-08-31
**Status:** **Deferred out of v1** — applies to the *future* typed-connection model
(see the "typed connection set (FUTURE)" decision above). The v1 model does allow
many-to-many group membership.

**Context:** Whether two blocks can have multiple relationships, whether edges can
carry data, and which relationships are symmetric.

**Decision:**
1. **Many-to-many, multiple typed edges allowed between the same pair** — two blocks
   can have several relationships (different facts coexist: "A depends on B" and "A
   is part of B").
2. **Edges may carry optional minimal data in v1** (a `label`/note); no heavy edge
   properties yet.
3. **`related-to` is the only symmetric connection**; all other types are directional
   and normalized.

**Why:** Multiple edges between a pair are distinct facts and both should be
represented; minimal edge data keeps v1 simple while allowing a note on an edge.

**Consequences:** The `Connection` schema includes `type` and an optional `label`.
Cyclic relationships for `related-to` are natural; whether `depends-on`/`part-of`
cycles are allowed or flagged is a loose end not blocking v1.

---

## Decision: Block types are user-definable schemas ("object" is a preset)

**Date:** 2026-08-31
**Status:** Accepted (direction)

**Context:** The original plan treated block types as a fixed, predetermined set.
The user pivoted: the real differentiator is **custom, user-defined types** —
"infinitely expandable, like Notion." They were uncomfortable with abstract default
types (Person/Feature/API) and prefer concrete, real usage (files).

**Decision:** Build a **generic schema system**. A block type is a named set of
**fields**; a block is an instance of a type with values for those fields. Users
define brand-new types by composing fields (runtime data operation, not code
change). Rendering is schema-driven. Not everything is forced to be an "object" —
**"object" is one preset** for object-like types; other presets include `file` and
`file-group`.

**Why:** Matches the product goal — users model their own project knowledge — and
makes views, search, and AI work generically over any type. Avoids per-type code
and migrations.

**Alternatives considered:** Fixed concrete types; the Person/Feature/API proving
set. Both rejected: the former is not truly expandable, the latter is too abstract
and would have been special-cased code.

**Consequences:** The "Person/Feature/API first" milestone is **dropped** in favor
of the generic schema system with `File` / `File Group` first (see ROADMAP).
"Person" and "API" become possible *presets*, not built-in code. Core open item:
how a "relation/many-blocks" field relates to typed Connections (OQ-10).

---

## Decision: `File` and `File Group` are the first concrete types

**Date:** 2026-08-31
**Status:** Accepted

**Context:** The user pivoted from abstract proving types to concrete, real-world
use. They see the first valuable experience as documents: import files, and group
them.

**Decision:** v1 introduces the **`file`** and **`file-group`** preset types. A
`file-group` is a container block you paste a bunch of files into (no database
grid / rows / columns). `file` ties into the asset library / side panel (see the
nodes-are-pointers decision).

**Why:** Matches how projects actually start (dump documents, group them) and
directly exercises the asset-library and container concepts with the least
abstraction.

**Alternatives considered:** `Person`/`Feature`/`API` (see previous decision).

**Consequences:** The schema system and the File/File Group presets must coexist
from the start — i.e. presets are themselves defined through the same schema
mechanism, not special-cased alongside it.

---

## Decision: Never destroy user data on schema evolution (subtypes/edit types)

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Users define types, create blocks of that type, then edit the type
(add/remove/rename fields, or delete the type). Existing blocks of a changed type
must behave sensibly.

**Decision:** Adopt the **Notion-like rule: never destroy user data.**
- **Add field** → existing blocks get the new field empty/null.
- **Remove/rename field** → existing blocks keep their data, hidden or shown under
  the old field; never silently deleted.
- **Delete a type** → its existing blocks survive with their data intact and a
  warning; never a hard delete of content.

**Why:** Consistent with the earlier "don't let users lose their things" principle
(nodes-as-pointers, side panel). Data safety is a hard rule.

**Alternatives considered:** cascade-delete on type/field removal — rejected as
data loss.

**Consequences:** The schema system must keep per-block data resilient to type
changes; schema changes themselves need versioning (ties into OQ-13 persistence
versioning).

---

## Decision: v1 "files" are references only (no real bytes/preview yet)

**Date:** 2026-08-31
**Status:** Accepted

**Context:** In the in-memory, interaction-first phase, "paste a bunch of files
into a File Group" could mean real file content or just references. The user chose
references only.

**Decision:** In this phase, files are **references/metadata only** (e.g. name,
size, type) — no file content bytes, no preview/opening. File Group blocks show
members as card/list from their metadata + references.

**Why:** Keeps the first milestone focused on the model and interaction rather than
file-upload machinery; avoids object-URL/preview complexity that would be lost on
refresh anyway.

**Alternatives considered:** loading content into memory via File API / object URLs
— deferred.

**Consequences:** The asset store and file-rendering groundwork for real previews
is a later milestone. The milestone's success criterion is *model + interaction*,
not file fidelity.

---

## Decision: the interaction milestone = model + reference grouping, not just dragging

**Date:** 2026-08-31
**Status:** Accepted

**Context:** A demo that only drags empty cards proves nothing about the product.
The value is tied to documents: importing files, grouping them into File Groups,
switching views.

**Decision:** The canvas-first "interaction" milestone means: paste file
**references** → group them into a File Group → switch card/list view — and nothing
less. Dragging/pan/zoom is prerequisite plumbing, not the milestone.

**Why:** Without file grouping and view switching, the model's value
(new developer understands the project) is untestable.

**Consequences:** Phase-1 scope includes File Group creation, adding members, and
at least card + list views for a File Group.

---

## Decision: One canonical block per thing; placements & memberships are references

**Date:** 2026-08-31
**Status:** Accepted

**Context:** A file can be placed directly on the canvas and also be a member of a
File Group. Without a rule, this could create duplicate copies that diverge.

**Decision:** There is **exactly one canonical block per thing**. Placing a block on
the canvas and adding it to a group are both **references (pointers) to that same
canonical block**. The same file can sit alone on the canvas and inside a File Group
simultaneously, never duplicated. Editing the canonical block updates everywhere.

**Why:** Prevents data divergence and matches the "nodes are pointers" safety
principle.

**Consequences:** The data model has canonical blocks (the asset library) and
references/placements. Membership (in a group) is another form of reference.

---

## Decision: A File Group is itself a block that contains members

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Whether a File Group is a positioned block or a non-canvas "saved
query."

**Decision:** A File Group is a **regular block on the canvas** — it has a position
like any block, is not a special "parent" abstraction, and it **contains** files
(as references). Its view (card/list/...) renders those members.

**Why:** Matches the user's "special folder you paste files into" mental model
while keeping the "one block = one thing" consistency.

**Consequences:** A File Group block and its member files can both appear on the
canvas (member shown both in the group card and as its own block), consistent with
the one-canonical-block + reference model.

---

## Decision: Deleting a placement is "not placed" — content stays in the side panel (all types)

**Date:** 2026-08-31
**Status:** Accepted

**Context:** The user wants to prevent accidental loss of files, and wants the same
behavior for **all block types**, not just files. Follow-up grilling (GRILL 31)
narrowed this to a simple model.

**Decision:** A block has essentially **two states: placed / not placed**. There is
**no separate "trash" state**.
- Removing a block from the board just marks it **not placed** — it remains **visible
  in the side panel / library** and can be re-placed later.
- A permanent removal is an explicit delete **from the side panel**, which makes it
  permanently unavailable.

This applies to **every block type** (files, file groups, and any user-defined
type), not files alone.

**Why:** Prevents accidental loss universally, with the minimal number of states
(no third "trash" concept). The side panel is both the library and the recovery
surface, for all types.

**Consequences:** The asset library is type-generic (holds any block type) with a
placed/not-placed flag; the board holds only placed blocks. This extends the
original nodes-are-pointers decision to all types.

---

## Decision: File Groups hold only files in v1 (generic containers deferred)

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Whether a File Group is a file-only container or a generic container of
any block type.

**Decision:** In v1, a **File Group contains only `file` blocks** (its name reflects
its purpose). Generic containers that can hold any type are **deferred** to a future
milestone.

**Why:** Keeps v1 scope minimal and matches the concrete document-workflow focus.

**Consequences:** "Grouping" is a file-oriented feature in v1, not a generic
primitive. A future milestone may generalize it once real need appears.

---

## Decision: Views are user-editable option-sets, not hardcoded CSS

**Date:** 2026-08-31
**Status:** Accepted

**Context:** A File Group "shows files as card or list or something else." For views
to be genuinely useful and "infinitely expandable," they must be more than a few
hardcoded layouts.

**Decision:** A **view is a first-class, user-editable definition**: a set of
rendering options per block type — which fields/labels to show, layout, sort order,
density, columns, etc. It is not just CSS; it is an editable view definition.

**Why:** Makes views genuinely customizable and composes with the
user-definable-type system ("infinitely expandable, like Notion").

**Consequences:** There is a view-definition concept alongside block types and
fields. A type ships with one or more default views; users can edit them or define
new ones. Files can appear in multiple groups with different views (consistent with
these decisions).

---

## Decision: Per-block view with type-level defaults; reusable named views

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Views are user-editable option-sets, but it was unclear whether a view
change affects one block or the whole type.

**Decision:** There is a **type-level default view** (e.g. the "File Group" type has a
default card view), but each **block instance has its own current view and
overrides**. A user can save a layout as a reusable **named view**.

**Why:** Avoids editing one block changing all blocks of the type; matches
Notion-like per-instance layout control while allowing shared named views.

**Consequences:** View state lives at two levels (type default + per-block
override), and named views are reusable definitions. Instances are independent in
how they *present* shared canonical data.

---

## Decision: Default types coexist with the schema-driven custom-type system (CORRECTED GRILL 34)

**Date:** 2026-08-31
**Status:** Accepted (corrected)

**Context:** Earlier (GRILL 34) we leaned toward full uniformity — every type driven
by the schema system. Follow-up grilling (GRILL 35) **corrected** this: not every
block type is schema-driven.

**Decision:** There are two coexisting kinds of block types:
1. **First-class default types** (`file`, `file-group`, and others to be added) —
   built-in, not schema-driven. They coexist alongside the type system.
2. **Custom (schema-driven) types** — created by a user through an "object"-style
   schema; an additional mechanism layered on top.

These coexist: the schema/type engine does **not** count for every block; default
types are first-class and separate.

**Why:** Defaults carry behavior/layout that is awkward to express purely as field
schemas; custom types fill the "infinitely expandable" need. Mixed model matches the
user's mental model best.

**Consequences:** The architecture is **not** total uniformity. Default types can be
code-backed first-class blocks; custom types are data-driven. The statement "one
generic block engine, presets are just data" is **too strong** — some types are
built-in and may be code-backed. Capabilities (placed/not placed, library, views)
should still apply to all types, but type *definition* is not uniform.

---

## Decision: v1 paste-files = read metadata from the OS (no bytes)

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Where files come from in v1, given files are metadata-only refs.

**Decision:** "Paste files" is a real file picker / drag-drop (a hidden `input
type=file`); the system reads only **metadata** (name, size, type) from the OS and
creates a `file` block with it. No bytes or content are stored in v1.

**Why:** Most natural "paste files" interaction and gives real metadata for free,
consistent with the references-only decision.

**Consequences:** The first U user interaction is a real (but silent) file picker
that imports references, not literal text-pasted names.

---

## Decision: File Group members are not editable in place (read-only projection, for now)

**Date:** 2026-08-31
**Status:** Accepted (provisional)

**Context:** Whether a File Group's rendered members are editable inside the group.

**Decision:** Group members render as **read-only** within the group for now;
editing targets the **canonical file block** itself (click a member to open/edit the
file). Exact in-place behaviors are provisional and will be finalized later.

**Why:** Keeps the group a lightweight projection and avoids duplicating editing
surfaces between the group and the canonical block.

**Consequences:** File Group blocks render member content but editing is delegated
to the canonical block; behavior may be refined once the final interaction is set.

---

## Decision: The side panel is a view-based browser, not a flat list

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Whether the side panel/library is a simple flat list or uses the view
system.

**Decision:** The side panel is a **view-based browser**: it reuses the same
**card/list view system** (per type) rather than a flat list. It is the library of
not-placed (and placed) blocks, browsable with the same views.

**Why:** Consistent with views-as-option-sets; the panel is not a second board, but
it does use the same view rendering.

**Consequences:** The side panel renders blocks through the same view machinery as
the canvas (grouped/browsable per type), with drag-to-place onto the canvas.

---

## Decision: v1 default types include `text`

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Which default types exist in v1, and whether a text/note block is
included.

**Decision:** The v1 default type set is **`file`, `file-group`, and `text`**.
`text` is a first-class default — a simple note/header/explanation block (e.g.
markdown/text). It is confirmed 100% in v1.

**Why:** A knowledge board needs writing, not just files/groups; `text` makes the
board immediately usable and is cheap to implement (a textarea-based render).

**Consequences:** `text` is a code-backed default type, present from the first
milestone alongside `file` and `file-group`.

---

## Decision: The schema system + custom object-type creator ARE in v1

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Whether the schema-driven type system ships in v1 or later.

**Decision:** **(b)** — the **schema system and a custom `object`-type creator are
**in v1**:** a user can define a custom object schema (named set of fields) and
place instances on the board.

**Why:** Matches the "infinitely expandable" goal; the type engine is a core
deliverable, not post-v1.

**Consequences:** v1 includes the custom-type definition UI as well as the default
types. This is more work but is the heart of the product.

---

## Decision: Uniform base + layered code-backed defaults (shared capabilities)

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Defaults and schema types differ internally; whether their capabilities
are the same.

**Decision:** All types share a **uniform base**: placement on canvas, placed /
not-placed library behavior, and view rendering. **Default types augment** this base
with **code-backed behavior** (e.g. `file`'s metadata fields, `file-group`'s
membership rendering); **custom schema types** are built purely from fields.

**Why:** One shared base engine + capability layer; defaults enrich, schemas
compose.

**Consequences:** The block engine is built once (placement/library/views), with
default-type behaviors layered on; custom types reuse the base and add fields.

---

## Decision: Uniform user-facing experience, with per-type presentation & edit affordance (GRILL 42)

**Date:** 2026-08-31
**Status:** Accepted (with nuance)

**Context:** Defaults are code-backed while custom types are field-driven; whether
both feel the same to the user.

**Decision:** There is a **uniform base experience** across all block types — place,
drag, group, and the core edit path work the same way. **But presentation and edit
affordance can vary per type**: it is **not rigidly uniform.**
- Specific default types may differ in how they present (e.g. **BG/background** may
  be absent on `text` by default, or appear only in certain views; defaults may
  gain BG later).
- Edit interactions can differ: **`text` is editable in place, Figma-style**
  (double-click to edit, change directly on the block).
- For v1, the edit interaction can be **more generic** (a common edit path) and
  refined per-type as the product evolves.

**Why:** Uniformity where it counts (a user handles any block the same way in the
base), freedom where it matters (per-type presentation/edit affordance).

**Consequences:** The design contract is "uniform base UX over mixed internals,
with per-type presentation and edit affordance." Editing is a per-type capability
(e.g. `text` = in-place Figma-style double-click), with a generic default for v1.

---

## Decision: v1 is free-floating blocks on an infinite canvas

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Whether the board is freeform or a flowing document/columns.

**Decision:** v1 is **free-floating blocks on an infinite canvas** (flexible
positions, FigJam-like). **Figma-style auto-snap/align is a future feature — do not
contemplate or scaffold for it yet.**

**Why:** Matches the chosen custom-canvas + pan/zoom direction and keeps v1 simple.

**Consequences:** v1 has no auto-arrange/snap; blocks sit at explicit positions. No
snap scaffolding in v1 code.

---

## Decision: Membership and placement are independent; a block can be in many groups and placed standalone

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Whether a file in a group can also be placed directly on the canvas.

**Decision:** A block can be **in a group AND placed standalone** at the same time,
in **many groups**, and in **zero groups** — all simultaneously / fully independent.
This follows from the canonical/reference model.

**Why:** One canonical block, many independent references (placement + memberships).

**Consequences:** "Is in group X" and "is placed at (x,y)" are independent flags;
there is no single "home."

---

## Decision: Deleting a File Group unplaces the group and its members (GRILL 45)

**Date:** 2026-08-31
**Status:** Accepted

**Context:** What happens to members when a File Group is deleted.

**Decision:** Deleting a File Group unplaces **the group AND its members** — they all
return to the library (placed → not placed).

**Why:** The group is the organizing structure; removing it returns its contents to
the library rather than leaving orphaned placements.

**Consequences:** Deleting a group removes only that membership reference (NOT an
unconditional cascade); members with other independent placements keep them. See
the resolved GRILL 47 decision below.

---

## Decision: Single board in v1, board/project is a first-class unit

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Whether v1 has multiple projects/boards with navigation, or one board.

**Decision:** v1 is a **single board** (one project) for the milestone, but a
board/project is modeled as a **first-class unit** so multi-project navigation is
trivial to add later.

**Why:** Interaction-first validation needs only one board; modeling it as a unit
keeps multi-project cheap later.

**Consequences:** The board/project is a discrete data unit even though v1 shows
one; future project list/home is an additive change.

---

## Decision: Deleting a group only removes that membership; other references survive (GRILL 47)

**Date:** 2026-08-31
**Status:** Accepted (resolves the GRILL 45 cascade seam)

**Context:** The cascade-unplace choice from GRILL 45 collides with independent
membership.

**Decision:** Deleting a File Group removes only that **Group-A membership
reference**. A member that is also placed standalone or in other groups keeps those
placements; only members with no other references become unplaced. (GRILL 47 = (a).)

**Why:** Data-safe and consistent with independent membership/placement.

**Consequences:** Group deletion is reference removal, not cascade unplace. Members
retain independent placements.

---

## Decision: `text` is rich text (partial markdown subset) (GRILL 48)

**Date:** 2026-08-31
**Status:** Accepted

**Context:** What the `text` block supports.

**Decision:** **`text` is rich text** — a partial markdown subset (e.g. bold,
italic, headings, lists), a middle ground between plain text and full markdown.

**Why:** Richer than plain text without full-markdown complexity.

**Consequences:** The text editor supports a markdown subset; scope can grow later.

---

## Decision: Create & edit on the board; blocks also appear in the side panel (GRILL 49)

**Date:** 2026-08-31
**Status:** Accepted

**Context:** Where new blocks are created/land.

**Decision:** New blocks are **created and edited on the board** (pasted files land
on the canvas) **and** also show up in the side panel. The panel is a live view of
all blocks (placed and not-placed); creation happens on the board.

**Why:** Board-first creation matches "paste onto canvas"; panel stays the
view-based browser of everything.

**Consequences:** Creation flow targets the canvas; the side panel reflects all
blocks as a browsable view.

---

## Decision: Tech stack — TanStack DB as the client reactive store; defer Start/Router/Query/Virtual

**Date:** 2026-08-31
**Status:** Accepted

**Context:** The user strongly prefers the TanStack ecosystem. Research (2026) mapped
each library against our locked "in-memory first, no backend, single-board SPA" v1.

**Decision:**
- **Use `@tanstack/react-db` (LocalOnly collections) as the v1 reactive client
  store** — replaces the hand-rolled `useReducer` and any generic store library.
  It is client-side, needs **no server and no TanStack Query** (LocalOnly path),
  gives normalized collections + differential-dataflow live queries + optimistic
  mutations, and is the on-ramp to persistence/sync later.
- One model → collections mapping: `blocks`, `placements`, `memberships`, `schemas`,
  `views` as LocalOnly collections, with live queries for "blocks in viewport",
  "members of group X", etc. Optional schema validation via zod/standard-schema on
  collections.
- **Defer** (with triggers): **TanStack Start** (adds a server → defer until
  persistence/auth/SSR; earlier "full TanStack Start" framing would have re-opened
  v1's no-backend constraint), **TanStack Router** (multi-project navigation),
  **TanStack Query** (first API endpoint), **TanStack Virtual** (1D list model, wrong
  for a 2D canvas), **TanStack Form/Hotkeys** (later when editing forms/shortcuts).
- **Hot/cold performance split:** TanStack DB holds the **cold model state + derived
  reactive queries**; the **hot per-frame path** (viewport transform, active drag)
  stays in refs + `requestAnimationFrame` + direct DOM writes, committing back to DB
  on drag-end. This matches the locked rendering direction (DOM blocks + transform +
  culling + memo).
- Dependency philosophy remains **minimal** beyond this: `@tanstack/react-db` is the
  deliberate exception (~10–25 KB gzip total with schema lib).

**Why:** Keeps the locked v1 plan (no backend, in-memory, single board) while
adopting the one TanStack library that genuinely fits, with a clean upgrade path to
the rest of the ecosystem.

**Consequences:** v1 depends on `@tanstack/react-db` (+ optional schema validator).
TanStack DB's pre-1.0 maturity (v0.x) is accepted as a risk with an active-maintenance
mitigation. A future milestone can adopt Start/Router/Query for
backend/multi-project without reworking the collection model.

---

## Decision (REVERSAL): Full send TanStack for v1 — client + server + PostgreSQL

**Date:** 2026-08-31
**Status:** Accepted (reverses two earlier v1 scope decisions)

**Context:** The user decided to go **full TanStack for v1** after initially leaning
"TanStack DB-only, defer server." "Full send" means adopt the whole stack now, with a
real backend. This deliberately **reverses** the earlier decisions:
- "In-memory first / interaction-first validation, no backend in v1"
- "Persistence / backend / DB deferred out of v1" (OQ-13 was future)

**Decision — full client + server TanStack in v1:**
- **TanStack Start** (full-stack framework: Vinxi/Nitro server, SSR, server functions)
- **TanStack Router** (type-safe routing within Start)
- **TanStack Query** (`@tanstack/react-query`)
- **TanStack DB** with an API-backed/collection integration to the server
- **PostgreSQL** (already installed locally) as the v1 database, served through
  TanStack Start server functions.

**Consequences / reversals made explicit:**
- v1 now has a **backend and persistence**; the "interaction-first / in-memory only"
  framing is superseded.
- **OQ-13 (persistence format & schema versioning)** is now **on the critical path** —
  must be resolved before/during the DB milestone. We should adopt a schema version
  header early.
- **OQ-6 (monorepo/layout)** is relevant again — Start app structure (server + client
  roots) replaces the single-`src/` SPA layout in START_PLAN.
- **OQ-9 (asset store / side panel model)** interacts with Postgres persistence.
- Milestone ordering in START_PLAN must be reworked: a server + DB layer precedes the
  canvas milestone.
- **Maturity risk accepted:** TanStack Start is RC/pre-1.0; TanStack DB is 0.x; Postgres
  integration is via the edge/sync path (ElectricSQL-backed). The combination of a
  pre-1.0 framework + 0.x reactive DB + Postgres sync is bleeding-edge. **Requirement:**
  verify the real integration story and the exact package set (server-side DB client
  e.g. `pg`/Postgres driver + TanStack DB collection wiring) is buildable BEFORE
  rewriting the plan / installing, to avoid scaffolding a broken milestone.

Note: this replaces the earlier "TanStack DB-only, defer Start/Router/Query" decision
(stack decision of the same date). The model→collections mapping and hot/cold perf
split still stand; only the "defer" part is reversed.

---

## Open Questions (to be resolved as we design/build — not yet decided)

These are deliberately recorded together for later resolution. We are not guessing
at answers now; we are documenting the seams to think through.

> The three questions that are central to the product (block model, typed
> connections, multi-view semantics) have a full working analysis — options,
> trade-offs, and a lean — in **[DESIGN.md](./DESIGN.md)**. Settle them there, then
> promote a decision into this file with a complete record.


### OQ-1: Block data model — are there multiple concrete block types (featured), or one generic block with a type discriminator?

**Direction settled** — schema-driven, user-definable block types. Not fixed
concrete classes, and not just a type discriminator over hardcoded types: a block
type is a named set of fields, and users define new types by composing fields
("object" is a preset, not a universal base). `File` / `File Group` are the first
concrete types. See DESIGN.md §1. Open refinements remaining: relation-fields vs.
typed Connections (OQ-10), schema versioning (OQ-13).

### OQ-2: Are connections typed/labeled?

**v1: No** — v1 uses simple untyped `Link`s (line between two blocks) plus hidden
group membership. **Future:** typed, normalized, many-to-many connections (see the
"typed connection set (FUTURE)", "Normalize relationship direction", and
"Relationship cardinality & edge data" decisions, and DESIGN.md §2).

### OQ-3: Multi-view blocks — presentational only, or can views expose new fields?

The user said changing view "does not change the items," but a File Group's list
view apparently needs metadata (file size, dates) that a card view might not show.
Open: is a view **purely presentational** (same data, different layout), or can a
view expose fields absent from other views? This is the crux of the block data
model. If views can add fields, that's a data-model change, not just a view change.
**Working analysis: [DESIGN.md §3](./DESIGN.md#3-block-views). Lean: views are projections over one canonical data shape.**

### OQ-4: Persistence timing

Decision says canvas-first with in-memory data. Open: exactly when do we introduce
local persistence (save/load as JSON/file?) and then a real backend + PostgreSQL?

### OQ-5: Backend framework (Hono vs Express)

When a backend is added, choose between Hono (modern, lightweight) and Express
(battle-tested). Not decided yet; leaning Hono.

### OQ-6: Monorepo flavor

pnpm workspaces + turborepo with `apps/web` + `packages/board-core`, vs. a single
app with clearly separated `src/board/` module that is refactored into a package
later. The user said "add x to it when thought through."

### OQ-7: Auth scope

"Anyone could use this project freely" + "login would be nice" were both raised,
and login is deferred. Open: when auth arrives, single-user local vs. multi-user
server, and Better Auth vs. roll-your-own sessions.

### OQ-8: Collaboration timeline

Real-time collaboration is eventually desired but "too hard" now. Open: what sync
approach (WebSockets, CRDTs, etc.) and when. Not blocking v1.

### OQ-9: Asset store / side panel (from grilling)

Separate from board placement: where do uploaded files live, and how are they
referenced? Open: how to model the asset library (side panel) as its own store
distinct from canvas blocks, and whether the asset store itself participates in
the project-knowledge graph.

### OQ-10: Does a block contain blocks? (the container question — from grilling)

The brief/flat model and your "File Group" block type imply blocks can *contain*
blocks (nesting). Open: is containment a separate nesting mechanism, a typed
`parent` connection, both, or unsupported in v1? This is the largest unresolved
data-model question — it determines whether the graph has one mechanism or two.
Related to GRILL-1 and to OQ-9. See also DESIGN.md §"Relations" discussion.

### OQ-11: Rendering primitive on the custom canvas (from grilling)

DOM nodes (absolutely-positioned divs) vs. HTML5 Canvas drawing vs. a hybrid. Open:
performance ceiling with many blocks, text editing, accessibility, selection
overlay. Lean toward DOM nodes for blocks + canvas/overlay for the plane, but not
yet decided.

*Update: the rendering direction is now settled — see the "Rendering — DOM/React
blocks" decision above. This open question is reduced to confirming the concrete
implementation details (how much to canvas vs. overlay), not the fundamental choice.*

### OQ-13: Persistence format & schema versioning (from grilling)

When local save/load arrives (likely JSON file for now), the `data` blobs/edges
can grow, so the file needs a **schema version** from day one or future migrations
break old files. Open: commit to versioned serialization now vs. risk it.

### OQ-14: Edge lifecycle on deletion (from grilling)

Rough-edge: when a node is deleted, what happens to its connections? Open:
cascade-delete edges, block deletion with orphaning, or prompt. (The point-vs-asset
decision in this file reduces the stakes — deleting a node deletes a placement, and
its edges probably cascade — but the exact rule is not yet fixed.)
