import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { BlockShell } from '#/components/canvas/BlockShell'
import { ViewportProvider } from '#/components/canvas/ViewportProvider'
import type { ObservableBlock, ObservablePlacement } from '#/components/canvas/BlockShell'
import type { FileBlockData } from '#/types'

afterEach(cleanup)

function renderShell(view?: FileBlockData['view']) {
  const block: ObservableBlock = {
    id: 'badge-1',
    kind: 'file',
    schemaVersion: '1',
    data: {
      kind: 'file',
      name: 'badge.svg',
      size: 512,
      mimeType: 'image/svg+xml',
      content: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"></svg>',
      view,
    } satisfies FileBlockData,
  }
  const placement: ObservablePlacement = { blockId: 'badge-1', positionX: 0, positionY: 0 }
  const onBlockViewChange = vi.fn()
  const utils = render(
    <ViewportProvider>
      <BlockShell
        block={block}
        placement={placement}
        onDragEnd={() => {}}
        onBlockViewChange={onBlockViewChange}
      />
    </ViewportProvider>,
  )
  const shell = utils.container.querySelector('.block-shell')!
  return { block, onBlockViewChange, utils, shell }
}

describe('BlockShell view context menu (M17)', () => {
  it('opens on right-click of a file block with the three views and the active one checked', () => {
    const { shell } = renderShell('content')
    fireEvent.contextMenu(shell, { clientX: 40, clientY: 40 })

    const items = screen
      .getAllByRole('menuitemradio')
      .map((el) => ({ label: el.textContent!.replace('✓', '').trim(), checked: el.getAttribute('aria-checked') }))
    expect(items).toEqual([
      { label: 'Card', checked: 'false' },
      { label: 'Content', checked: 'true' },
      { label: 'Meta', checked: 'false' },
    ])
  })

  it('falls back the menu check to the kind default when no view is stored', () => {
    const { shell } = renderShell()
    fireEvent.contextMenu(shell, { clientX: 40, clientY: 40 })
    const checked = screen
      .getAllByRole('menuitemradio')
      .find((el) => el.getAttribute('aria-checked') === 'true')
    expect(checked?.textContent).toContain('Card')
  })

  it('reports the picked view and closes the menu', async () => {
    const { shell, onBlockViewChange } = renderShell()
    fireEvent.contextMenu(shell, { clientX: 40, clientY: 40 })
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Meta/ }))

    expect(onBlockViewChange).toHaveBeenCalledTimes(1)
    expect(onBlockViewChange).toHaveBeenCalledWith('badge-1', 'meta')
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  it('does not fire on kinds without views and leaves the default context menu alone', () => {
    const textBlock: ObservableBlock = {
      id: 'note-1',
      kind: 'text',
      schemaVersion: '1',
      data: { kind: 'text', markdown: '# Note' },
    }
    const placement: ObservablePlacement = { blockId: 'note-1', positionX: 0, positionY: 0 }
    const onBlockViewChange = vi.fn()
    render(
      <ViewportProvider>
        <BlockShell
          block={textBlock}
          placement={placement}
          onDragEnd={() => {}}
          onBlockViewChange={onBlockViewChange}
        />
      </ViewportProvider>,
    )
    const shell = screen.getByText('Note').closest('.block-shell')!
    fireEvent.contextMenu(shell, { clientX: 40, clientY: 40 })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onBlockViewChange).not.toHaveBeenCalled()
  })
})