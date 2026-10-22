// A SQL Server script from PowerDesigner, made runnable in DuckDB. translate.py has already turned the
// single statements (guarded drops, descriptions, NONCLUSTERED, IDENTITY); what is left is the order
// and the keys: PowerDesigner drops the foreign keys, drops the tables, creates the tables and only then
// adds every foreign key with ALTER TABLE, which DuckDB cannot do. So the ALTERs are folded into their
// CREATE TABLE (the plan of ddlPlan.ts, which also puts referenced tables first) and the statements run
// in an order that works: drops, tables, the rest.
import type { TranslatedStatement } from '../dialects/tsql'
import { createTableSql, planDdl, readIdent, splitStatements, stripComments } from './ddlPlan'

const LEADING_COMMENTS = /^\s*(?:(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*/
const CREATE_TABLE = /^create\s+table\s+/i
const ALTER_ADD = /^alter\s+table\s+/i
const DROP_TABLE = /^drop\s+table\s+if\s+exists\s+/i
const DROP_FIRST = /^drop\s+(index|view)\b/i

const code = (sql: string) => stripComments(sql).trim()

/** The table an ALTER TABLE … or CREATE TABLE … statement is about, as ddlPlan folds names. */
function tableOf(stmt: string, head: RegExp): string | null {
  const m = head.exec(stmt)
  return m ? (readIdent(stmt, m[0].length)?.folded ?? null) : null
}

/**
 * Folds `ALTER TABLE t ADD …` into the CREATE TABLE of t, when t is created in the same script.
 * Returns the statements as they will run (same order as the script, so the translation view still
 * matches the editor) with `rank` set when they must run in another order (see `runOrder`).
 * A script without such ALTERs comes back as it was.
 */
export function foldKeys(statements: TranslatedStatement[]): TranslatedStatement[] {
  const pieces = statements.map((st) => (st.target ? splitStatements(st.target) : []))
  const creates = new Map<string, number>()
  pieces.forEach((ps, i) => {
    const create = ps.find((p) => CREATE_TABLE.test(p))
    const key = create && tableOf(create, CREATE_TABLE)
    if (key) creates.set(key, i)
  })
  const alters = new Set<number>()
  pieces.forEach((ps, i) => {
    if (ps.length === 1 && ALTER_ADD.test(ps[0]) && creates.has(tableOf(ps[0], ALTER_ADD) ?? '')) alters.add(i)
  })
  if (!alters.size) return statements

  const plan = planDdl([...creates.values()].map((i) => pieces[i].find((p) => CREATE_TABLE.test(p))!).concat([...alters].map((i) => pieces[i][0])).join(';\n'))
  const byKey = new Map(plan.tables.map((t, n) => [t.key, { table: t, n }]))
  const folded = new Set([...alters].filter((i) => !plan.extras.includes(pieces[i][0])))

  const out = statements.map((st, i): TranslatedStatement => {
    const key = [...creates].find(([, at]) => at === i)?.[0]
    const hit = key ? byKey.get(key) : undefined
    if (hit) {
      const before = pieces[i].filter((p) => !CREATE_TABLE.test(p))
      const head = LEADING_COMMENTS.exec(st.target!)?.[0].trim()
      const target = [...before, createTableSql(hit.table)].join(';\n')
      return { ...st, target: head ? `${head}\n${target}` : target, rank: 2 * 1e6 + hit.n }
    }
    if (folded.has(i)) {
      const into = tableOf(pieces[i][0], ALTER_ADD)!
      return { ...st, target: '', notes: [...st.notes, `Not run on its own: DuckDB can only add a key while it creates the table, so this is part of CREATE TABLE ${byKey.get(into)!.table.name}.`] }
    }
    return st
  })

  const placed = out.map((st, i) => {
    const target = code(st.target ?? '')
    if (DROP_FIRST.test(target)) return { ...st, rank: 0 + i / 1e6 }
    if (DROP_TABLE.test(target)) {
      const hit = byKey.get(readIdent(target, DROP_TABLE.exec(target)![0].length)?.folded ?? '')
      // Tables that refer to others are dropped first: the reverse of the order they are created in.
      return { ...st, rank: 1e6 + (hit ? plan.tables.length - hit.n : plan.tables.length + 1) }
    }
    return st.rank === undefined ? { ...st, rank: 3 * 1e6 + i } : st
  })
  // Notes of the plan that belong to no statement (a circle of tables: a key left out).
  if (plan.notes.length) {
    const first = placed.findIndex((st) => st.rank !== undefined && st.rank >= 2e6 && st.rank < 3e6)
    if (first >= 0) placed[first] = { ...placed[first], notes: [...placed[first].notes, ...plan.notes.map((n) => `${n.statement}: ${n.message}`)] }
  }
  return placed
}

/** The DuckDB statements to run, in the order they run (empty ones left out). */
export function runOrder(statements: TranslatedStatement[]): string[] {
  const ranked = statements.map((st, i) => ({ st, i })).filter(({ st }) => st.target)
  if (ranked.some(({ st }) => st.rank !== undefined)) ranked.sort((a, b) => (a.st.rank ?? a.i) - (b.st.rank ?? b.i) || a.i - b.i)
  return ranked.map(({ st }) => st.target!)
}
