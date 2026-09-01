import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

export function useElementSize<T extends HTMLElement>(): {
  ref: RefObject<T | null>
  width: number
  height: number
} {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const updateSize = () => {
      setSize({ width: el.clientWidth, height: el.clientHeight })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, width: size.width, height: size.height }
}