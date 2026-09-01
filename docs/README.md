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

**Early foundation stage — planning/design phase.** We are deliberately
canvas-first: proving the block model and interaction feels right *before* adding
infrastructure (auth, database, collaboration, search, AI).

The current working priority is **finalizing the plan and the core knowledge-model
design** in [DESIGN.md](./DESIGN.md) and [DECISIONS.md](./DECISIONS.md) before
writing real implementation code. A provisional Vite + React + TypeScript scaffold
exists at the repo root purely to validate tooling — it is a placeholder and will
be reworked against the locked plan. See [ROADMAP.md](./ROADMAP.md) for scope.

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
  *(Working analysis in DESIGN.md §1.)*
- **Block Views** — A single block can have several switchable views (e.g. a File
  Group can show as cards or as a list). Views are **user-editable option-sets**
  (which fields, layout, sort), not hardcoded layouts. Type-level defaults +
  per-block overrides; reusable named views. The **side panel** is a view-based
  browser reusing this system. Views change presentation without changing the
  underlying items. *(Working analysis in DESIGN.md.)*
- **Relationships (v1)** — A simple "link with a line" between two blocks,
  optional and untyped, plus **group membership** (e.g. pasting files into a File
  Group). Users think in folders/relations, not arrows. Typed connections
  (`depends-on`, `responsible-for`, `part-of`, `related-to`) are a **future** power
  feature. *(Working analysis in DESIGN.md §2.)*

## Design

The core knowledge model (blocks, relationships, views) is the heart of the
product and is still being designed deliberately. See
**[DESIGN.md](./DESIGN.md)** for the working options, trade-offs, and direction,
and **[DECISIONS.md](./DECISIONS.md)** for settled decisions and open questions.

## Principles

- **Working software > impressive architecture.**
- **Clear project knowledge > unnecessary complexity.**
- Build the underlying project-knowledge model first; add AI last (the AI should
  answer questions about the project's *real* structured information, not be a
  generic disconnected chatbot).
- Incremental development. Do not rewrite working parts unnecessarily.
- Documentation is part of the implementation.

## Roadmap

See [ROADMAP.md](./ROADMAP.md).

## How to run

The stack is decided — **full-send TanStack** (Start + Router + Query + DB) with
PostgreSQL — and the provisional Vite/React scaffold is to be replaced with the
TanStack Start structure (see [START_PLAN.md](./START_PLAN.md)). Once the first
milestone (M0/M1) lands, full run instructions (scaffold, `DATABASE_URL`, Drizzle
setup, `npm run dev`) will live here (see also [DEVELOPMENT.md](./DEVELOPMENT.md)).

## Repository layout

```text
docs/   # Project documentation (the current source of truth)
src/    # Provisional Vite/React scaffold (to be replaced by the TanStack Start structure)
```
