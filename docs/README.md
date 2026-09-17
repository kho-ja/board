# Kho-ja Board

A visual project-knowledge and project-management platform, inspired by FigJam and Notion.

The core problem: a project contains a huge amount of information (requirements,
architecture, features, tasks, people, documents, APIs, databases, decisions,
meeting notes, links, screenshots, history) — and this information is normally
scattered across many tools. This project builds a system where that information
can be organized visually on a board so a person joining an unfamiliar project can
quickly understand: **What is this project? How does it work? Who is responsible
for what? What is happening now?**

## Status

**v1 canvas scope complete (M0–M18).** The block/asset model, board placements,
group memberships, custom object schemas, typed relationships + diagrams, block
views, and the Ask/AI panel are all implemented, tested (155 vitest tests), and
live-verified against local PostgreSQL. The full v1 feature line is frozen and
documented in [ROADMAP.md](./ROADMAP.md); the consciously deferred power features
are real-time collaboration and deeper AI querying of structured board data.

Implementation notes live in [DEVELOPMENT.md](./DEVELOPMENT.md) (run, env, and
database setup). See [ROADMAP.md](./ROADMAP.md) for milestone-by-milestone scope.

## Main concepts

- **Board (Project)** — One board = one project. An infinite, freely movable
  canvas.
- **Project model** — A project is the union of two parts: a persistent **asset
  library / side panel** (holds content) and the **board** (holds placements that
  *point into* the library — placements and group memberships are **references to
  one canonical block**, never copies). A block is simply **placed / not placed**:
  removing it from the board keeps it available in the side panel (for **every**
  block type), and only an explicit delete from the panel removes it permanently.
  This is a deliberate data-safety decision — see DECISIONS.md.
- **Blocks** — Instances of a **block type**. There are **two coexisting kinds of
  block types**: first-class **default types** (`file`, `file-group`, `text`), and
  **custom schema-driven types** that you build by composing fields into a schema
  ("infinitely expandable, like Notion" — via an "object"-style schema). The schema
  **creator is part of v1**; defaults coexist alongside it. A block has a position
  on the canvas. A **File Group is itself a block** that *contains* member blocks.
- **Block Views** — A single block can have several switchable views (e.g. a File
  Group can show as cards or as a list). Views are **user-editable option-sets**
  (which fields, layout, sort), not hardcoded layouts. Type-level defaults +
  per-block overrides; reusable named views. The **side panel** is a view-based
  browser reusing this system. Views change presentation without changing the
  underlying items.
- **Relationships** — **Typed, labeled connections** (`depends-on`,
  `responsible-for`, `part-of`, `related-to`, `custom`) with a canvas line and a
  fill tool; **group membership** (e.g. pasting files into a File Group) remains
  the primary folder-like relation.

## Design

The core knowledge model (blocks, relationships, views) is settled and
implemented. See **[DESIGN.md](./DESIGN.md)** for the working direction and
**[DECISIONS.md](./DECISIONS.md)** for the settled decisions.

## Principles

- **Working software > impressive architecture.**
- **Clear project knowledge > unnecessary complexity.**
- Build the underlying project-knowledge model first; add AI last (the AI should
  answer questions about the project's *real* structured information, not be a
  generic disconnected chatbot). Ask — powered by server tools over the board's
  real data — is that shape of AI.
- Incremental development. Do not rewrite working parts unnecessarily.
- Documentation is part of the implementation.

## Roadmap

See [ROADMAP.md](./ROADMAP.md).

## How to run

Full-send TanStack (Start + Router + Query + DB) with local PostgreSQL, plus the
Ask AI panel. Setup and commands are in [DEVELOPMENT.md](./DEVELOPMENT.md):
install deps, create a Postgres database, set `DATABASE_URL` (and optional AI
keys) in `.env.local`, `npx drizzle-kit push`, then `npm run dev`.

## Repository layout

```text
docs/   # Project documentation (roadmap, decisions, design, plans)
src/    # TanStack Start app (routes, db, components, lib)
```
