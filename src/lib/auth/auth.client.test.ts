// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getCollections } from '#/collections'
import { clearClientCaches, signOut } from './auth.client'

// Mock logoutFn
vi.mock('#/lib/auth/auth.functions', () => ({
  logoutFn: vi.fn().mockResolvedValue({ ok: true }),
}))

import { logoutFn } from '#/lib/auth/auth.functions'

describe('auth.client', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient()
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('clearClientCaches', () => {
    it('clears query cache, collection cache, and localStorage chat keys', () => {
      // Seed query client
      queryClient.setQueryData(['boards'], [{ id: 'b1', name: 'Board 1' }])
      expect(queryClient.getQueryData(['boards'])).toBeDefined()

      // Seed collection cache
      const cols1 = getCollections(queryClient, 'b1')
      expect(getCollections(queryClient, 'b1')).toBe(cols1)

      // Seed localStorage chat keys & unrelated keys
      localStorage.setItem('khoja.chat.b1.thread-1', 'chat-blob')
      localStorage.setItem('khoja.chat.b1.index', '[]')
      localStorage.setItem('tanstack-ai:khoja-board-ask', 'legacy-blob')
      localStorage.setItem('theme', 'dark')

      clearClientCaches(queryClient)

      // Query cache cleared
      expect(queryClient.getQueryData(['boards'])).toBeUndefined()

      // Collection cache reset (getCollections generates new instance)
      const cols2 = getCollections(queryClient, 'b1')
      expect(cols2).not.toBe(cols1)

      // Chat localStorage wiped, theme kept
      expect(localStorage.getItem('khoja.chat.b1.thread-1')).toBeNull()
      expect(localStorage.getItem('khoja.chat.b1.index')).toBeNull()
      expect(localStorage.getItem('tanstack-ai:khoja-board-ask')).toBeNull()
      expect(localStorage.getItem('theme')).toBe('dark')
    })
  })

  describe('signOut', () => {
    it('calls logoutFn, clears caches, and navigates to login', async () => {
      const navigate = vi.fn().mockResolvedValue(undefined)
      queryClient.setQueryData(['user'], { id: 'u1' })
      localStorage.setItem('khoja.chat.b1.t1', 'message')

      await signOut({ queryClient, navigate })

      expect(logoutFn).toHaveBeenCalledWith({ data: undefined })
      expect(queryClient.getQueryData(['user'])).toBeUndefined()
      expect(localStorage.getItem('khoja.chat.b1.t1')).toBeNull()
      expect(navigate).toHaveBeenCalledWith({
        to: '/login',
        search: { redirect: undefined },
      })
    })

    it('clears caches and navigates to login even if logoutFn throws', async () => {
      vi.mocked(logoutFn).mockRejectedValueOnce(new Error('Network error'))
      const navigate = vi.fn().mockResolvedValue(undefined)
      queryClient.setQueryData(['user'], { id: 'u1' })
      localStorage.setItem('khoja.chat.b1.t1', 'message')

      await expect(signOut({ queryClient, navigate })).rejects.toThrow('Network error')

      expect(queryClient.getQueryData(['user'])).toBeUndefined()
      expect(localStorage.getItem('khoja.chat.b1.t1')).toBeNull()
      expect(navigate).toHaveBeenCalledWith({
        to: '/login',
        search: { redirect: undefined },
      })
    })
  })
})
