// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from './password.server'

describe('hashPassword', () => {
  it('produces a self-describing scrypt digest', async () => {
    const digest = await hashPassword('correct horse battery staple')
    const parts = digest.split('$')

    expect(parts).toHaveLength(6)
    expect(parts[0]).toBe('scrypt')
    expect(Number(parts[1])).toBeGreaterThanOrEqual(16384)
    expect(Number(parts[2])).toBeGreaterThanOrEqual(8)
    expect(Number(parts[3])).toBeGreaterThanOrEqual(1)
  })

  it('never stores the password itself', async () => {
    const digest = await hashPassword('hunter2-hunter2')
    expect(digest).not.toContain('hunter2')
  })

  it('salts, so the same password hashes differently every time', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toBe(b)
  })
})

describe('verifyPassword', () => {
  it('accepts the password that produced the digest', async () => {
    const digest = await hashPassword('correct horse battery staple')
    await expect(
      verifyPassword('correct horse battery staple', digest),
    ).resolves.toBe(true)
  })

  it('rejects a wrong password', async () => {
    const digest = await hashPassword('correct horse battery staple')
    await expect(
      verifyPassword('correct horse battery stapl', digest),
    ).resolves.toBe(false)
  })

  it('is case sensitive', async () => {
    const digest = await hashPassword('Passw0rd')
    await expect(verifyPassword('passw0rd', digest)).resolves.toBe(false)
  })

  it('treats a malformed digest as a wrong password, not a crash', async () => {
    await expect(verifyPassword('anything', 'not-a-digest')).resolves.toBe(false)
    await expect(verifyPassword('anything', '')).resolves.toBe(false)
    await expect(
      verifyPassword('anything', 'scrypt$16384$8$1$onlyfour$parts'),
    ).resolves.toBe(false)
    await expect(
      verifyPassword('anything', 'bcrypt$16384$8$1$AAAA$BBBB'),
    ).resolves.toBe(false)
  })

  it('normalises unicode so the same typed password verifies', async () => {
    // "é" composed (U+00E9) vs decomposed (e + U+0301).
    const composed = 'caf\u00e9'
    const decomposed = 'cafe\u0301'
    const digest = await hashPassword(composed)
    await expect(verifyPassword(decomposed, digest)).resolves.toBe(true)
  })
})

describe('validatePasswordStrength', () => {
  it('accepts a long enough password', () => {
    expect(validatePasswordStrength('longenoughpassword')).toBeNull()
  })

  it('rejects a short password', () => {
    expect(validatePasswordStrength('short')).toContain(
      String(MIN_PASSWORD_LENGTH),
    )
    expect(validatePasswordStrength('')).toBeTruthy()
  })
})
