import { describe, expect, it } from 'vitest'

import {
  BOARD_ROLE_RANK,
  canAdministerBoard,
  canEditBoard,
  isBoardRole,
  roleAtLeast,
} from './roles'

describe('board roles', () => {
  it('ranks owner above editor above viewer', () => {
    expect(BOARD_ROLE_RANK.owner).toBeGreaterThan(BOARD_ROLE_RANK.editor)
    expect(BOARD_ROLE_RANK.editor).toBeGreaterThan(BOARD_ROLE_RANK.viewer)
  })

  it('lets owners and editors change board content', () => {
    expect(canEditBoard('owner')).toBe(true)
    expect(canEditBoard('editor')).toBe(true)
    expect(canEditBoard('viewer')).toBe(false)
  })

  it('reserves board administration for owners', () => {
    expect(canAdministerBoard('owner')).toBe(true)
    expect(canAdministerBoard('editor')).toBe(false)
    expect(canAdministerBoard('viewer')).toBe(false)
  })

  it('accepts only known board roles', () => {
    expect(isBoardRole('owner')).toBe(true)
    expect(isBoardRole('editor')).toBe(true)
    expect(isBoardRole('viewer')).toBe(true)
    expect(isBoardRole('admin')).toBe(false)
    expect(isBoardRole('')).toBe(false)
    expect(isBoardRole(null)).toBe(false)
    expect(isBoardRole(undefined)).toBe(false)
  })
})

describe('roleAtLeast', () => {
  it('is the predicate the server guards use', () => {
    expect(roleAtLeast('owner', 'viewer')).toBe(true)
    expect(roleAtLeast('owner', 'editor')).toBe(true)
    expect(roleAtLeast('owner', 'owner')).toBe(true)

    expect(roleAtLeast('editor', 'viewer')).toBe(true)
    expect(roleAtLeast('editor', 'editor')).toBe(true)
    expect(roleAtLeast('editor', 'owner')).toBe(false)

    expect(roleAtLeast('viewer', 'viewer')).toBe(true)
    expect(roleAtLeast('viewer', 'editor')).toBe(false)
    expect(roleAtLeast('viewer', 'owner')).toBe(false)
  })
})
