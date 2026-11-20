// Pure TypeScript helpers for Feature D (optional bring-your-own-key AI helper):
// settings/consent parsing, secret redaction, Gemini/Claude/OpenAI-compatible request & reply adapters,
// reply block splitting, and `# %%` cell insertion. No React, DuckDB, or fetch.
import { cellAt, splitCells } from './pyCells'
import { normalizeHistory, type AiChatMessage } from './aiChat'

export type AiProvider = 'gemini' | 'claude' | 'openai'

export const DEFAULT_AI_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-3.8-flash',
  claude: 'claude-haiku-5-5',
  // no default: the model names belong to the user's own server (Ollama, LM Studio, OpenRouter)
  openai: '',
}

/** Claude ids offered next to the text field: the cheap default first, then the stronger one. */
export const CLAUDE_MODEL_CHOICES: readonly string[] = ['claude-haiku-5-5', 'claude-sonnet-5-5']
/** A saved id that Anthropic replaced, and what it becomes. */
const CLAUDE_MODEL_MIGRATIONS: Record<string, string> = { 'claude-sonnet-4-6': 'claude-sonnet-5-5' }

export const AI_SETTINGS_KEY = 'stratalab.ai.settings.v1'
export const AI_CONSENT_KEY = 'stratalab.ai.consent.v1'
export const AI_API_KEY_STORAGE: Record<AiProvider, string> = {
  gemini: 'stratalab.ai.key.gemini',
  claude: 'stratalab.ai.key.claude',
  openai: 'stratalab.ai.key.openai',
}

export const MAX_AI_REPLY_CHARS = 16000
// Output budget per request. Gemini 2.5 counts its hidden "thinking" tokens in this budget too.
export const MAX_AI_OUTPUT_TOKENS = 4096
const REPLY_LIMIT_NOTICE = '\n\n[Reply cut off: the model hit its output limit. Ask it to continue, or to answer in parts.]'
const REPLY_TRUNCATION_NOTICE = '\n\n[Reply truncated to keep the panel readable]'

export const AI_KEY_HELP: Record<AiProvider, { label: string; url: string; note: string }> = {
  gemini: {
    label: 'Google AI Studio',
    url: 'https://aistudio.google.com/apikey',
    note: 'The free tier needs no card. Outside the EEA, UK and Switzerland Google may use free-tier requests to improve its products, and people may read them; on a paid project, and in the EEA, it does not.',
  },
  claude: {
    label: 'Anthropic Console',
    url: 'https://console.anthropic.com',
    note: 'You need an API key from console.anthropic.com and prepaid credit. A Claude Pro or Max subscription does not connect here, and there is no free tier.',
  },
  openai: {
    label: 'OpenRouter',
    url: 'https://openrouter.ai/keys',
    note: 'The key is optional: a local Ollama or LM Studio needs none. OpenRouter needs a key, and some of its models are free.',
  },
}

export interface AiEndpointTemplate {
  id: 'ollama' | 'lmstudio' | 'openrouter'
  label: string
  baseUrl: string
  /** a model name that is usually there, shown as a hint only */
  modelHint: string
  hint: string
}

export const AI_ENDPOINT_TEMPLATES: readonly AiEndpointTemplate[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    modelHint: 'llama3.2',
    hint: 'Ollama must allow this site: set the environment variable OLLAMA_ORIGINS=https://lab.quaera.app and restart Ollama.',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    modelHint: 'the model name shown in LM Studio',
    hint: 'In LM Studio start the local server and turn on "Enable CORS".',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelHint: 'meta-llama/llama-3.3-70b-instruct:free',
    hint: 'Needs a key from openrouter.ai. Models marked :free cost nothing but are rate limited.',
  },
]

export type NormalizedBaseUrl = { ok: true; url: string } | { ok: false; reason: string }

/** A Base URL as it is saved: trimmed, http(s) only, no trailing slash. Empty or odd values are refused. */
export function normalizeBaseUrl(raw: string): NormalizedBaseUrl {
  const text = raw.trim()
  if (!text) return { ok: false, reason: 'Enter the Base URL of the server.' }
  if (!/^https?:\/\//i.test(text)) return { ok: false, reason: 'The Base URL must start with http:// or https://.' }
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return { ok: false, reason: 'This is not a valid web address.' }
  }
  if (!parsed.hostname) return { ok: false, reason: 'This is not a valid web address.' }
  if (parsed.username || parsed.password) return { ok: false, reason: 'Put the key in the key field, not in the address.' }
  if (parsed.search || parsed.hash) return { ok: false, reason: 'The address has no ? or # part.' }
  return { ok: true, url: text.replace(/\/+$/, '') }
}

/** The server is on this computer: nothing leaves it. */
export function isLocalBaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1' || host.endsWith('.localhost')
  } catch {
    return false
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

export function providerLabel(provider: AiProvider): string {
  return provider === 'gemini' ? 'Gemini' : provider === 'claude' ? 'Claude' : 'The server'
}

/** Google's terms: the free tier ("Unpaid Services") and how it uses data. */
export const GEMINI_TERMS_URL = 'https://ai.google.dev/gemini-api/docs/terms'

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
      'Offer 2 or 3 options for the next data-mining step for this table, based on its schema and summaries so far, with one line of pros and one of cons for each. Ask which one the learner wants and write no code until they choose.',
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
  /** the OpenAI-compatible server, normalized; '' until a valid one is saved */
  baseUrl: string
}

/** `openai` is true only for the server whose origin is `openaiOrigin`: a new address asks again. */
export type AiConsent = Record<AiProvider, boolean> & { openaiOrigin: string }

export function hasAiConsent(consent: AiConsent, settings: Pick<AiSettings, 'provider' | 'baseUrl'>): boolean {
  if (settings.provider !== 'openai') return consent[settings.provider]
  return consent.openai && consent.openaiOrigin !== '' && consent.openaiOrigin === originOf(settings.baseUrl)
}

function isAiProvider(v: unknown): v is AiProvider {
  return v === 'gemini' || v === 'claude' || v === 'openai'
}

function stripGeminiModelsPrefix(raw: string): string {
  return raw.trim().replace(/^models\//i, '')
}

export function parseAiSettings(raw: string | null): AiSettings {
  const defaults: AiSettings = {
    enabled: false,
    provider: 'gemini',
    models: { ...DEFAULT_AI_MODELS },
    baseUrl: '',
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
    // Google retired gemini-2.5-flash for new users (404), so saved settings must not keep the dead id.
    const geminiModel =
      rawGemini && rawGemini !== 'gemini-2.5-flash' ? rawGemini : DEFAULT_AI_MODELS.gemini
    const rawClaude = typeof rawModels.claude === 'string' ? rawModels.claude.trim() : ''
    const claudeModel = rawClaude ? (CLAUDE_MODEL_MIGRATIONS[rawClaude] ?? rawClaude) : DEFAULT_AI_MODELS.claude
    const openaiModel = typeof rawModels.openai === 'string' ? rawModels.openai.trim() : ''
    const base = typeof parsed.baseUrl === 'string' ? normalizeBaseUrl(parsed.baseUrl) : null
    return {
      enabled: parsed.enabled === true,
      provider,
      models: { gemini: geminiModel, claude: claudeModel, openai: openaiModel },
      baseUrl: base?.ok ? base.url : '',
    }
  } catch {
    return defaults
  }
}

export function parseAiConsent(raw: string | null): AiConsent {
  const defaults: AiConsent = { gemini: false, claude: false, openai: false, openaiOrigin: '' }
  if (!raw) return defaults
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return defaults
    const origin = typeof parsed.openaiOrigin === 'string' ? parsed.openaiOrigin : ''
    return {
      gemini: parsed.gemini === true,
      claude: parsed.claude === true,
      openai: parsed.openai === true && origin !== '',
      openaiOrigin: parsed.openai === true ? origin : '',
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
    'Reply in the same language as the learner\'s question (for example Russian or English), while keeping Python and pandas code identifiers in English.',
    'Guide the learner step by step through Exploration, Preprocessing, Processing, and Analysis. You are a mentor: the learner takes every step and every decision, you do not hand over a finished notebook.',
    'Each request carries the notebook\'s earlier code (cells are numbered, with the stage found for each), the learner\'s "Decisions so far" note, and the last messages of this conversation. Use them: do not suggest what the notebook already does or what a decision already settled, refer to cells by their number ("in cell 3 you dropped..."), and never ask again for something already said.',
    'When a new stage begins (the stage of the current cell differs from the one before it), start with one or two sentences on which of the decisions so far affect this stage.',
    'Name the current stage from the "stage:" labels of the cells and the "Stage:" line of the current cell, never from your own guess. If no label is given, say you cannot tell the stage and ask.',
    'The cursor being in the last cell of a stage does not mean the stage is finished. Before you suggest the next stage, check what the cells of the current stage already did, say in one short line what is still missing there (or that nothing essential is), and move on only when the learner says the stage is done or nothing essential is missing.',
    'Never suggest a step that the code above already contains: read the cells first (for example, if df["status"].value_counts() is already there, say "see cell 8" and offer something else or a deeper version). Do not repeat options you already gave earlier in this conversation either; build on what the learner chose.',
    'Analysis is the last stage. When the learner has done the analysis, do not offer the same three options again: sum up what was found (use the decisions so far and the earlier cells), name what remains uncertain, and suggest at most one closing step such as writing the conclusion.',
    'Write in light Markdown only: **bold**, *italic*, `code`, short bullet or numbered lists, and fenced code blocks. No tables, no headings, no HTML, no links.',
    'When the learner has made a decision (for example chose an option, or confirmed how to treat missing values), end the reply with one separate last line in this exact form: "Decision: <one short sentence with the choice and the reason>". Write that line only when a decision was made in this exchange, never while you are still offering options.',
    'When the learner asks what to do next, or which approach to take, first offer 2 or 3 options for the next step of the cycle (for example, in Exploration: look at distributions, check missing values, or compare groups; in Preprocessing: drop, fill, or flag missing values). Give each option one short line of pros and one of cons.',
    'Then ask which option the learner picks, and stop there: write no code in that reply.',
    'Write the code only after the learner has chosen an option, or when they ask for code for a specific thing. Then explain the decision briefly first and give a short, ready-to-apply block for that one step only.',
    'If the learner only asks you to explain something or to fix an error, answer that question directly without the options.',
    'Every fenced ```python code block you return has one-click UI buttons in the panel: "Insert as new cell", "Replace current cell", and "Insert at cursor".',
    'When asked to write, edit, comment, fix, or offer alternatives for code, provide ready-to-apply ```python code blocks and explain the change rather than claiming you cannot edit the notebook.',
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
  /** the tab's earlier messages, oldest first; the same list works for all three providers */
  history?: readonly AiChatMessage[]
  /** OpenAI-compatible only: the server's Base URL, as saved */
  baseUrl?: string
}): { url: string; method: 'POST'; headers: Record<string, string>; body: string } {
  const key = opts.apiKey.trim()
  const history = normalizeHistory(opts.history ?? [])
  const model =
    opts.provider === 'gemini'
      ? stripGeminiModelsPrefix(opts.model) || DEFAULT_AI_MODELS.gemini
      : opts.model.trim() || DEFAULT_AI_MODELS[opts.provider]

  if (opts.provider === 'openai') {
    const base = normalizeBaseUrl(opts.baseUrl ?? '')
    if (!base.ok) throw new Error(base.reason)
    if (!model) throw new Error('Enter the model name for this server.')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (key) headers.Authorization = `Bearer ${key}`
    return {
      url: `${base.url}/chat/completions`,
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          ...history.map((m) => ({ role: m.role, content: m.text })),
          { role: 'user', content: opts.userPrompt },
        ],
        max_tokens: MAX_AI_OUTPUT_TOKENS,
        temperature: 0.3,
        stream: false,
      }),
    }
  }

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
        // Gemini calls the assistant's side "model".
        contents: [
          ...history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
          { role: 'user', parts: [{ text: opts.userPrompt }] },
        ],
        generationConfig: { maxOutputTokens: MAX_AI_OUTPUT_TOKENS, temperature: 0.3 },
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
      max_tokens: MAX_AI_OUTPUT_TOKENS,
      system: opts.systemPrompt,
      messages: [...history.map((m) => ({ role: m.role, content: m.text })), { role: 'user', content: opts.userPrompt }],
    }),
  }
}

export type AiReplyOutcome =
  | { ok: true; text: string; truncated: boolean }
  | {
      ok: false
      kind: 'auth' | 'rate_limit' | 'filtered' | 'empty' | 'network' | 'offline' | 'aborted' | 'api' | 'bad_url' | 'no_model'
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
  // Ollama answers {"error": "model 'x' not found"}
  if (typeof err === 'string' && err.trim()) return err.trim()
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
  const label = providerLabel(provider)
  const parsed = tryParseJson(rawBody)
  const errMsg = apiErrorMessage(parsed)

  if (provider === 'openai' && status === 404) {
    const noModel = errMsg !== null && /model/i.test(errMsg)
    return noModel
      ? {
          ok: false,
          kind: 'no_model',
          message: redactSecrets(
            `The server does not have this model (${errMsg}). Check the model name in settings; for Ollama, run "ollama pull <name>" first.`,
            keys,
          ),
        }
      : {
          ok: false,
          kind: 'bad_url',
          message: redactSecrets(
            'Nothing answers at this address (404). Check the Base URL in settings: it usually ends in /v1, and the request goes to <Base URL>/chat/completions.',
            keys,
          ),
        }
  }

  if (status === 401 || status === 403) {
    const detail = errMsg ? ` (${errMsg})` : ''
    return {
      ok: false,
      kind: 'auth',
      message: redactSecrets(
        `${provider === 'openai' ? 'The server' : `Your ${label}`} API key was rejected (${status})${detail}. Check or re-enter your key in AI helper settings.`,
        keys,
      ),
    }
  }

  if (status === 429) {
    const detail = errMsg ? ` (${errMsg})` : ''
    const advice =
      provider === 'gemini'
        ? 'The free limit of your Google project is used up (limits are per project, not per key). Wait a minute and try again; if it keeps happening, check AI Studio, Rate Limits, or try later.'
        : provider === 'claude'
          ? 'Either you are sending too fast, or your Anthropic credit has run out. Wait a minute and try again, and check the credit in console.anthropic.com.'
          : 'The server or OpenRouter is limiting requests (or a free model is busy). Wait a minute and try again, or pick another model.'
    return {
      ok: false,
      kind: 'rate_limit',
      message: redactSecrets(`${label} says too many requests (429)${detail}. ${advice}`, keys),
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
  let hitLimit = false

  if (provider === 'openai') {
    const choices = Array.isArray(parsed.choices) ? (parsed.choices as Record<string, unknown>[]) : []
    const first = choices[0]
    if (first?.finish_reason === 'content_filter') {
      return {
        ok: false,
        kind: 'filtered',
        message: 'The server filtered the reply. Try rephrasing your question.',
      }
    }
    hitLimit = first?.finish_reason === 'length'
    const message = first?.message as Record<string, unknown> | undefined
    const content = message?.content
    if (typeof content === 'string') rawText = content.trim()
    else if (Array.isArray(content)) {
      rawText = (content as Record<string, unknown>[])
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim()
    }
  } else if (provider === 'gemini') {
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
    hitLimit = finishReason === 'MAX_TOKENS'
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
    hitLimit = parsed.stop_reason === 'max_tokens'
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
      message: hitLimit
        ? `${label} used its whole output limit before writing an answer (a thinking model can spend it all on thinking). Try a shorter question or another model.`
        : `${label} returned an empty reply. Try asking again or switching models.`,
    }
  }

  const redacted = redactSecrets(rawText, keys)
  const capped = capReplyText(redacted)
  if (hitLimit && !capped.truncated) {
    return { ok: true, text: capped.text + REPLY_LIMIT_NOTICE, truncated: true }
  }
  return { ok: true, text: capped.text, truncated: capped.truncated }
}

export function classifyFetchError(
  err: unknown,
  online: boolean,
  keys: readonly string[] = [],
  server?: { provider: AiProvider; baseUrl: string },
): Extract<AiReplyOutcome, { ok: false }> {
  const isAbort =
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError')
  if (isAbort) {
    return { ok: false, kind: 'aborted', message: 'Request cancelled.' }
  }
  if (server?.provider === 'openai' && isLocalBaseUrl(server.baseUrl)) {
    // A refused connection and a CORS or Private Network Access block look the same to a page.
    return {
      ok: false,
      kind: 'network',
      message: redactSecrets(
        `Could not reach ${server.baseUrl}. Check that the server is running. If it is, the browser is blocking this site from reaching your computer: Ollama needs the environment variable OLLAMA_ORIGINS=https://lab.quaera.app (restart it afterwards), LM Studio needs "Enable CORS", and if the browser asks to allow access to devices on your network, allow it.`,
        keys,
      ),
    }
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
      server?.provider === 'openai'
        ? `Could not reach ${server.baseUrl}. The address may be wrong, or the server does not allow requests from this site (CORS). A browser extension or network block can also stop it.`
        : 'The AI provider could not be reached. A browser extension, CORS policy, or network block may be preventing the request.',
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

function clampCursorPos(textLength: number, cursorPos: number): number {
  return Math.max(0, Math.min(textLength, Number.isFinite(cursorPos) ? Math.trunc(cursorPos) : 0))
}

/**
 * Replaces the code cell containing `cursorPos` while preserving its `# %%` boundary/header
 * (or without forcing `# %%` when the tab is a single unmarked cell). Markdown cell headers
 * become `# %%` so applied Python code stays runnable.
 */
export function replaceCurrentCodeCell(
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

  const clampedPos = clampCursorPos(tabText.length, cursorPos)
  const cells = splitCells(tabText)
  const i = cellAt(cells, clampedPos)
  if (i < 0) {
    const text = `# %%\n${cleanCode}\n`
    const newCells = splitCells(text)
    return { text, cursor: newCells[0] ? newCells[0].to : text.length }
  }

  const target = cells[i]
  const slice = tabText.slice(target.from, target.to)
  const nl = slice.indexOf('\n')
  const firstLine = nl >= 0 ? slice.slice(0, nl) : slice
  const hasMarker = /^#\s?%%(.*)$/.test(firstLine)

  const before = tabText.slice(0, target.from)
  const after = tabText.slice(target.to)
  const body = cleanCode ? `${cleanCode}\n` : ''
  const replacement = hasMarker
    ? `${target.kind === 'markdown' ? '# %%' : firstLine}\n${body}`
    : body

  const text =
    !hasMarker && !cleanCode && after
      ? `${before}${after.replace(/^\n+/, '')}`
      : `${before}${replacement}${after}`
  const newCells = splitCells(text)
  const cell = newCells[i] ?? newCells[newCells.length - 1]
  return { text, cursor: cell ? cell.to : text.length }
}

/**
 * Inserts `code` at `cursorPos`, adding a leading/trailing newline when needed so adjacent
 * statements or `# %%` markers are not merged on the same line.
 */
export function insertCodeAtCursor(
  tabText: string,
  cursorPos: number,
  code: string,
): { text: string; cursor: number } {
  const cleanCode = code.trim()
  const clampedPos = clampCursorPos(tabText.length, cursorPos)
  if (!cleanCode) return { text: tabText, cursor: clampedPos }
  if (!tabText.trim()) return { text: cleanCode, cursor: cleanCode.length }

  const before = tabText.slice(0, clampedPos)
  const after = tabText.slice(clampedPos)
  const atLineStart = before === '' || before.endsWith('\n')

  const lineStart = before.lastIndexOf('\n') + 1
  const lineBefore = before.slice(lineStart)
  const nextNl = after.indexOf('\n')
  const lineAfter = nextNl >= 0 ? after.slice(0, nextNl) : after

  const needsLeadingNewline =
    !atLineStart &&
    lineBefore.trim() !== '' &&
    lineAfter.trim() === '' &&
    !/[=(\[{,]\s*$/.test(lineBefore)

  const needsTrailingNewline = atLineStart && after.length > 0 && !after.startsWith('\n')

  const prefix = needsLeadingNewline ? '\n' : ''
  const suffix = needsTrailingNewline ? '\n' : ''
  const text = `${before}${prefix}${cleanCode}${suffix}${after}`
  const cursor = before.length + prefix.length + cleanCode.length
  return { text, cursor }
}

export type AiSpeechLang = 'ru-RU' | 'en-US'
export const AI_SPEECH_LANG_KEY = 'stratalab.ai.speechLang'

export function parseAiSpeechLang(raw: string | null, navLang = ''): AiSpeechLang {
  if (raw === 'ru-RU' || raw === 'en-US') return raw
  if (/^ru\b/i.test(navLang.trim())) return 'ru-RU'
  return 'en-US'
}

export function nextAiSpeechLang(current: AiSpeechLang): AiSpeechLang {
  return current === 'ru-RU' ? 'en-US' : 'ru-RU'
}

export function appendDictatedText(existing: string, dictated: string): string {
  const clean = dictated.trim()
  if (!clean) return existing
  const base = existing.replace(/\s+$/, '')
  return base ? `${base} ${clean}` : clean
}
