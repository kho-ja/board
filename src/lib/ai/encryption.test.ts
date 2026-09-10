import { beforeEach, describe, expect, it, vi } from 'vitest'

const KEY_32 = Buffer.alloc(32, 0x5a).toString('base64')

async function loadEncryption() {
  const { decryptApiKey, encryptApiKey } = await import('./encryption')
  return { encryptApiKey, decryptApiKey }
}

describe('encryption (AI_ENCRYPTION_KEY set)', () => {
  beforeEach(() => {
    process.env.AI_ENCRYPTION_KEY = KEY_32
    vi.resetModules()
  })

  it('round-trips a key to ciphertext and back', async () => {
    const { encryptApiKey, decryptApiKey } = await loadEncryption()
    const plaintext = 'sk-proj-1234567890abcdef'
    const stored = await encryptApiKey(plaintext)
    expect(stored).not.toBe(plaintext)
    expect(await decryptApiKey(stored)).toBe(plaintext)
  })

  it('produces unique ciphertext for the same plaintext (randomized IV)', async () => {
    const { encryptApiKey } = await loadEncryption()
    const a = await encryptApiKey('sk-test-abcdef')
    const b = await encryptApiKey('sk-test-abcdef')
    expect(a).not.toBe(b)
  })

  it('decrypting garbage falls back to the input instead of throwing', async () => {
    const { decryptApiKey } = await loadEncryption()
    expect(await decryptApiKey('not-a-valid-ciphertext')).toBe('not-a-valid-ciphertext')
  })
})

describe('encryption (dev fallback, no AI_ENCRYPTION_KEY)', () => {
  beforeEach(() => {
    delete process.env.AI_ENCRYPTION_KEY
    vi.resetModules()
  })

  it('stores plaintext and returns it as-is (local dev only)', async () => {
    const { encryptApiKey, decryptApiKey } = await loadEncryption()
    const stored = await encryptApiKey('sk-dev')
    expect(stored).toBe('sk-dev')
    expect(await decryptApiKey(stored)).toBe('sk-dev')
  })
})