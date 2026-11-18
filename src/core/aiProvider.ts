// Pure TypeScript helpers for Feature D (optional bring-your-own-key AI helper):
// settings/consent parsing, secret redaction, Gemini/Claude request & reply adapters,
// reply block splitting, and `# %%` cell insertion. No React, DuckDB, or fetch.
import { cellAt, splitCells } from './pyCells'

export type AiProvider = 'gemini' | 'claude'

export const DEFAULT_AI_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-3.8-flash',
  claude: 'claude-sonnet-4-6',
}

export const AI_SETTINGS_KEY = 'stratalab.ai.settings.v1'
export const AI_CONSENT_KEY = 'stratalab.ai.consent.v1'
export const AI_API_KEY_STORAGE: Record<AiProvider, string> = {
  gemini: 'stratalab.ai.key.gemini',
  claude: 'stratalab.ai.key.claude',
}

export const MAX_AI_REPLY_CHARS = 8000
const REPLY_TRUNCATION_NOTICE = '\n\n[Reply truncated to keep the panel readable]'

export const AI_KEY_HELP: Record<AiProvider, { label: string; url: string; note: string }> = {
  gemini: {
    label: 'Google AI Studio',
    url: 'https://aistudio.google.com/apikey',
    note: 'Free tier available with no card required; Google may use free-tier requests to improve its products.',
  },
  claude: {
    label: 'Anthropic Console',
    url: 'https://console.anthropic.com',
    note: 'Requires a separate paid API account with prepaid credit (not a Claude.ai subscription).',
  },
}

export type AiQuickAction = 'explain-stage' | 'why-failed' | 'suggest-next' | 'what-odd'

export const AI_QUICK_ACTIONS: readonly { id: AiQuickAction; label: string; instruction: string }[] = [
  {
    id: 'explain-stage',
    label: 'Explain this stage',
    instruction:
      'Explain what this data-mining stage is for, why it comes at this point in the workflow, and what decision to make next before writing more code.',
  },
  {
    id: 'why-failed',
    label: 'Why did this fail?',
    instruction:
      'Explain why the current cell failed using the last error, what data or syntax assumption broke, and how to fix it in short pandas code.',
  },
  {
    id: 'suggest-next',
    label: 'Suggest the next cell for this table',
    instruction:
      'Suggest the single most useful next data-mining step and short pandas cell for this table based on its schema and summaries so far.',
  },
  {
    id: 'what-odd',
    label: 'What looks odd here?',
    instruction:
      'Point out potential data quality traps, type mismatches, missing-value patterns, or anomalies to inspect next based on the schema and summary.',
  },
]

export interface AiSettings {
  enabled: boolean
  provider: AiProvider
  models: Record<AiProvider, string>
}

export type AiConsent = Record<AiProvider, boolean>

function isAiProvider(v: unknown): v is AiProvider {
  return v === 'gemini' || v === 'claude'
}

function stripGeminiModelsPrefix(raw: string): string {
  return raw.trim().replace(/^models\//i, '')
}

export function parseAiSettings(raw: string | null): AiSettings {
  const defaults: AiSettings = {
    enabled: false,
    provider: 'gemini',
    models: { ...DEFAULT_AI_MODELS },
  }
  if (!raw) return defaults
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return defaults
    const provider: AiProvider = isAiProvider(parsed.provider) ? parsed.provider : 'gemini'
    const rawModels =
      parsed.models && typeof parsed.models === 'object' ? (parsed.models as Record<string, unknown>) : {}
    const rawGemini =
      typeof rawModels.gemini === 'string' ? stripGeminiModelsPrefix(rawModels.gemini) : ''
    const geminiModel =
      rawGemini && rawGemini !== 'gemini-2.5-flash' ? rawGemini : DEFAULT_AI_MODELS.gemini
    const claudeModel =
      typeof rawModels.claude === 'string' && rawModels.claude.trim()
        ? rawModels.claude.trim()
        : DEFAULT_AI_MODELS.claude
    return {
      enabled: parsed.enabled === true,
      provider,
      models: { gemini: geminiModel, claude: claudeModel },
    }
  } catch {
    return defaults
  }
}

export function parseAiConsent(raw: string | null): AiConsent {
  const defaults: AiConsent = { gemini: false, claude: false }
  if (!raw) return defaults
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return defaults
    return {
      gemini: parsed.gemini === true,
      claude: parsed.claude === true,
    }
  } catch {
    return defaults
  }
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function redactSecrets(text: string, keys: readonly string[] = []): string {
  let out = text
  const candidates = [...new Set(keys.flatMap((k) => [k, k.trim()]).filter((k) => k.length > 0))].sort(
    (a, b) => b.length - a.length,
  )
  for (const key of candidates) {
    out = out.replace(new RegExp(escapeRegex(key), 'g'), '[REDACTED_KEY]')
  }
  out = out.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]')
  out = out.replace(/sk-ant-[0-9A-Za-z_-]{16,}/g, '[REDACTED_KEY]')
  return out
}

export function buildTutorSystemPrompt(): string {
  return [
    'You are a patient, practical data-mining tutor inside Quaera Lab (a browser-based SQL + Python workbench).',
    'Explain the analytical decision and reasoning first before writing code, and ask the learner a brief check-in question about what they think or want to verify when sensible.',
    'Keep code snippets short, clear, and runnable using pandas and Quaera Lab helpers:',
    '- lab.table("table_name") or lab.table("schema.table_name") to load a DuckDB table as a DataFrame',
    '- lab.sql("SELECT ...") to run DuckDB SQL and get a DataFrame',
    '- lab.save(df, "name") to save a DataFrame back as a table in DuckDB',
    'Environment constraint: ONLY pandas, numpy, matplotlib, seaborn, and Python\'s standard library are installed in browser Pyodide.',
    'scikit-learn, scipy, statsmodels, mlxtend, and pip install are NOT available here.',
    'If clustering, scaling, or association rules come up, give concise numpy/pandas code that runs directly in Quaera Lab without external ML packages.',
  ].join('\n')
}

export function buildProviderRequest(opts: {
  provider: AiProvider
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
}): { url: string; method: 'POST'; headers: Record<string, string>; body: string } {
  const key = opts.apiKey.trim()
  const model =
    opts.provider === 'gemini'
      ? stripGeminiModelsPrefix(opts.model) || DEFAULT_AI_MODELS.gemini
      : opts.model.trim() || DEFAULT_AI_MODELS.claude

  if (opts.provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: opts.userPrompt }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
      }),
    }
  }

  return {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: opts.systemPrompt,
      messages: [{ role: 'user', content: opts.userPrompt }],
    }),
  }
}

export type AiReplyOutcome =
  | { ok: true; text: string; truncated: boolean }
  | {
      ok: false
      kind: 'auth' | 'rate_limit' | 'filtered' | 'empty' | 'network' | 'offline' | 'aborted' | 'api'
      message: string
    }

const GEMINI_FILTERED_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
])

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function apiErrorMessage(parsed: Record<string, unknown> | null): string | null {
  const err = parsed?.error
  if (err && typeof err === 'object') {
    const msg = (err as Record<string, unknown>).message
    if (typeof msg === 'string' && msg.trim()) return msg.trim()
  }
  return null
}

function capReplyText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_AI_REPLY_CHARS) return { text, truncated: false }
  const keep = Math.max(0, MAX_AI_REPLY_CHARS - REPLY_TRUNCATION_NOTICE.length)
  return {
    text: text.slice(0, keep).trimEnd() + REPLY_TRUNCATION_NOTICE,
    truncated: true,
  }
}

export function parseProviderReply(
  provider: AiProvider,
  status: number,
  rawBody: string,
  keys: readonly string[] = [],
): AiReplyOutcome {
  const label = provider === 'gemini' ? 'Gemini' : 'Claude'
  const parsed = tryParseJson(rawBody)
  const errMsg = apiErrorMessage(parsed)

  if (status === 401 || status === 403) {
    const detail = errMsg ? ` (${errMsg})` : ''
    return {
      ok: false,
      kind: 'auth',
      message: redactSecrets(
        `Your ${label} API key was rejected (${status})${detail}. Check or re-enter your key in AI helper settings.`,
        keys,
      ),
    }
  }

  if (status === 429) {
    const detail = errMsg ? ` (${errMsg})` : ''
    return {
      ok: false,
      kind: 'rate_limit',
      message: redactSecrets(
        `${label} rate limit or credit/quota limit reached (429)${detail}. Wait a moment before retrying, check your account quota/credit, or try the other provider.`,
        keys,
      ),
    }
  }

  if (status < 200 || status >= 300) {
    const detail = errMsg ?? `HTTP ${status}`
    return {
      ok: false,
      kind: 'api',
      message: redactSecrets(`${label} request failed (${status}): ${detail}`, keys),
    }
  }

  if (!parsed) {
    return {
      ok: false,
      kind: 'api',
      message: redactSecrets(`${label} returned an unreadable response.`, keys),
    }
  }

  let rawText = ''

  if (provider === 'gemini') {
    const promptFeedback = parsed.promptFeedback as Record<string, unknown> | undefined
    if (promptFeedback && typeof promptFeedback.blockReason === 'string' && promptFeedback.blockReason) {
      return {
        ok: false,
        kind: 'filtered',
        message: redactSecrets(
          `Gemini filtered this request (${promptFeedback.blockReason}). Try rephrasing your question.`,
          keys,
        ),
      }
    }
    const candidates = Array.isArray(parsed.candidates) ? (parsed.candidates as Record<string, unknown>[]) : []
    const first = candidates[0]
    const finishReason = typeof first?.finishReason === 'string' ? first.finishReason : ''
    if (finishReason && GEMINI_FILTERED_REASONS.has(finishReason)) {
      return {
        ok: false,
        kind: 'filtered',
        message: redactSecrets(
          `Gemini filtered the reply (${finishReason}). Try rephrasing your question.`,
          keys,
        ),
      }
    }
    const content = first?.content as Record<string, unknown> | undefined
    const parts = Array.isArray(content?.parts) ? (content.parts as Record<string, unknown>[]) : []
    rawText = parts
      .map((p) => (typeof p?.text === 'string' ? p.text : ''))
      .join('')
      .trim()
  } else {
    if (parsed.stop_reason === 'refusal') {
      return {
        ok: false,
        kind: 'filtered',
        message: 'Claude declined to answer this request. Try rephrasing your question.',
      }
    }
    const blocks = Array.isArray(parsed.content) ? (parsed.content as Record<string, unknown>[]) : []
    rawText = blocks
      .filter((b) => b?.type === 'text' && typeof b?.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim()
  }

  if (!rawText) {
    return {
      ok: false,
      kind: 'empty',
      message: `${label} returned an empty reply. Try asking again or switching models.`,
    }
  }

  const redacted = redactSecrets(rawText, keys)
  const capped = capReplyText(redacted)
  return { ok: true, text: capped.text, truncated: capped.truncated }
}

export function classifyFetchError(
  err: unknown,
  online: boolean,
  keys: readonly string[] = [],
): Extract<AiReplyOutcome, { ok: false }> {
  const isAbort =
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError')
  if (isAbort) {
    return { ok: false, kind: 'aborted', message: 'Request cancelled.' }
  }
  if (!online) {
    return {
      ok: false,
      kind: 'offline',
      message: 'You appear to be offline. Reconnect to reach the AI provider.',
    }
  }
  return {
    ok: false,
    kind: 'network',
    message: redactSecrets(
      'The AI provider could not be reached. A browser extension, CORS policy, or network block may be preventing the request.',
      keys,
    ),
  }
}

export type AiReplyBlock =
  | { kind: 'text'; text: string }
  | { kind: 'code'; lang: string; code: string }

export function parseAiReplyBlocks(text: string): AiReplyBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: AiReplyBlock[] = []
  let inCode = false
  let codeLang = ''
  let buf: string[] = []

  const flushText = () => {
    const joined = buf.join('\n').trim()
    if (joined) blocks.push({ kind: 'text', text: joined })
    buf = []
  }

  const flushCode = () => {
    const joined = buf.join('\n').replace(/^\n+|\n+$/g, '')
    if (joined || codeLang) blocks.push({ kind: 'code', lang: codeLang, code: joined })
    buf = []
  }

  for (const line of lines) {
    if (!inCode) {
      const open = /^```([A-Za-z0-9_+-]*)\s*$/.exec(line)
      if (open) {
        flushText()
        inCode = true
        codeLang = open[1] ?? ''
      } else {
        buf.push(line)
      }
    } else if (/^```\s*$/.test(line)) {
      flushCode()
      inCode = false
      codeLang = ''
    } else {
      buf.push(line)
    }
  }

  if (inCode) flushCode()
  else flushText()

  return blocks
}

export function insertCodeCellBelow(
  tabText: string,
  cursorPos: number,
  code: string,
): { text: string; cursor: number } {
  const cleanCode = code.trim()
  if (!tabText.trim()) {
    const text = `# %%\n${cleanCode}\n`
    const cells = splitCells(text)
    const cell = cells[0]
    return { text, cursor: cell ? cell.to : text.length }
  }

  const cells = splitCells(tabText)
  const i = cellAt(cells, cursorPos)
  const at = i >= 0 ? cells[i].to : tabText.length
  const before = tabText.slice(0, at).replace(/\s+$/, '')
  const after = tabText.slice(at).replace(/^\s+/, '')
  const separator = before ? '\n\n' : ''
  const block = `${separator}# %%\n${cleanCode}\n`
  const text = after ? `${before}${block}\n${after}` : `${before}${block}`

  const newCells = splitCells(text)
  const index = i >= 0 ? i + 1 : 0
  const cell = newCells[index] ?? newCells[newCells.length - 1]
  return { text, cursor: cell ? cell.to : text.length }
}
