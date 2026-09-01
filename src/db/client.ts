import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

import * as schema from './schema.ts'

const globalForDb = globalThis as unknown as {
  db?: ReturnType<typeof createDb>
}

function createDb() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })
  return drizzle(pool, { schema, logger: false })
}

/**
 * Server-only Drizzle client (single Pool singleton per process).
 * Kept as a module-level singleton so dev hot reload does not open new pools.
 */
export const db = globalForDb.db ?? createDb()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db
}
