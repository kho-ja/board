import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * Password hashing.
 *
 * scrypt from `node:crypto` — no third-party dependency, and the same
 * primitive OS-backed password stores use. The digest is self-describing so
 * the cost parameters can be raised later without invalidating existing
 * hashes: `scrypt$N$r$p$salt$hash`.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>

const ALGORITHM = 'scrypt'

// OWASP's minimum recommended scrypt parameters (N=2^14, r=8, p=1). Node's
// default 32 MB scrypt memory cap is enough for these (128 * N * r = 16 MB).
const COST = 16384
const BLOCK_SIZE = 8
const PARALLELIZATION = 1

const SALT_LENGTH = 16
const KEY_LENGTH = 64

export const MIN_PASSWORD_LENGTH = 8

/**
 * Normalize before hashing so a password typed with a composed vs decomposed
 * Unicode form still verifies.
 */
function canonicalize(password: string): string {
  return password.normalize('NFKC')
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scryptAsync(canonicalize(password), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
  })
  return [
    ALGORITHM,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

/**
 * Verify a password against a stored digest.
 *
 * Returns false (never throws) for malformed digests so a corrupt row reads
 * as "wrong password" rather than a 500.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6) return false

  const [algorithm, costRaw, blockRaw, parallelRaw, saltRaw, hashRaw] = parts
  if (algorithm !== ALGORITHM) return false

  const cost = Number(costRaw)
  const blockSize = Number(blockRaw)
  const parallelization = Number(parallelRaw)
  if (
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelization) ||
    cost < 2 ||
    blockSize < 1 ||
    parallelization < 1
  ) {
    return false
  }

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(saltRaw, 'base64url')
    expected = Buffer.from(hashRaw, 'base64url')
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false

  let derived: Buffer
  try {
    derived = await scryptAsync(canonicalize(password), salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
    })
  } catch {
    return false
  }

  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

/** Cheap client-side rule; the server re-checks it. */
export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}
