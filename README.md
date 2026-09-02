# Kho-ja Board

A spatial knowledge workspace built on an infinite canvas. Blocks are persisted
to PostgreSQL and synchronized through TanStack DB collections.

## Stack

- TanStack Start and Router
- TanStack Query and DB
- TanStack Markdown
- React 19 and Tailwind CSS
- Drizzle ORM and PostgreSQL

## Local development

Requirements: Node.js 24+, npm 11+, and PostgreSQL.

```bash
npm install
```

Create `.env.local`:

```dotenv
DATABASE_URL=postgres://user:password@localhost:5432/kho_ja
```

Apply the schema and start the app:

```bash
npm run db:push
npm run dev
```

The board is available at `http://localhost:3000/`.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
```

See [docs/README.md](docs/README.md) for the product documentation and
[docs/START_PLAN.md](docs/START_PLAN.md) for the milestone plan.
