// The size chosen under Aa ("Text size", the CSS variable --practice-zoom on <html>) as a number, for the parts that
// cannot use CSS zoom: the result grid has fixed row heights and a virtualizer. Appearance.tsx fires TEXT_ZOOM_EVENT on a change.
import { useEffect, useState } from 'react'

export const TEXT_ZOOM_EVENT = 'stratalab-text-zoom'

function readZoom(): number {
  const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--practice-zoom'))
  return n >= 1 && n <= 2 ? n : 1
}

export function useTextZoom(): number {
  const [z, setZ] = useState(readZoom)
  useEffect(() => {
    const on = () => setZ(readZoom())
    on()
    window.addEventListener(TEXT_ZOOM_EVENT, on)
    return () => window.removeEventListener(TEXT_ZOOM_EVENT, on)
  }, [])
  return z
}
