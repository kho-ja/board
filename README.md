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

## AI (Ask panel, M15)

The left-dock **Ask** tab chats with the board through an agent that can read the
board snapshot, create blocks, and connect blocks (mutations require approval).

Providers, in priority order: API keys stored in Postgres (added in the Ask
panel's "API Keys" section) fall back to environment variables:

```dotenv
# Encryption for stored API keys — 32 bytes, base64 encoded:
#   node -e "console.log(crypto.randomBytes(32).toString('base64'))"
# Without it, keys are stored in plaintext (local dev only) and the panel warns.
AI_ENCRYPTION_KEY=

# OpenAI
OPENAI_API_KEY=
# OpenRouter
OPENROUTER_API_KEY=
# Ollama (local; default http://localhost:11434)
# OLLAMA_HOST=
# Custom OpenAI-compatible provider (shows a "custom" option when set)
AI_CUSTOM_BASE_URL=
AI_CUSTOM_NAME=
AI_CUSTOM_API_KEY=
AI_CUSTOM_MODEL=
```

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
```

See [docs/README.md](docs/README.md) for the product documentation and
[docs/START_PLAN.md](docs/START_PLAN.md) for the milestone plan.
