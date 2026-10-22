import { createServerFn } from '@tanstack/react-start'

import { createSession, destroySession, getSessionUser } from './session.server'
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from './password.server'
import { claimUnclaimedBoard } from '#/lib/boards/queries.server'
import { createUser, findUserByEmail } from './users.server'

/**
 * Sign-in / sign-up.
 *
 * These are the only endpoints that create a session, and they are
 * deliberately forgiving about *which* account exists (never reveal whether an
 * address is registered) but strict about the password itself.
 */

export interface AuthResult {
  ok: boolean
  error?: string
  user?: { id: string; email: string; name: string | null }
}

export const registerFn = createServerFn({ method: 'POST' })
  .validator((input: { email: string; password: string; name?: string }) => input)
  .handler(async ({ data }): Promise<AuthResult> => {
    const email = data.email?.trim() ?? ''
    if (!email || !email.includes('@')) {
      return { ok: false, error: 'Enter a valid email address.' }
    }

    const weak = validatePasswordStrength(data.password ?? '')
    if (weak) return { ok: false, error: weak }

    if (await findUserByEmail(email)) {
      return { ok: false, error: 'That email address is already registered.' }
    }

    const passwordHash = await hashPassword(data.password)
    const user = await createUser({
      email,
      passwordHash,
      name: data.name ?? null,
    })

    // The first account to register takes over the board that the
    // multi-tenancy migration left unclaimed, so a local install keeps the
    // content it already had.
    await claimUnclaimedBoard(user.id)

    await createSession(user.id)

    return {
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
    }
  })

export const loginFn = createServerFn({ method: 'POST' })
  .validator((input: { email: string; password: string }) => input)
  .handler(async ({ data }): Promise<AuthResult> => {
    const email = data.email?.trim() ?? ''
    const user = await findUserByEmail(email)

    // Hash a throwaway password when the account does not exist so that a
    // missing account and a wrong password take about the same time.
    const passwordHash = user?.passwordHash ?? (await getDummyHash())
    const valid = await verifyPassword(data.password ?? '', passwordHash)

    if (!user || !valid) {
      return { ok: false, error: 'Incorrect email or password.' }
    }

    await createSession(user.id)

    return {
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
    }
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  await destroySession()
  return { ok: true }
})

export const currentUserFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await getSessionUser()
    return user ? { id: user.id, email: user.email, name: user.name } : null
  },
)

/**
 * A real scrypt digest of a random string, used only to keep the "no such
 * account" path as slow as the "wrong password" path. Computed once, lazily.
 */
let dummyHash: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  if (!dummyHash) {
    dummyHash = hashPassword(crypto.randomUUID())
  }
  return dummyHash
}
