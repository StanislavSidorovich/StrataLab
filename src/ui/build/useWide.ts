// True on a laptop-sized window (1100 px and up): the Clean step puts its task into the left column there; below, above the grid.
import { useEffect, useState } from 'react'

export const WIDE_QUERY = '(min-width: 1100px)'

export function useWide(): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_QUERY).matches : true)
  const [wide, setWide] = useState(get)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const m = window.matchMedia(WIDE_QUERY)
    const on = () => setWide(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}
