// Optional bring-your-own-key AI helper UI (Feature D):
// - AiSettingsDialog: opt-in master switch (OFF by default), Gemini/Claude provider, masked key input, model override
// - AiConsentDialog: plain-words consent before first request per provider
// - AiHelperPanel: side panel on desktop / bounded section on phone, in Python and SQL tabs
import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ExternalLink,
  KeyRound,
  Loader2,
  Mic,
  MicOff,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  AI_ENDPOINT_TEMPLATES,
  AI_KEY_HELP,
  CLAUDE_MODEL_CHOICES,
  GEMINI_TERMS_URL,
  isLocalBaseUrl,
  normalizeBaseUrl,
  AI_SPEECH_LANG_KEY,
  DEFAULT_AI_MODELS,
  appendDictatedText,
  nextAiSpeechLang,
  parseAiSpeechLang,
  quickActionsFor,
  type AiProvider,
  type AiQuickAction,
  type AiSpeechLang,
} from '../core/aiProvider'

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionResultEventLike {
  resultIndex: number
  results: {
    readonly length: number
    [index: number]: SpeechRecognitionResultLike
  }
}

interface SpeechRecognitionErrorEventLike {
  error?: string
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SpeechRecognitionResultEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function loadSpeechLang(): AiSpeechLang {
  try {
    return parseAiSpeechLang(
      localStorage.getItem(AI_SPEECH_LANG_KEY),
      typeof navigator !== 'undefined' ? navigator.language : '',
    )
  } catch {
    return parseAiSpeechLang(null, typeof navigator !== 'undefined' ? navigator.language : '')
  }
}

function saveSpeechLang(lang: AiSpeechLang) {
  try {
    localStorage.setItem(AI_SPEECH_LANG_KEY, lang)
  } catch {
    /* ignore when localStorage is unavailable */
  }
}
import { SidePanelHandle, useSidePanelWidth } from './useSidePanelWidth'
import { AiDecisions, AiSees, NewConversationButton } from './AiConversation'
import { AiFeed } from './AiFeed'
import {
  askAi,
  cancelAiConsent,
  cancelAiRequest,
  confirmAiConsent,
  openAiSettings,
  removeAiApiKey,
  requestEnableAi,
  setAiApiKey,
  setAiBaseUrl,
  setAiModel,
  setAiProvider,
  setAiSendNotebook,
  tabDialect,
  toggleAiPanel,
  useLab,
} from './store'

const PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: 'Gemini',
  claude: 'Claude',
  openai: 'OpenAI-compatible',
}

const PROVIDER_FULL_LABELS: Record<AiProvider, string> = {
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude',
  openai: 'Ollama, LM Studio, OpenRouter',
}

export function AiSettingsDialog() {
  const open = useLab((s) => s.aiSettingsOpen)
  const settings = useLab((s) => s.aiSettings)
  const keys = useLab((s) => s.aiKeys)
  const storageAvailable = useLab((s) => s.aiStorageAvailable)
  const [baseDraft, setBaseDraft] = useState<string | null>(null)

  useEffect(() => {
    if (!open) setBaseDraft(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useLab.getState().aiConsentPrompt) openAiSettings(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const provider = settings.provider
  const help = AI_KEY_HELP[provider]
  const currentKey = keys[provider]
  const currentModel = settings.models[provider]
  const defaultModel = DEFAULT_AI_MODELS[provider]
  const isServer = provider === 'openai'
  const baseValue = baseDraft ?? settings.baseUrl
  const baseCheck = isServer && baseDraft !== null ? normalizeBaseUrl(baseDraft) : null
  const baseError = baseCheck && !baseCheck.ok ? baseCheck.reason : null
  const onBaseChange = (raw: string) => {
    setBaseDraft(raw)
    setAiBaseUrl(raw)
  }
  const template = isServer ? AI_ENDPOINT_TEMPLATES.find((t) => t.baseUrl === settings.baseUrl) : undefined

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,14,20,0.55)' }}
      onMouseDown={(e) => e.target === e.currentTarget && openAiSettings(false)}
    >
      <div
        role="dialog"
        aria-label="AI helper (optional)"
        className="w-full max-w-lg max-h-full flex flex-col rounded-xl shadow-2xl"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
          <Sparkles size={18} style={{ color: 'var(--accent)' }} className="shrink-0" />
          <div className="font-semibold flex-1">AI helper (optional)</div>
          <button type="button" className="btn btn-ghost" onClick={() => openAiSettings(false)} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-auto px-4 py-3 space-y-4" style={{ fontSize: 13 }}>
          {!storageAvailable && (
            <div
              className="rounded-lg p-2.5 flex gap-2"
              style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)', fontSize: 12.5 }}
              role="status"
            >
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>
                Browser local storage is unavailable here. Your AI helper settings, consent, and API key will stay in memory for this session only.
              </span>
            </div>
          )}

          <div
            className="rounded-lg p-3 flex items-center gap-3"
            style={{ background: 'var(--panel-2)', border: '1px solid var(--line)' }}
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold">Enable AI helper</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                OFF by default. Nothing is sent automatically; requests happen only when you click Send.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              aria-label="Enable AI helper"
              onClick={() => requestEnableAi(!settings.enabled)}
              className="px-3 py-1 rounded-full font-semibold shrink-0 transition-colors"
              style={
                settings.enabled
                  ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                  : { background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--line)' }
              }
            >
              {settings.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="font-semibold" style={{ fontSize: 12.5 }}>
              Provider
            </div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="AI provider">
              {(['gemini', 'claude', 'openai'] as const).map((p) => {
                const active = provider === p
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setAiProvider(p)}
                    className="rounded-lg px-3 py-2 text-left transition-colors"
                    style={
                      active
                        ? { background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--text)' }
                        : { background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--muted)' }
                    }
                  >
                    <div className="font-semibold" style={{ color: active ? 'var(--accent)' : 'var(--text)' }}>
                      {PROVIDER_LABELS[p]}
                    </div>
                    <div style={{ fontSize: 11.5, overflowWrap: 'anywhere' }}>{PROVIDER_FULL_LABELS[p]}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {isServer && (
            <div className="space-y-1.5">
              <label htmlFor="ai-base-url-input" className="font-semibold block" style={{ fontSize: 12.5 }}>
                Base URL
              </label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Server templates">
                {AI_ENDPOINT_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="btn"
                    style={{ fontSize: 12 }}
                    onClick={() => onBaseChange(t.baseUrl)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <input
                id="ai-base-url-input"
                type="url"
                autoComplete="off"
                spellCheck={false}
                className="field w-full mono"
                style={{ fontSize: 12.5 }}
                placeholder="http://localhost:11434/v1"
                value={baseValue}
                aria-invalid={baseError ? true : undefined}
                onChange={(e) => onBaseChange(e.target.value)}
              />
              {baseError ? (
                <div role="alert" style={{ color: 'var(--danger, #c0392b)', fontSize: 12 }}>
                  {baseError} The last valid address stays saved{settings.baseUrl ? `: ${settings.baseUrl}` : ' (none yet)'}.
                </div>
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.45 }}>
                  Requests go to <span className="mono">{settings.baseUrl || '<Base URL>'}/chat/completions</span> in the OpenAI format.
                  {template ? ` ${template.hint}` : ''}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="ai-api-key-input" className="font-semibold flex items-center gap-1.5" style={{ fontSize: 12.5 }}>
              <KeyRound size={13} style={{ color: 'var(--muted)' }} />
              <span>
                {PROVIDER_LABELS[provider]} API key{isServer ? ' (optional)' : ''} (stored only on this device)
              </span>
            </label>
            <div className="flex gap-2">
              <input
                id="ai-api-key-input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="field flex-1 min-w-0 mono"
                style={{ fontSize: 12.5 }}
                placeholder={provider === 'gemini' ? 'AIza…' : provider === 'claude' ? 'sk-ant-…' : 'leave empty for a local server'}
                value={currentKey}
                onChange={(e) => setAiApiKey(provider, e.target.value)}
              />
              <button
                type="button"
                className="btn shrink-0"
                disabled={!currentKey}
                onClick={() => removeAiApiKey(provider)}
                title="Remove stored API key"
              >
                <Trash2 size={13} /> Remove key
              </button>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.45 }}>
              {isServer ? 'OpenRouter keys come from' : 'Get a key from'}{' '}
              <a className="underline" href={help.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                {help.label} <ExternalLink size={11} className="inline" />
              </a>{' '}
              (<span className="mono">{help.url}</span>). {help.note}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ai-model-input" className="font-semibold block" style={{ fontSize: 12.5 }}>
              Model
            </label>
            <div className="flex gap-2">
              <input
                id="ai-model-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                className="field flex-1 min-w-0 mono"
                style={{ fontSize: 12.5 }}
                placeholder={isServer ? (template?.modelHint ?? 'model name on your server') : defaultModel}
                value={currentModel}
                onChange={(e) => setAiModel(provider, e.target.value)}
              />
              {!isServer && (
                <button
                  type="button"
                  className="btn shrink-0"
                  disabled={currentModel.trim() === defaultModel}
                  onClick={() => setAiModel(provider, defaultModel)}
                >
                  Reset default
                </button>
              )}
            </div>
            {provider === 'claude' && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Claude models">
                {CLAUDE_MODEL_CHOICES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="btn mono"
                    style={{ fontSize: 12 }}
                    aria-pressed={currentModel.trim() === m}
                    disabled={currentModel.trim() === m}
                    onClick={() => setAiModel('claude', m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
            <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>
              {isServer ? (
                'The name your server uses, for example the one shown by "ollama list".'
              ) : (
                <>
                  Default: <code className="mono">{defaultModel}</code>
                  {provider === 'claude' ? ' (cheaper); claude-sonnet-5-5 is stronger and costs more.' : ''}
                </>
              )}
            </div>
          </div>

          <div
            className="rounded-lg p-2.5"
            style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--muted)', fontSize: 12 }}
          >
            Your key is never included in share links, model links, notebooks (.ipynb), database backups, or logs.
          </div>

          <div className="flex justify-end">
            <button type="button" className="btn btn-primary" onClick={() => openAiSettings(false)}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AiConsentDialog() {
  const prompt = useLab((s) => s.aiConsentPrompt)

  useEffect(() => {
    if (!prompt) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelAiConsent()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prompt])

  if (!prompt) return null

  const isServer = prompt.provider === 'openai'
  const serverUrl = prompt.baseUrl ?? ''
  const local = isServer && isLocalBaseUrl(serverUrl)
  const serverHost = (() => {
    try {
      return new URL(serverUrl).host
    } catch {
      return serverUrl
    }
  })()
  const providerName = isServer ? serverHost || 'your server' : PROVIDER_FULL_LABELS[prompt.provider]

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(10,14,20,0.6)' }}
      onMouseDown={(e) => e.target === e.currentTarget && cancelAiConsent()}
    >
      <div
        role="dialog"
        aria-label="Confirm sending context to AI provider"
        className="w-full max-w-md flex flex-col rounded-xl shadow-2xl"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
      >
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <ShieldAlert size={18} style={{ color: 'var(--accent)' }} className="shrink-0" />
          <div className="font-semibold flex-1">Before using {providerName}</div>
          <button type="button" className="btn btn-ghost" onClick={cancelAiConsent} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3" style={{ fontSize: 13, lineHeight: 1.5 }}>
          <p>
            <b>What is sent when you click Send:</b> your table schema, column types, computed summary statistics (
            <code className="mono">isna().sum()</code> and <code className="mono">describe()</code>), the current cell, and the last error. With the switch <i>&ldquo;Send the notebook&rsquo;s code&rdquo;</i> on (it is on by default), also the code and text of the cells above the current one (never their outputs), your &ldquo;Decisions so far&rdquo; note, and the last messages of this conversation. Your code is not personal data, but it goes to the provider too, so keep anything confidential out of your cells. &ldquo;Show exactly what is sent&rdquo; under the input shows the whole request.
          </p>
          <p>
            <b>In a SQL tab</b> it is the dialect, the statement under the cursor (or your selection), a few statements above it, the columns of the tables that statement names, your &ldquo;Decisions so far&rdquo; note, the last messages, and the last error or the column names of the last result. Never the whole tab.
          </p>
          <p>
            <b>No raw rows by default:</b> table rows are never sent unless you explicitly tick{' '}
            <i>&ldquo;Also send the first 20 rows for this request&rdquo;</i> (in a SQL tab: the first 20 rows of the last result) for a single question.
          </p>
          <p>
            {local ? (
              <>
                <b>Stays on this computer:</b> the server at {serverHost} runs on this computer, so the request goes from your browser to it and the data does not leave your device. The owner of Quaera Lab sees nothing.
              </>
            ) : isServer ? (
              <>
                <b>Direct to {providerName}:</b> requests go from your browser to {serverHost}, a server that is not this computer, with your key if you entered one. Whoever runs it can see what you send. The owner of Quaera Lab sees nothing.
              </>
            ) : (
              <>
                <b>Direct to {providerName}:</b> requests go directly from your browser to {providerName} using your API key. The owner of Quaera Lab sees nothing.
              </>
            )}
          </p>
          {prompt.provider === 'gemini' && (
            <p>
              <b>Free tier:</b> the limits are per Google project and show in AI Studio under Rate Limits; past them you get a 429 message. Outside the EEA, UK and Switzerland (for example in Kazakhstan), Google may use free-tier requests to improve its products, and people there may read them. In the EEA (for example Portugal) and on a paid project it does not. See{' '}
              <a className="underline" href={GEMINI_TERMS_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                Google&rsquo;s terms <ExternalLink size={11} className="inline" />
              </a>
              .
            </p>
          )}
          {!local && (
            <div
              className="rounded-lg p-2.5"
              style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)', fontSize: 12.5 }}
            >
              Do not send company, confidential, or personal data.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn" onClick={cancelAiConsent}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={confirmAiConsent}>
              I understand, continue
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AiHelperPanel() {
  const open = useLab((s) => s.aiPanelOpen)
  const tab = useLab((s) => s.tabs.find((t) => t.id === s.activeTab))
  const sql = tabDialect(tab) !== 'python'
  const panelW = useSidePanelWidth(open)
  const settings = useLab((s) => s.aiSettings)
  const keys = useLab((s) => s.aiKeys)
  const req = useLab((s) => s.aiRequest)
  const sendNotebook = useLab((s) => s.aiSendNotebook)

  const [question, setQuestion] = useState('')
  const [includeSampleRows, setIncludeSampleRows] = useState(false)
  const [speechLang, setSpeechLang] = useState<AiSpeechLang>(loadSpeechLang)
  const [listening, setListening] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const speechSupported = getSpeechRecognitionCtor() !== null

  const stopListening = () => {
    const rec = recognitionRef.current
    if (rec) {
      recognitionRef.current = null
      try {
        rec.stop()
      } catch {
        /* ignore already stopped */
      }
    }
    setListening(false)
  }

  useEffect(() => {
    if (!open) stopListening()
  }, [open, tab])

  useEffect(() => () => stopListening(), [])

  if (!open) return null

  const provider = settings.provider
  const providerLabel = PROVIDER_LABELS[provider]
  const activeModel = settings.models[provider].trim() || DEFAULT_AI_MODELS[provider]
  const isServer = provider === 'openai'
  const hasKey = isServer ? settings.baseUrl !== '' && activeModel !== '' : keys[provider].trim().length > 0
  const ready = settings.enabled && hasKey
  const loading = req.status === 'loading'

  const toggleDictation = () => {
    if (listening) {
      stopListening()
      return
    }
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    setSpeechError(null)
    try {
      const rec = new Ctor()
      rec.continuous = true
      rec.interimResults = false
      rec.lang = speechLang
      rec.onresult = (e) => {
        let added = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const item = e.results[i]
          if (item?.isFinal && item[0]?.transcript) {
            added = appendDictatedText(added, item[0].transcript)
          }
        }
        if (added) setQuestion((prev) => appendDictatedText(prev, added))
      }
      rec.onerror = (e) => {
        const code = e?.error ?? ''
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setSpeechError('Microphone access denied in this browser.')
        } else if (code === 'audio-capture') {
          setSpeechError('No microphone device found.')
        } else if (code && code !== 'no-speech' && code !== 'aborted') {
          setSpeechError(`Voice dictation stopped (${code}).`)
        }
        recognitionRef.current = null
        setListening(false)
      }
      rec.onend = () => {
        recognitionRef.current = null
        setListening(false)
      }
      recognitionRef.current = rec
      rec.start()
      setListening(true)
    } catch {
      recognitionRef.current = null
      setListening(false)
      setSpeechError('Could not start voice dictation in this browser.')
    }
  }

  const toggleSpeechLang = () => {
    if (listening) stopListening()
    const next = nextAiSpeechLang(speechLang)
    setSpeechLang(next)
    saveSpeechLang(next)
  }

  // A reply clears the field; an error (429, a dropped connection) leaves the question where it was.
  const submit = async (opts: Parameters<typeof askAi>[0], sent: string) => {
    stopListening()
    const withRows = includeSampleRows
    setIncludeSampleRows(false)
    const ok = await askAi({ ...opts, includeSampleRows: withRows })
    if (ok) setQuestion((now) => (now === sent ? '' : now))
    else if (withRows) setIncludeSampleRows(true)
  }

  const sendQuick = (action: AiQuickAction) => {
    if (loading) return
    void submit({ action, question }, question)
  }

  const sendQuestion = () => {
    const q = question.trim()
    if (!q || loading) return
    void submit({ question: q }, question)
  }

  return (
    <aside
      ref={panelW.ref}
      aria-label="AI helper panel"
      className="relative w-full md:w-[var(--ai-w)] shrink-0 flex flex-col min-h-0 max-h-[46vh] md:max-h-none border-t md:border-t-0 md:border-l"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)', ['--ai-w' as string]: `${panelW.width}px` }}
    >
      <SidePanelHandle width={panelW.width} max={panelW.max} row={panelW.row} onWidth={panelW.setWidth} />
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-2"
        style={{ background: 'var(--panel-2)', borderBottom: '1px solid var(--line)', fontSize: 12.5, zoom: 'var(--practice-zoom, 1)' }}
      >
        <Sparkles size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
        <span className="font-semibold flex-1 truncate">AI helper (optional)</span>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: '2px 6px', fontSize: 11.5 }}
          onClick={() => openAiSettings(true)}
          title="AI helper settings"
        >
          <Settings size={13} />
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: '2px 6px' }}
          onClick={() => toggleAiPanel(false)}
          aria-label="Close AI helper"
          title="Close AI helper"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-3 space-y-3" style={{ fontSize: 12.5, zoom: 'var(--practice-zoom, 1)' }}>
        {!ready ? (
          <>
          <div
            className="rounded-lg p-3 space-y-2.5"
            style={{ background: 'var(--panel-2)', border: '1px solid var(--line)' }}
          >
            <div className="font-semibold">
              {!settings.enabled
                ? 'AI helper is OFF by default'
                : isServer
                  ? 'No server address or model saved'
                  : `No ${providerLabel} API key stored`}
            </div>
            <p style={{ color: 'var(--muted)', lineHeight: 1.45 }}>
              {!settings.enabled
                ? 'Quaera Lab never connects to any AI service unless you turn on this optional bring-your-own-key helper and click Send.'
                : isServer
                  ? 'Add the Base URL and the model name of your server in settings.'
                  : `Add your ${providerLabel} API key in settings to ask questions directly from your browser.`}
            </p>
            <button type="button" className="btn btn-primary" onClick={() => openAiSettings(true)}>
              <Settings size={13} /> Open AI helper settings…
            </button>
          </div>
            {tab && <AiSees tabId={tab.id} question="" includeRows={false} />}
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {quickActionsFor(tabDialect(tab)).map((qa) => (
                <button
                  key={qa.id}
                  type="button"
                  disabled={loading}
                  onClick={() => sendQuick(qa.id)}
                  className="btn"
                  style={{ padding: '3px 8px', fontSize: 11.5 }}
                >
                  {qa.label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <textarea
                rows={2}
                className="field w-full"
                style={{ fontSize: 12.5, resize: 'vertical' }}
                placeholder={sql ? 'Ask about this query, table, or error…' : 'Ask about your stage, table, or error…'}
                aria-label="Ask AI helper"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendQuestion()
                  }
                }}
              />

              <label className="flex items-start gap-2 cursor-pointer select-none" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={includeSampleRows}
                  onChange={(e) => setIncludeSampleRows(e.target.checked)}
                />
                <span>{sql ? 'Also send the first 20 rows of the last result for this request' : 'Also send the first 20 rows for this request'}</span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer select-none" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={sendNotebook}
                  onChange={(e) => setAiSendNotebook(e.target.checked)}
                />
                <span>{sql ? 'Send the statements above this one (no results)' : <>Send the notebook&rsquo;s code (the cells above this one, no outputs)</>}</span>
              </label>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  disabled={loading || !question.trim()}
                  onClick={sendQuestion}
                >
                  <Send size={12} /> Send
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{
                    padding: '4px 8px',
                    fontSize: 12,
                    ...(listening
                      ? { borderColor: 'var(--danger)', color: 'var(--danger)', background: 'var(--danger-soft)' }
                      : undefined),
                  }}
                  disabled={loading || !speechSupported}
                  onClick={toggleDictation}
                  aria-pressed={listening}
                  aria-label={listening ? 'Stop voice dictation' : 'Dictate question with microphone'}
                  title={
                    speechSupported
                      ? listening
                        ? 'Stop dictation'
                        : 'Dictate question into the input box (never auto-sends)'
                      : 'Voice dictation uses browser SpeechRecognition (unavailable here)'
                  }
                >
                  {listening ? <MicOff size={13} /> : <Mic size={13} />}
                  <span className="hidden sm:inline">{listening ? 'Stop' : 'Speak'}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '4px 6px', fontSize: 11 }}
                  disabled={loading || !speechSupported}
                  onClick={toggleSpeechLang}
                  title={`Dictation language: ${speechLang === 'ru-RU' ? 'Russian' : 'English'} (click to switch)`}
                >
                  {speechLang === 'ru-RU' ? 'RU' : 'EN'}
                </button>
                {loading && (
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={cancelAiRequest}
                  >
                    Cancel
                  </button>
                )}
                {tab && <NewConversationButton tabId={tab.id} />}
              </div>
              {speechError && (
                <div style={{ fontSize: 11, color: 'var(--danger)' }} role="status">
                  {speechError}
                </div>
              )}
              {listening && !speechError && (
                <div style={{ fontSize: 11, color: 'var(--accent)' }} role="status">
                  Listening ({speechLang === 'ru-RU' ? 'RU' : 'EN'})… speak your question, then click Send when ready.
                </div>
              )}
            </div>

            {tab && <AiSees tabId={tab.id} question={question} includeRows={includeSampleRows} />}
            {tab && <AiDecisions tabId={tab.id} />}

            {req.status === 'loading' && (
              <div
                className="rounded-lg p-3 flex items-center gap-2"
                style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--muted)' }}
                role="status"
              >
                <Loader2 size={14} className="animate-spin shrink-0" />
                <span className="truncate">
                  Asking {providerLabel}: {req.promptLabel}
                  {req.tabId && tab && req.tabId !== tab.id ? ' (in another tab)' : ''}…
                </span>
              </div>
            )}

            {req.status === 'error' && (!req.tabId || !tab || req.tabId === tab.id) && (
              <div
                className="rounded-lg p-3 space-y-2"
                style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                role="alert"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <div className="min-w-0 leading-relaxed">{req.message}</div>
                </div>
                {req.kind === 'auth' && (
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '3px 8px', fontSize: 11.5 }}
                    onClick={() => openAiSettings(true)}
                  >
                    <KeyRound size={12} /> Re-enter key…
                  </button>
                )}
              </div>
            )}

            {tab && <AiFeed tabId={tab.id} />}
          </>
        )}
      </div>

      <div
        className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5"
        style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', color: 'var(--muted)', fontSize: 11, zoom: 'var(--practice-zoom, 1)' }}
      >
        <span className="truncate">
          {providerLabel} · <span className="mono">{activeModel || 'no model set'}</span> · no rows unless ticked
        </span>
        <button type="button" className="hover:underline shrink-0" style={{ color: 'var(--accent)' }} onClick={() => openAiSettings(true)}>
          Settings…
        </button>
      </div>
    </aside>
  )
}
