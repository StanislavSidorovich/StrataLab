// A script that makes many tables at once (a PowerDesigner export, a course exercise) would fill
// “My tables” with them. Lab asks first whether they should go into a dataset of their own: this
// is the rule for when to ask and what to suggest. Pure: store.ts shows the dialog and runs the script.
import { stripComments } from './ddlPlan'
import { datasetName } from './ownDatasets'
import { tableNameFrom } from './sql'

/** From this many new tables on, the script is offered a dataset. */
export const DATASET_AT = 3

const CREATE_TABLE = /\bcreate\s+(?:or\s+replace\s+)?table\s+(?:if\s+not\s+exists\s+)?("(?:[^"]|"")+"|\[[^\]]+\]|[\w$]+)(\s*\.)?/gi
// A script that picks its own schema (CREATE SCHEMA, USE, SET search_path) already knows where its tables go.
const OWN_PLACE = /\bcreate\s+schema\b|\buse\s+["\[\w]|\bset\s+(?:search_path|schema)\b/i

/** The tables a script creates in the default schema (plain `CREATE TABLE name`, not temporary, not `schema.name`), by name. */
export function tablesCreated(sql: string): string[] {
  const code = stripComments(sql)
  if (OWN_PLACE.test(code)) return []
  const names: string[] = []
  for (const m of code.matchAll(CREATE_TABLE)) if (!m[2]) names.push(m[1].replace(/^["\[]|["\]]$/g, ''))
  return [...new Set(names.map((n) => n.toLowerCase()))]
}

/** What to offer as the dataset's name: the tab's own name when it has one (a file's), else `my_dataset`; made unique. */
export function suggestDatasetName(tabTitle: string, existing: string[], catalogIds: string[]): string {
  const generic = /^(query|sql|python|untitled|new)\b/i.test(tabTitle.trim())
  const base = generic ? 'my_dataset' : tableNameFrom(tabTitle.replace(/\.sql$/i, ''))
  for (let n = 1; n < 100; n++) {
    const name = n === 1 ? base : `${base}_${n}`
    if (!('problem' in datasetName(name, existing, catalogIds))) return name
  }
  return base
}

const IDENT = String.raw`(?:"(?:[^"]|"")+"|[\w$]+)`
const DROP = new RegExp(String.raw`\b(drop\s+(?:table|view|sequence|index)\s+(?:if\s+exists\s+)?)(${IDENT}(?:\s*,\s*${IDENT})*)(?![\w$"]|\s*\.)`, 'gi')

/**
 * DuckDB always keeps `main` on its search path, so a `DROP TABLE IF EXISTS orders` meant for the new
 * dataset would drop an `orders` in My tables when the dataset has none yet. Naming the dataset in
 * every unqualified DROP keeps the script away from tables that are not its own.
 */
export function qualifyDrops(sql: string, schema: string): string {
  return sql.replace(DROP, (_all, head: string, names: string) => head + names.split(',').map((n) => `${schema}.${n.trim()}`).join(', '))
}

/** The same script in the same tab keeps its answer, so running it again does not ask again. */
export const choiceKey = (tabId: string, tables: string[]) => `${tabId}|${[...tables].sort().join(',')}`
