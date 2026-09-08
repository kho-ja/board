import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

import * as schema from './schema.ts'

const globalForDb = globalThis as unknown as {
  pool?: Pool
  db?: ReturnType<typeof createDb>
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
 * In development, re-create db if schema has new tables (e.g. links)
 * while preserving the underlying connection pool singleton.
 */
function getDb() {
  if (!globalForDb.db || !globalForDb.db.query?.links) {
    globalForDb.db = createDb()
  }
  return globalForDb.db
}

export const db = getDb()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db
}
