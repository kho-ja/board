import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { ToolRail } from '#/components/canvas/ToolRail'

afterEach(cleanup)

/**
 * The tool rail is a shadcn ToggleGroup, so the selected tool is marked with
 * `aria-pressed` (Base UI also sets `data-pressed`) rather than with a class
 * of our own. The brand stylesheet keys the selected state off that attribute,
 * so the DOM contract and the CSS have to agree -- a regression in either one
 * leaves the active tool looking identical to the inactive ones.
 */
describe('ToolRail', () => {
  it('marks the active tool as pressed', () => {
    render(<ToolRail tool="hand" onSelect={() => {}} />)

    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')

    expect(pressed).toHaveLength(1)
    expect(pressed[0].getAttribute('aria-label')).toBe('Hand (H)')
  })

  it('leaves the other tools unpressed', () => {
    render(<ToolRail tool="hand" onSelect={() => {}} />)

    const move = screen.getByRole('button', { name: /Move/ })
    expect(move.getAttribute('aria-pressed')).toBe('false')
  })
})
