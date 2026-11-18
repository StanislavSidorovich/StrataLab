import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExitButtons } from '../src/ui/build/BackToQuaera'

describe('exit buttons of the build and pipeline pages', () => {
  it('offer Back to Quaera and a ✕ Close that leads to Lab home', () => {
    const html = renderToStaticMarkup(createElement(ExitButtons, { onWorkbench: () => {}, testid: 'x' }))
    expect(html).toContain('aria-label="Back to Quaera"')
    expect(html).toContain('aria-label="Close"')
    expect(html).toContain('>Close<')
    expect(html).toContain('data-testid="x-workbench"')
  })
})
