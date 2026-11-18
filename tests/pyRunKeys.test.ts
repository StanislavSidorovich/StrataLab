import { describe, expect, it } from 'vitest'
import { cellRunPlan } from '../src/core/pyCells'
import { PYTHON_STARTER } from '../src/data/demo'

const lineOf = (text: string) => (pos: number) => text.slice(0, pos).split('\n').length
const plan = (text: string, head: number, move: boolean, from = head, to = head) => cellRunPlan(text, { from, to, head }, move, lineOf(text))
const T = '# %%\na = 1\n# %%\nb = 2\n# %%\nc = 3\n'

describe('Python tab run keys (Ctrl+Enter = this cell, Shift+Enter = this cell and on)', () => {
  it('Ctrl+Enter runs the cell at the cursor and leaves the cursor', () => {
    const r = plan(T, T.indexOf('b = 2') + 2, false)
    expect(r.run?.code).toBe('b = 2')
    expect(r.run?.index).toBe(1)
    expect(r.cursor).toBeNull()
  })

  it('a cursor on the marker line belongs to the cell below it', () => {
    expect(plan(T, T.indexOf('# %%\nb'), false).run?.code).toBe('b = 2')
    expect(plan(T, T.indexOf('# %%\nb') + 3, false).run?.code).toBe('b = 2')
  })

  it('the selection wins for Ctrl+Enter, not for Shift+Enter', () => {
    const a = T.indexOf('b = 2')
    expect(plan(T, a, false, a, a + 1).run?.code).toBe('b')
    expect(plan(T, a, true, a, a + 1).run?.code).toBe('b = 2')
  })

  it('Shift+Enter moves to the line after the next marker; on the last cell to the end, adding nothing', () => {
    expect(plan(T, 7, true).cursor).toBe(T.indexOf('b = 2'))
    expect(plan(T, T.indexOf('c = 3'), true).cursor).toBe(T.length)
  })

  it('no marker: the whole tab is one cell; text above the first marker is its own cell', () => {
    expect(plan('x = 1\ny = 2', 3, false).run?.code).toBe('x = 1\ny = 2')
    const t = 'import os\n# %%\nz = 1\n'
    expect(plan(t, 2, false).run?.code).toBe('import os')
  })

  it('empty or markdown cell, empty tab: nothing runs, nothing breaks', () => {
    expect(plan('# %%\n\n# %%\nq = 1\n', 5, false).run).toBeNull()
    expect(plan('# %% [markdown]\n# hello\n', 20, true).run).toBeNull()
    expect(plan('', 0, false)).toEqual({ run: null, cursor: null })
    expect(plan('', 0, true)).toEqual({ run: null, cursor: null })
  })

  it('the starter tab tells the new keys (Ctrl+Enter is not "every cell")', () => {
    expect(PYTHON_STARTER).toContain('Ctrl+Shift+Enter')
    expect(PYTHON_STARTER).not.toMatch(/every cell: Ctrl\+Enter/)
  })
})
