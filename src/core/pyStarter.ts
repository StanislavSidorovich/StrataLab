// The cells a new Python tab starts with. They must run: the example reads a table that is really
// loaded (the demo shop's, else the first table the user has), and says how to get one when none is.
import { PYTHON_STARTER } from '../data/demo'

export interface StarterTable {
  schema: string
  name: string
  kind: string
}

/** The name `lab.table` takes: bare in My tables (schema main), `schema.name` elsewhere. */
export const labName = (t: StarterTable) => (t.schema === 'main' ? t.name : `${t.schema}.${t.name}`)

const HEADER = `# %% [markdown]
# Python in Quaera Lab: pandas, matplotlib and seaborn over the same tables as SQL.
# lab.table("name") gives a table as a DataFrame; lab.sql("SELECT …") runs SQL first;
# lab.save(df, "name") writes a DataFrame back as a table. Cells start at # %% lines.
# Run every cell: Ctrl+Enter · this cell, then on to the next: Shift+Enter.
`

/**
 * The starter for these tables. With the demo shop loaded, its three cells and chart. Else the first
 * table: my own tables before a dataset's, tables before views. With nothing loaded, a query that
 * needs no table, and a note on how to load one.
 */
export function pythonStarter(tables: readonly StarterTable[], demoLoaded: boolean): string {
  if (demoLoaded) return PYTHON_STARTER
  const rank = (t: StarterTable) => (t.schema === 'main' ? 0 : 2) + (t.kind === 'table' ? 0 : 1)
  const first = [...tables].sort((a, b) => rank(a) - rank(b))[0]
  if (!first)
    return `${HEADER}
# %%
# No tables are loaded yet. Open File → Sample datasets… (or drop a CSV / Excel file on the page),
# then use lab.table("table_name") here. This cell works without any table:
lab.sql("SELECT 42 AS answer")
`
  const name = JSON.stringify(labName(first))
  return `${HEADER}
# %%
import pandas as pd

df = lab.table(${name})
df.head()

# %%
df.describe(include="all").T

# %%
df.dtypes
`
}
