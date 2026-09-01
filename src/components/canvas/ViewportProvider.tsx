import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { DEFAULT_VIEWPORT } from '#/lib/canvas/transform'
import type { ViewportTransform } from '#/lib/canvas/transform'

interface ViewportApi {
  viewport: ViewportTransform
  setViewport: (viewport: ViewportTransform) => void
}

const ViewportContext = createContext<ViewportApi | null>(null)

export function ViewportProvider({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<ViewportTransform>(DEFAULT_VIEWPORT)

  const api = useMemo<ViewportApi>(() => ({ viewport, setViewport }), [viewport])

  return <ViewportContext.Provider value={api}>{children}</ViewportContext.Provider>
}

export function useViewport(): ViewportApi {
  const api = useContext(ViewportContext)
  if (!api) {
    throw new Error('useViewport must be used within a ViewportProvider')
  }
  return api
}