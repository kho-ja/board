import { and, eq } from 'drizzle-orm'

import { db } from '#/db/client'
import { users } from '#/db/schema'

/** Server-only user records. Password hashes never leave this module. */

export interface UserRecord {
  id: string
  email: string
  name: string | null
  passwordHash: string
  createdAt: Date
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1)
  return rows[0] ?? null
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createUser(values: {
  email: string
  passwordHash: string
  name?: string | null
}): Promise<UserRecord> {
  const rows = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: normalizeEmail(values.email),
      passwordHash: values.passwordHash,
      name: values.name?.trim() || null,
    })
    .returning()
  return rows[0]
}

/** True when the address is already taken (case-insensitive). */
export async function emailTaken(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1)
  return rows.length > 0
}

/** Remove a user entirely. Sessions and API keys cascade. */
export async function deleteUser(id: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id))
}

/** Look up every user id that owns a board — used by the board importer. */
export async function listUserIds(): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users)
  return rows.map((r) => r.id)
}

/** Whether the user exists (used when sharing a board by email). */
export async function userExistsByEmail(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, normalizeEmail(email))))
    .limit(1)
  return rows.length > 0
}
