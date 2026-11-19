import { describe, expect, it } from 'vitest'
import {
  EDITOR_MIN,
  SIDE_PANEL_KEY,
  SIDE_PANEL_MIN,
  SIDE_PANEL_STEP,
  clampSidePanelWidth,
  defaultSidePanelWidth,
  effectiveSidePanelWidth,
  keySidePanelWidth,
  maxSidePanelWidth,
  parseSidePanelWidth,
} from '../src/core/sidePanelWidth'

describe('side panel width', () => {
  it('starts as it was before it could be resized: 384 px on a wide window, 320 px under 1024', () => {
    expect(SIDE_PANEL_KEY).toBe('stratalab.sidePanelWidth')
    expect(defaultSidePanelWidth(1366)).toBe(384)
    expect(defaultSidePanelWidth(1024)).toBe(384)
    expect(defaultSidePanelWidth(1023)).toBe(320)
    expect(defaultSidePanelWidth(768)).toBe(320)
  })

  it('the editor keeps 360 px: the maximum is the row minus 360, never under the minimum', () => {
    expect(maxSidePanelWidth(1366 - 256)).toBe(1110 - EDITOR_MIN)
    expect(maxSidePanelWidth(1920 - 256)).toBe(1664 - EDITOR_MIN)
    expect(maxSidePanelWidth(900)).toBe(540)
    // a row too narrow for both: the panel keeps its minimum (the editor gives way, as it always did)
    expect(maxSidePanelWidth(600)).toBe(SIDE_PANEL_MIN)
    expect(maxSidePanelWidth(0)).toBe(SIDE_PANEL_MIN)
  })

  it('clamps into the limits, also for odd numbers', () => {
    expect(clampSidePanelWidth(100, 1110)).toBe(320)
    expect(clampSidePanelWidth(5000, 1110)).toBe(750)
    expect(clampSidePanelWidth(500.4, 1110)).toBe(500)
    expect(clampSidePanelWidth(NaN, 1110)).toBe(320)
    expect(clampSidePanelWidth(Infinity, 1110)).toBe(320)
  })

  it('reads only a usable stored value', () => {
    expect(parseSidePanelWidth('480')).toBe(480)
    expect(parseSidePanelWidth('480.6')).toBe(481)
    expect(parseSidePanelWidth('320')).toBe(320)
    for (const bad of [null, '', '  ', 'wide', '319', '0', '-400', 'NaN', 'Infinity']) expect(parseSidePanelWidth(bad), String(bad)).toBeNull()
  })

  it('a narrower window pulls the saved width in, and a wider one gives it back', () => {
    expect(effectiveSidePanelWidth(700, 1110, 1366)).toBe(700)
    expect(effectiveSidePanelWidth(700, 800, 1000)).toBe(440)
    expect(effectiveSidePanelWidth(700, 1110, 1366)).toBe(700)
    expect(effectiveSidePanelWidth(null, 1110, 1366)).toBe(384)
    expect(effectiveSidePanelWidth(null, 700, 900)).toBe(320)
  })

  it('arrow keys: Left widens by 16, Right narrows, both stop at the limits; other keys do nothing', () => {
    expect(SIDE_PANEL_STEP).toBe(16)
    expect(keySidePanelWidth('ArrowLeft', 384, 1110)).toBe(400)
    expect(keySidePanelWidth('ArrowRight', 384, 1110)).toBe(368)
    expect(keySidePanelWidth('ArrowRight', 320, 1110)).toBe(320)
    expect(keySidePanelWidth('ArrowLeft', 750, 1110)).toBe(750)
    expect(keySidePanelWidth('Home', 500, 1110)).toBe(320)
    expect(keySidePanelWidth('End', 500, 1110)).toBe(750)
    expect(keySidePanelWidth('ArrowUp', 500, 1110)).toBeNull()
    expect(keySidePanelWidth('a', 500, 1110)).toBeNull()
  })
})
