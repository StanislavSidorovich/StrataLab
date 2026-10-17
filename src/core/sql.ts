// Small SQL helpers shared by the importer, the object tree and the editor.

export function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

export function quoteString(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'"
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

/**
 * Turns a file or sheet name into a table name that needs no quotes:
 * "Продажи 2024 (final).xlsx" → "prodazhi_2024_final".
 */
export function tableNameFrom(raw: string): string {
  const base = raw.replace(/\.(csv|tsv|txt|xlsx|xlsm|xls|parquet|json)$/i, '')
  const latin = base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[а-яё]/g, (ch) => TRANSLIT[ch] ?? '')
  let name = latin.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!name) name = 'table'
  if (/^\d/.test(name)) name = 't_' + name
  return name
}

/** "orders" → "orders_2" when "orders" is taken. */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const set = new Set([...taken].map((t) => t.toLowerCase()))
  if (!set.has(name.toLowerCase())) return name
  for (let i = 2; ; i++) if (!set.has(`${name}_${i}`.toLowerCase())) return `${name}_${i}`
}
