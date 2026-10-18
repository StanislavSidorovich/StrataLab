import { describe, expect, it } from 'vitest'
import { SETUP_TAG, datasetsUsed, fromNotebook, setupSource, toNotebook, type Output } from '../src/core/ipynb'
import { splitCells } from '../src/core/pyCells'

const tab = `# %% [markdown]\n# # Sales\n# By *month*.\n\n# %%\nimport pandas as pd\ndf = lab.table("quaera.fact_sellout")\ndf.head()\n\n# %%\nprint("done")\n`
const datasets = [
  { id: 'quaera', tables: [{ name: 'fact_sellout', file: 'fact_sellout.parquet' }] },
  { id: 'northwind', tables: [{ name: 'Order Details', file: 'Order_Details.parquet' }] },
]

describe('Python tabs as Jupyter notebooks', () => {
  const cells = splitCells(tab)
  const outputs: Output[] = [
    { output_type: 'stream', name: 'stdout', text: 'line 1\nline 2\n' },
    { output_type: 'execute_result', execution_count: 3, data: { 'text/plain': '   a\n0  1', 'text/html': '<table></table>' }, metadata: {} },
    { output_type: 'display_data', data: { 'image/png': 'iVBORw0KGgo=', 'text/plain': '<Figure size 640x480 with 1 Axes>' }, metadata: {} },
  ]
  const nb = JSON.parse(toNotebook({ cells, runs: [null, { count: 3, outputs }, undefined], datasets: [datasets[0]] }))

  it('writes nbformat 4.5 with a Python kernel', () => {
    expect(nb.nbformat).toBe(4)
    expect(nb.nbformat_minor).toBe(5)
    expect(nb.metadata.kernelspec).toEqual({ name: 'python3', display_name: 'Python 3', language: 'python' })
    expect(nb.cells.map((c: { id: string }) => c.id)).toEqual(['lab-setup', 'lab-1', 'lab-2', 'lab-3'])
  })

  it('starts with a tagged setup cell, then the tab’s cells as code and markdown', () => {
    expect(nb.cells[0].metadata.tags).toEqual([SETUP_TAG])
    expect(nb.cells.slice(1).map((c: { cell_type: string }) => c.cell_type)).toEqual(['markdown', 'code', 'code'])
    expect(nb.cells[1].source).toEqual(['# Sales\n', 'By *month*.'])
    expect(nb.cells[2].source.join('')).toBe('import pandas as pd\ndf = lab.table("quaera.fact_sellout")\ndf.head()')
  })

  it('attaches a cell’s last run: its number and outputs, text as lines', () => {
    const run = nb.cells[2]
    expect(run.execution_count).toBe(3)
    expect(run.outputs[0]).toEqual({ output_type: 'stream', name: 'stdout', text: ['line 1\n', 'line 2\n'] })
    expect(run.outputs[1].data['text/plain']).toEqual(['   a\n', '0  1'])
    expect(run.outputs[2].data['image/png']).toBe('iVBORw0KGgo=')
    expect(nb.cells[3]).toMatchObject({ execution_count: null, outputs: [] })
  })

  it('opens back as the same cells, without the setup cell', () => {
    const opened = fromNotebook(JSON.stringify(nb))
    expect(opened.cells).toBe(3)
    expect(splitCells(opened.text).map(({ kind, source }) => ({ kind, source }))).toEqual(cells.map(({ kind, source }) => ({ kind, source })))
    expect(opened.notes.join(' ')).toMatch(/setup cell was left out/)
    expect(opened.notes.join(' ')).toMatch(/Outputs .* are not shown/)
  })

  it('opens a notebook made elsewhere: raw cells as text, string sources, other languages noted', () => {
    const other = { nbformat: 4, nbformat_minor: 2, metadata: { kernelspec: { language: 'R' } }, cells: [{ cell_type: 'raw', source: 'raw text' }, { cell_type: 'code', source: 'x <- 1\n', outputs: [] }] }
    const opened = fromNotebook(JSON.stringify(other))
    expect(opened.text).toBe('# %% [markdown]\n# raw text\n\n# %%\nx <- 1\n')
    expect(opened.notes.join(' ')).toMatch(/written for r, not Python/)
    expect(opened.notes.join(' ')).toMatch(/1 raw cell/)
    expect(fromNotebook(JSON.stringify({ nbformat: 4, cells: [] })).text).toBe('# %%\n')
  })

  it('refuses files that are not notebooks, in plain words', () => {
    expect(() => fromNotebook('not json')).toThrow(/not a Jupyter notebook/)
    expect(() => fromNotebook('{"cells": 1}')).toThrow(/no cells/)
    expect(() => fromNotebook('{"nbformat": 3, "cells": []}')).toThrow(/old format/)
  })
})

describe('The setup cell (lab outside Lab)', () => {
  it('finds the catalog datasets the code names', () => {
    expect(datasetsUsed('lab.table("quaera.fact_sellout")', datasets).map((d) => d.id)).toEqual(['quaera'])
    expect(datasetsUsed('lab.sql(\'SELECT * FROM northwind."Order Details"\')', datasets).map((d) => d.id)).toEqual(['northwind'])
    expect(datasetsUsed('quaera = 1\nlab.table("orders")', datasets)).toEqual([])
  })

  it('reads them from lab.quaera.app by their files, and own tables from Parquet files', () => {
    const src = setupSource(datasets)
    expect(src).toContain(`    'quaera': {'fact_sellout': 'fact_sellout.parquet'},`)
    expect(src).toContain(`    'northwind': {'Order Details': 'Order_Details.parquet'},`)
    expect(src).toContain(`def __init__(self, base='https://lab.quaera.app/'):`)
    expect(src).toContain('glob("*.parquet")')
    expect(src).toMatch(/^lab = Lab\(\)$/m)
  })
})
