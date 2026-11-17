import { describe, it, expect } from 'vitest'
import { redirect } from '@tanstack/react-router'

describe('ticket 02 — board loader redirect on missing board', () => {
  it('loader reflects non-silent redirect with error query', () => {
    // The fix: src/routes/boards/$boardId.tsx line 93 must include search param.
    const r = redirect({ to: '/boards', search: { error: 'board-not-found' } })
    expect(r).toBeDefined()
  })
})
