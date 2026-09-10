/**
 * Simple AES-GCM encryption for storing API keys at rest.
 * Master key is derived from AI_ENCRYPTION_KEY env var (32 bytes base64).
 * If not set, keys are stored in plaintext (dev only).
 */

const ALGO = 'AES-GCM'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 12 // 96 bits for GCM

let masterKeyPromise: Promise<CryptoKey | null> | null = null

async function getMasterKey(): Promise<CryptoKey | null> {
  if (masterKeyPromise) return masterKeyPromise

  masterKeyPromise = (async () => {
    const b64 = process.env.AI_ENCRYPTION_KEY
    if (!b64) return null
    try {
      const raw = Buffer.from(b64, 'base64')
      if (raw.length !== KEY_LENGTH) return null
      return crypto.subtle.importKey('raw', raw, ALGO, false, ['encrypt', 'decrypt'])
    } catch {
      return null
    }
  })()

  return masterKeyPromise
}

export async function encryptApiKey(plaintext: string): Promise<string> {
  const key = await getMasterKey()
  if (!key) return plaintext // dev fallback: store plaintext

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)
  const cipher = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded)
  const combined = Buffer.concat([Buffer.from(iv), Buffer.from(cipher)])
  return combined.toString('base64')
}

export async function decryptApiKey(ciphertext: string): Promise<string> {
  const key = await getMasterKey()
  if (!key) return ciphertext // dev fallback: return as-is

  try {
    const combined = Buffer.from(ciphertext, 'base64')
    if (combined.length < IV_LENGTH + 1) return ciphertext
    const iv = combined.subarray(0, IV_LENGTH)
    const data = combined.subarray(IV_LENGTH)
    const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data)
    return new TextDecoder().decode(decrypted)
  } catch {
    return ciphertext // corrupted or legacy plaintext
  }
}