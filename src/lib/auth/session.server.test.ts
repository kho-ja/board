// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  DEV_SESSION_COOKIE,
  PROD_SESSION_COOKIE,
  cookieOptions,
  getSessionCookieName,
  hashToken,
} from './session.server'

describe('session cookie security', () => {
  describe('getSessionCookieName', () => {
    it('uses __Host- prefix in production to bind cookie to host', () => {
      expect(getSessionCookieName('production')).toBe(PROD_SESSION_COOKIE)
      expect(PROD_SESSION_COOKIE).toBe('__Host-kj_session')
    })

    it('uses standard name in development so plain HTTP works', () => {
      expect(getSessionCookieName('development')).toBe(DEV_SESSION_COOKIE)
      expect(DEV_SESSION_COOKIE).toBe('kj_session')
    })

    it('defaults to development when environment is unspecified', () => {
      expect(getSessionCookieName(undefined)).toBe(DEV_SESSION_COOKIE)
    })
  })

  describe('cookieOptions', () => {
    it('configures secure: true and sameSite: none in production', () => {
      const opts = cookieOptions('production')
      expect(opts).toEqual({
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
      })
    })

    it('configures secure: false and sameSite: lax in development over HTTP', () => {
      const opts = cookieOptions('development')
      expect(opts).toEqual({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      })
    })

    it('always enforces httpOnly and path "/" for __Host- compatibility', () => {
      const prodOpts = cookieOptions('production')
      const devOpts = cookieOptions('development')
      expect(prodOpts.httpOnly).toBe(true)
      expect(prodOpts.path).toBe('/')
      expect(devOpts.httpOnly).toBe(true)
      expect(devOpts.path).toBe('/')
    })
  })

  describe('hashToken', () => {
    it('computes sha256 hex hash of session token', () => {
      const token = 'test-token-12345'
      const hash1 = hashToken(token)
      const hash2 = hashToken(token)
      expect(hash1).toHaveLength(64)
      expect(hash1).toBe(hash2)
    })
  })
})
