// The dashboard's slicers as the screens see them: the filter (Chain, Brand) is kept by the page, so the Dashboard and the
// More question that is answered with the slicers share it.
import { createContext, useContext } from 'react'
import { NO_SLICE, type SliceFilter } from '../../core/buildSlice'

export interface SliceValue {
  filter: SliceFilter
  setFilter: (f: SliceFilter) => void
}

export const SliceContext = createContext<SliceValue>({ filter: NO_SLICE, setFilter: () => undefined })
export const useSlice = () => useContext(SliceContext)
