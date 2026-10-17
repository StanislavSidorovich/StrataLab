// Runs a DDL plan (src/core/ddlPlan.ts) in DuckDB: replaces the tables the user agreed to
// replace, creates the rest one by one and says what DuckDB refused.
import { checkpoint, query } from './engine'
import { createTableSql, type DdlNote, type DdlPlan, type ForeignKey, type PlannedTable } from '../core/ddlPlan'
import { quoteIdent } from '../core/sql'

export interface Existing {
  name: string
  kind: 'table' | 'view'
}

export interface DdlOutcome {
  created: PlannedTable[]
  notes: DdlNote[]
}

const firstLine = (e: unknown) => String(e instanceof Error ? e.message : e).split('\n')[0]

/**
 * Drops what is in the way. A table another table still refers to can't be dropped in
 * DuckDB, so we go round until nothing more can go; whatever is left is reported and kept.
 */
async function dropAll(items: Existing[], notes: DdlNote[]): Promise<Set<string>> {
  const dropped = new Set<string>()
  let left = [...items]
  const errors = new Map<string, string>()
  while (left.length) {
    const before = left.length
    for (const it of [...left]) {
      try {
        await query(`DROP ${it.kind === 'view' ? 'VIEW' : 'TABLE'} ${quoteIdent(it.name)}`)
        dropped.add(it.name.toLowerCase())
        left = left.filter((x) => x !== it)
      } catch (e) {
        errors.set(it.name, firstLine(e))
      }
    }
    if (left.length === before) break
  }
  for (const it of left) notes.push({ statement: `DROP ${it.kind.toUpperCase()} ${it.name}`, message: `Kept the existing ${it.name}: ${errors.get(it.name)}` })
  return dropped
}

/**
 * `replace`: the existing objects with a planned table's name to drop first. Planned tables
 * whose name is still taken afterwards (the user chose to keep them) are not created.
 */
export async function applyPlan(plan: DdlPlan, existing: Existing[], replace: boolean): Promise<DdlOutcome> {
  const notes: DdlNote[] = [...plan.notes]
  const planned = new Set(plan.tables.map((t) => t.name.toLowerCase()))
  // Reverse creation order: tables that refer to others go first, so most drops succeed at once.
  const order = plan.tables.map((t) => t.name.toLowerCase()).reverse()
  const clashing = existing.filter((x) => planned.has(x.name.toLowerCase())).sort((a, b) => order.indexOf(a.name.toLowerCase()) - order.indexOf(b.name.toLowerCase()))
  const dropped = replace ? await dropAll(clashing, notes) : new Set<string>()
  const kept = new Set(clashing.map((x) => x.name.toLowerCase()).filter((n) => !dropped.has(n)))

  const created: PlannedTable[] = []
  const failed = new Set<string>()
  for (const t of plan.tables) {
    if (kept.has(t.name.toLowerCase())) {
      if (!replace) notes.push({ statement: `CREATE TABLE ${t.name}`, message: `Not created: ${t.name} already exists and was kept` })
      continue
    }
    // A key to a table that could not be created would only make this one fail too.
    const lost = new Set<ForeignKey>(t.foreignKeys.filter((fk) => failed.has(fk.refName)))
    const allFks = new Set(t.foreignKeys)
    const hasFks = t.foreignKeys.length > lost.size
    const tries: { opts: Parameters<typeof createTableSql>[1]; what: string }[] = [
      { opts: { skip: lost }, what: '' },
      ...(hasFks ? [{ opts: { skip: allFks }, what: 'without its foreign keys' }] : []),
      ...(t.checks.length ? [{ opts: { skip: lost, withoutChecks: true }, what: 'without its CHECK constraints' }] : []),
      ...(hasFks && t.checks.length ? [{ opts: { skip: allFks, withoutChecks: true }, what: 'without its CHECK constraints and foreign keys' }] : []),
    ]
    let error: string | null = null
    let made = false
    for (const { opts, what } of tries) {
      try {
        await query(createTableSql(t, opts))
        if (what) notes.push({ statement: `CREATE TABLE ${t.name}`, message: `Created ${what}, because DuckDB said: ${error}` })
        made = true
        break
      } catch (e) {
        error ??= firstLine(e)
      }
    }
    for (const fk of lost) notes.push({ statement: `CREATE TABLE ${t.name}`, message: `Foreign key ${fk.name ?? `(${fk.columns.join(', ')})`} left out: ${fk.refTable} was not created` })
    if (made) created.push(t)
    else {
      failed.add(t.key)
      notes.push({ statement: `CREATE TABLE ${t.name}`, message: `Not created: ${error}` })
    }
  }

  for (const stmt of plan.extras) {
    try {
      await query(stmt)
    } catch (e) {
      notes.push({ statement: stmt.replace(/\s+/g, ' ').slice(0, 90), message: `Not run: ${firstLine(e)}` })
    }
  }
  await checkpoint()
  return { created, notes }
}
