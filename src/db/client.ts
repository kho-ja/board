import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

import * as schema from './schema.ts'

const globalForDb = globalThis as unknown as {
  pool?: Pool
  db?: ReturnType<typeof createDb>
  schema?: typeof schema
}

function getPool() {
  if (!globalForDb.pool) {
    globalForDb.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  }
  return globalForDb.pool
}

function createDb() {
  return drizzle(getPool(), { schema, logger: false })
}

/**
 * Server-only Drizzle client.
 *
 * In development, the schema module can be re-evaluated on hot reload. Rebuild
 * the Drizzle client whenever the schema reference changes so newly added
 * tables/columns are visible, while keeping the underlying connection pool
 * singleton intact across reloads.
 */
function getDb() {
  if (!globalForDb.db || globalForDb.schema !== schema) {
    globalForDb.schema = schema
    globalForDb.db = createDb()
  }
  return globalForDb.db
}

export const db = getDb()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db
  globalForDb.schema = schema
}
