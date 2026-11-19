import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  AI_API_KEY_STORAGE,
  AI_CONSENT_KEY,
  AI_ENDPOINT_TEMPLATES,
  CLAUDE_MODEL_CHOICES,
  hasAiConsent,
  isLocalBaseUrl,
  normalizeBaseUrl,
  AI_KEY_HELP,
  GEMINI_TERMS_URL,
  AI_QUICK_ACTIONS,
  AI_SETTINGS_KEY,
  DEFAULT_AI_MODELS,
  MAX_AI_REPLY_CHARS,
  MAX_AI_OUTPUT_TOKENS,
  buildProviderRequest,
  buildTutorSystemPrompt,
  classifyFetchError,
  insertCodeAtCursor,
  insertCodeCellBelow,
  parseAiConsent,
  parseAiReplyBlocks,
  parseAiSettings,
  parseAiSpeechLang,
  parseProviderReply,
  redactSecrets,
  replaceCurrentCodeCell,
  appendDictatedText,
  nextAiSpeechLang,
} from '../src/core/aiProvider'
import { splitCells } from '../src/core/pyCells'

describe('AI settings and consent parsing', () => {
  it('defaults to OFF with expected default models and keys', () => {
    expect(AI_SETTINGS_KEY).toBe('stratalab.ai.settings.v1')
    expect(AI_CONSENT_KEY).toBe('stratalab.ai.consent.v1')
    expect(AI_API_KEY_STORAGE).toEqual({
      gemini: 'stratalab.ai.key.gemini',
      claude: 'stratalab.ai.key.claude',
      openai: 'stratalab.ai.key.openai',
    })
    expect(DEFAULT_AI_MODELS).toEqual({
      gemini: 'gemini-3.8-flash',
      claude: 'claude-haiku-5-5',
      openai: '',
    })
    expect(CLAUDE_MODEL_CHOICES).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5'])
    expect(AI_KEY_HELP.gemini.url).toBe('https://aistudio.google.com/apikey')
    expect(AI_KEY_HELP.claude.url).toBe('https://console.anthropic.com')
    expect(AI_KEY_HELP.gemini.note).toMatch(/EEA, UK and Switzerland/)
    expect(GEMINI_TERMS_URL).toBe('https://ai.google.dev/gemini-api/docs/terms')
    expect(AI_KEY_HELP.claude.note).toMatch(/Pro or Max subscription does not connect/)
    expect(AI_KEY_HELP.claude.note).toMatch(/no free tier/)
    expect(AI_KEY_HELP.claude.note).toContain('console.anthropic.com')
    expect(AI_QUICK_ACTIONS.map((a) => a.id)).toEqual([
      'explain-stage',
      'why-failed',
      'suggest-next',
      'what-odd',
    ])

    expect(parseAiSettings(null)).toEqual({
      enabled: false,
      provider: 'gemini',
      models: { gemini: 'gemini-3.8-flash', claude: 'claude-haiku-5-5', openai: '' },
      baseUrl: '',
    })
    expect(parseAiSettings('{not json')).toEqual({
      enabled: false,
      provider: 'gemini',
      models: { gemini: 'gemini-3.8-flash', claude: 'claude-haiku-5-5', openai: '' },
      baseUrl: '',
    })
    expect(
      parseAiSettings(
        JSON.stringify({
          enabled: true,
          provider: 'claude',
          models: { gemini: 'gemini-2.5-flash', claude: '  ' },
          apiKey: 'should-be-ignored',
        }),
      ),
    ).toEqual({
      enabled: true,
      provider: 'claude',
      models: { gemini: 'gemini-3.8-flash', claude: 'claude-haiku-5-5', openai: '' },
      baseUrl: '',
    })
    expect(
      parseAiSettings(
        JSON.stringify({
          enabled: true,
          provider: 'gemini',
          models: { gemini: 'models/gemini-3.8-flash' },
        }),
      ),
    ).toEqual({
      enabled: true,
      provider: 'gemini',
      models: { gemini: 'gemini-3.8-flash', claude: 'claude-haiku-5-5', openai: '' },
      baseUrl: '',
    })
    expect(
      parseAiSettings(
        JSON.stringify({
          enabled: true,
          provider: 'gemini',
          models: { gemini: 'gemini-2.5-pro', claude: 'claude-opus-4-6' },
        }),
      ),
    ).toEqual({
      enabled: true,
      provider: 'gemini',
      models: { gemini: 'gemini-2.5-pro', claude: 'claude-opus-4-6', openai: '' },
      baseUrl: '',
    })
  })

  it('moves a saved claude-sonnet-4-6 to claude-sonnet-5-5 and keeps other saved ids', () => {
    const saved = (claude: string) =>
      parseAiSettings(JSON.stringify({ enabled: true, provider: 'claude', models: { claude } })).models.claude
    expect(saved('claude-sonnet-4-6')).toBe('claude-sonnet-5-5')
    expect(saved(' claude-sonnet-4-6 ')).toBe('claude-sonnet-5-5')
    expect(saved('claude-sonnet-5-5')).toBe('claude-sonnet-5-5')
    expect(saved('claude-opus-4-6')).toBe('claude-opus-4-6')
    expect(saved('')).toBe('claude-haiku-5-5')
  })

  it('saves only a valid Base URL for the OpenAI-compatible provider', () => {
    const parse = (baseUrl: unknown, model = 'llama3.2') =>
      parseAiSettings(JSON.stringify({ enabled: true, provider: 'openai', baseUrl, models: { openai: model } }))
    expect(parse('http://localhost:11434/v1/')).toMatchObject({
      provider: 'openai',
      baseUrl: 'http://localhost:11434/v1',
      models: { openai: 'llama3.2' },
    })
    expect(parse('  https://openrouter.ai/api/v1  ').baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(parse('').baseUrl).toBe('')
    expect(parse('localhost:11434/v1').baseUrl).toBe('')
    expect(parse('ftp://host/v1').baseUrl).toBe('')
    expect(parse(42).baseUrl).toBe('')
  })

  it('parses speech language and appends dictated text cleanly', () => {
    expect(parseAiSpeechLang('ru-RU', 'en-US')).toBe('ru-RU')
    expect(parseAiSpeechLang('en-US', 'ru-RU')).toBe('en-US')
    expect(parseAiSpeechLang(null, 'ru-RU')).toBe('ru-RU')
    expect(parseAiSpeechLang('fr-FR', 'en-GB')).toBe('en-US')
    expect(nextAiSpeechLang('ru-RU')).toBe('en-US')
    expect(nextAiSpeechLang('en-US')).toBe('ru-RU')
    expect(appendDictatedText('', 'check missing values')).toBe('check missing values')
    expect(appendDictatedText('What about  ', '  describe? ')).toBe('What about describe?')
    expect(appendDictatedText('Existing text', '   ')).toBe('Existing text')
  })

  it('parses per-provider consent strictly', () => {
    const none = { gemini: false, claude: false, openai: false, openaiOrigin: '' }
    expect(parseAiConsent(null)).toEqual(none)
    expect(parseAiConsent('bad')).toEqual(none)
    expect(parseAiConsent(JSON.stringify({ gemini: true }))).toEqual({ ...none, gemini: true })
    expect(parseAiConsent(JSON.stringify({ gemini: 'yes', claude: true }))).toEqual({ ...none, claude: true })
    // consent for a server without a remembered address counts for nothing
    expect(parseAiConsent(JSON.stringify({ openai: true }))).toEqual(none)
    expect(parseAiConsent(JSON.stringify({ openai: true, openaiOrigin: 'http://localhost:11434' }))).toEqual({
      ...none,
      openai: true,
      openaiOrigin: 'http://localhost:11434',
    })
  })

  it('asks consent again when the server address changes', () => {
    const consent = parseAiConsent(JSON.stringify({ openai: true, openaiOrigin: 'http://localhost:11434' }))
    const at = (baseUrl: string) => ({ provider: 'openai' as const, baseUrl })
    expect(hasAiConsent(consent, at('http://localhost:11434/v1'))).toBe(true)
    expect(hasAiConsent(consent, at('http://localhost:11434/other'))).toBe(true)
    expect(hasAiConsent(consent, at('https://openrouter.ai/api/v1'))).toBe(false)
    expect(hasAiConsent(consent, at(''))).toBe(false)
    expect(hasAiConsent(consent, { provider: 'claude', baseUrl: '' })).toBe(false)
  })
})

describe('Tutor system prompt and request builders', () => {
  it('mentions Pyodide package constraints and lab helpers in system prompt', () => {
    const prompt = buildTutorSystemPrompt()
    expect(prompt).toContain('lab.table')
    expect(prompt).toContain('lab.sql')
    expect(prompt).toContain('lab.save')
    expect(prompt).toContain('pandas')
    expect(prompt).toContain('numpy')
    expect(prompt).toContain('matplotlib')
    expect(prompt).toContain('seaborn')
    expect(prompt).toContain('scikit-learn')
    expect(prompt).toContain('pip install')
    expect(prompt).toContain('Insert as new cell')
    expect(prompt).toContain('Replace current cell')
    expect(prompt).toContain('Insert at cursor')
    expect(prompt).toContain('```python')
  })

  it('mentor prompt offers 2-3 options with pros and cons, asks which one, and writes code only after the choice', () => {
    const prompt = buildTutorSystemPrompt()
    expect(prompt).toContain('mentor')
    expect(prompt).toContain('2 or 3 options')
    expect(prompt).toContain('pros')
    expect(prompt).toContain('cons')
    expect(prompt).toContain('which option the learner picks')
    expect(prompt).toContain('write no code in that reply')
    expect(prompt).toContain('only after the learner has chosen')
    const next = AI_QUICK_ACTIONS.find((a) => a.id === 'suggest-next')
    expect(next?.instruction).toContain('2 or 3 options')
    expect(next?.instruction).toContain('write no code until they choose')
  })

  it('builds Gemini request with x-goog-api-key header and never puts key in URL', () => {
    const secret = 'AIzaSyDummySecretKey1234567890abcd'
    const req = buildProviderRequest({
      provider: 'gemini',
      apiKey: secret,
      model: 'models/gemini-3.8-flash',
      systemPrompt: 'sys',
      userPrompt: 'usr',
    })
    expect(req.method).toBe('POST')
    expect(req.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    )
    expect(req.url).not.toContain(secret)
    expect(req.url).not.toContain('key=')
    expect(req.headers['Content-Type']).toBe('application/json')
    expect(req.headers['x-goog-api-key']).toBe(secret)
    const body = JSON.parse(req.body) as {
      systemInstruction: { parts: { text: string }[] }
      contents: { role: string; parts: { text: string }[] }[]
      generationConfig: { maxOutputTokens: number; temperature: number }
    }
    expect(body.systemInstruction.parts[0].text).toBe('sys')
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'usr' }] })
    expect(body.generationConfig).toEqual({ maxOutputTokens: MAX_AI_OUTPUT_TOKENS, temperature: 0.3 })
  })

  it('builds Claude request with x-api-key, anthropic-version, and direct browser header', () => {
    const secret = 'sk-ant-api03-DummySecretKey1234567890'
    const req = buildProviderRequest({
      provider: 'claude',
      apiKey: secret,
      model: 'claude-haiku-5-5',
      systemPrompt: 'sys',
      userPrompt: 'usr',
    })
    expect(req.method).toBe('POST')
    expect(req.url).toBe('https://api.anthropic.com/v1/messages')
    expect(req.headers).toEqual({
      'Content-Type': 'application/json',
      'x-api-key': secret,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    })
    const body = JSON.parse(req.body) as {
      model: string
      max_tokens: number
      system: string
      messages: { role: string; content: string }[]
    }
    expect(body).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: MAX_AI_OUTPUT_TOKENS,
      system: 'sys',
      messages: [{ role: 'user', content: 'usr' }],
    })
  })
})

describe('OpenAI-compatible provider', () => {
  const base = { provider: 'openai' as const, systemPrompt: 'sys', userPrompt: 'usr', model: 'llama3.2' }

  it('normalizes the Base URL and refuses empty or odd ones', () => {
    expect(normalizeBaseUrl('http://localhost:11434/v1/')).toEqual({ ok: true, url: 'http://localhost:11434/v1' })
    expect(normalizeBaseUrl('  https://openrouter.ai/api/v1///  ')).toEqual({ ok: true, url: 'https://openrouter.ai/api/v1' })
    expect(normalizeBaseUrl('HTTP://127.0.0.1:1234/v1')).toMatchObject({ ok: true })
    for (const bad of ['', '   ', 'localhost:11434/v1', '//host/v1', 'ftp://host/v1', 'http://', 'https://user:pw@host/v1', 'http://host/v1?x=1']) {
      expect(normalizeBaseUrl(bad), bad).toMatchObject({ ok: false })
    }
    expect(AI_ENDPOINT_TEMPLATES.map((t) => t.baseUrl)).toEqual([
      'http://localhost:11434/v1',
      'http://localhost:1234/v1',
      'https://openrouter.ai/api/v1',
    ])
    for (const t of AI_ENDPOINT_TEMPLATES) expect(normalizeBaseUrl(t.baseUrl)).toMatchObject({ ok: true })
    expect(AI_ENDPOINT_TEMPLATES[0].hint).toContain('OLLAMA_ORIGINS=https://lab.quaera.app')
  })

  it('knows which addresses are on this computer', () => {
    expect(isLocalBaseUrl('http://localhost:11434/v1')).toBe(true)
    expect(isLocalBaseUrl('http://127.0.0.1:1234/v1')).toBe(true)
    expect(isLocalBaseUrl('http://[::1]:8080/v1')).toBe(true)
    expect(isLocalBaseUrl('http://ollama.localhost/v1')).toBe(true)
    expect(isLocalBaseUrl('https://openrouter.ai/api/v1')).toBe(false)
    expect(isLocalBaseUrl('http://localhost.evil.com/v1')).toBe(false)
    expect(isLocalBaseUrl('http://192.168.1.5:11434/v1')).toBe(false)
    expect(isLocalBaseUrl('not a url')).toBe(false)
  })

  it('builds POST {base}/chat/completions in the OpenAI format, with the key only when given', () => {
    const noKey = buildProviderRequest({ ...base, apiKey: '', baseUrl: 'http://localhost:11434/v1/' })
    expect(noKey.method).toBe('POST')
    expect(noKey.url).toBe('http://localhost:11434/v1/chat/completions')
    expect(noKey.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(noKey.body)).toEqual({
      model: 'llama3.2',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'usr' },
      ],
      max_tokens: MAX_AI_OUTPUT_TOKENS,
      temperature: 0.3,
      stream: false,
    })
    const secret = 'sk-or-v1-DummySecretKey1234567890'
    const keyed = buildProviderRequest({ ...base, apiKey: ` ${secret} `, baseUrl: 'https://openrouter.ai/api/v1' })
    expect(keyed.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(keyed.headers.Authorization).toBe(`Bearer ${secret}`)
    expect(keyed.url).not.toContain(secret)
    expect(keyed.body).not.toContain(secret)
  })

  it('refuses to build a request without a usable Base URL or model', () => {
    expect(() => buildProviderRequest({ ...base, apiKey: '', baseUrl: '' })).toThrow(/Base URL/)
    expect(() => buildProviderRequest({ ...base, apiKey: '', baseUrl: 'localhost:11434' })).toThrow(/http/)
    expect(() => buildProviderRequest({ ...base, apiKey: '', model: '  ', baseUrl: 'http://localhost:11434/v1' })).toThrow(/model/)
  })

  it('reads a reply, whether content is text or a list of parts', () => {
    const ok = parseProviderReply('openai', 200, JSON.stringify({ choices: [{ message: { content: ' Pick **one**. ' }, finish_reason: 'stop' }] }))
    expect(ok).toEqual({ ok: true, text: 'Pick **one**.', truncated: false })
    const parts = parseProviderReply(
      'openai',
      200,
      JSON.stringify({ choices: [{ message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } }] }),
    )
    expect(parts).toMatchObject({ ok: true, text: 'ab' })
    const long = parseProviderReply('openai', 200, JSON.stringify({ choices: [{ message: { content: 'x'.repeat(MAX_AI_REPLY_CHARS + 10) } }] }))
    expect(long).toMatchObject({ ok: true, truncated: true })
    const redacted = parseProviderReply(
      'openai',
      200,
      JSON.stringify({ choices: [{ message: { content: 'your key is local-secret-key-1' } }] }),
      ['local-secret-key-1'],
    )
    expect(redacted).toMatchObject({ ok: true, text: 'your key is [REDACTED_KEY]' })
  })

  it('names what went wrong: empty, filtered, 404 address, 404 model, key, limit, unreadable', () => {
    expect(parseProviderReply('openai', 200, JSON.stringify({ choices: [{ message: { content: '  ' } }] }))).toMatchObject({ ok: false, kind: 'empty' })
    expect(parseProviderReply('openai', 200, JSON.stringify({ choices: [] }))).toMatchObject({ ok: false, kind: 'empty' })
    expect(parseProviderReply('openai', 200, JSON.stringify({ choices: [{ message: { content: null }, finish_reason: 'content_filter' }] }))).toMatchObject({ ok: false, kind: 'filtered' })
    expect(parseProviderReply('openai', 200, '<html>proxy</html>')).toMatchObject({ ok: false, kind: 'api' })

    const wrongUrl = parseProviderReply('openai', 404, '404 page not found')
    expect(wrongUrl).toMatchObject({ ok: false, kind: 'bad_url' })
    if (!wrongUrl.ok) expect(wrongUrl.message).toContain('/chat/completions')
    expect(parseProviderReply('openai', 404, JSON.stringify({ error: { message: 'Not Found' } }))).toMatchObject({ ok: false, kind: 'bad_url' })

    // Ollama: error is a plain string; OpenAI and OpenRouter: an object
    const ollama = parseProviderReply('openai', 404, JSON.stringify({ error: "model 'llama9' not found" }))
    expect(ollama).toMatchObject({ ok: false, kind: 'no_model' })
    if (!ollama.ok) expect(ollama.message).toContain('ollama pull')
    expect(parseProviderReply('openai', 404, JSON.stringify({ error: { message: 'The model `x` does not exist' } }))).toMatchObject({ ok: false, kind: 'no_model' })

    const auth = parseProviderReply('openai', 401, JSON.stringify({ error: { message: 'Bad key local-secret-key-1' } }), ['local-secret-key-1'])
    expect(auth).toMatchObject({ ok: false, kind: 'auth' })
    if (!auth.ok) {
      expect(auth.message).toContain('The server API key was rejected')
      expect(auth.message).not.toContain('local-secret-key-1')
    }
    expect(parseProviderReply('openai', 429, '{}')).toMatchObject({ ok: false, kind: 'rate_limit' })
    expect(parseProviderReply('openai', 500, '{"error":"boom"}')).toMatchObject({ ok: false, kind: 'api' })
    // a 404 from Gemini or Claude is still a plain API error, not an address problem
    expect(parseProviderReply('gemini', 404, JSON.stringify({ error: { message: 'model not found' } }))).toMatchObject({ ok: false, kind: 'api' })
  })

  it('explains CORS and Private Network Access for a local server, and only then', () => {
    const net = new TypeError('Failed to fetch')
    const local = classifyFetchError(net, true, [], { provider: 'openai', baseUrl: 'http://localhost:11434/v1' })
    expect(local).toMatchObject({ ok: false, kind: 'network' })
    expect(local.message).toContain('OLLAMA_ORIGINS=https://lab.quaera.app')
    expect(local.message).toContain('http://localhost:11434/v1')
    // a local server works offline: the offline message would be wrong
    expect(classifyFetchError(net, false, [], { provider: 'openai', baseUrl: 'http://127.0.0.1:1234/v1' }).kind).toBe('network')
    const remote = classifyFetchError(net, true, [], { provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1' })
    expect(remote).toMatchObject({ kind: 'network' })
    expect(remote.message).toContain('https://openrouter.ai/api/v1')
    expect(remote.message).not.toContain('OLLAMA_ORIGINS')
    expect(classifyFetchError(net, false, [], { provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1' }).kind).toBe('offline')
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    expect(classifyFetchError(abort, true, [], { provider: 'openai', baseUrl: 'http://localhost:11434/v1' }).kind).toBe('aborted')
  })
})

describe('Provider reply parsing and error classification', () => {
  it('parses recorded Gemini and Claude success responses', () => {
    const geminiSample = JSON.stringify({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: 'Start by checking missing values.\n\n```python\ndf.isna().sum()\n```' }],
          },
          finishReason: 'STOP',
        },
      ],
    })
    expect(parseProviderReply('gemini', 200, geminiSample)).toEqual({
      ok: true,
      text: 'Start by checking missing values.\n\n```python\ndf.isna().sum()\n```',
      truncated: false,
    })

    const claudeSample = JSON.stringify({
      id: 'msg_01',
      type: 'message',
      role: 'assistant',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Group by category first.\n\n```python\ndf.groupby("cat").sum()\n```' }],
    })
    expect(parseProviderReply('claude', 200, claudeSample)).toEqual({
      ok: true,
      text: 'Group by category first.\n\n```python\ndf.groupby("cat").sum()\n```',
      truncated: false,
    })
  })

  it('truncates replies exceeding MAX_AI_REPLY_CHARS with visible notice', () => {
    const longBody = 'x'.repeat(MAX_AI_REPLY_CHARS + 500)
    const outcome = parseProviderReply(
      'gemini',
      200,
      JSON.stringify({ candidates: [{ content: { parts: [{ text: longBody }] }, finishReason: 'STOP' }] }),
    )
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.truncated).toBe(true)
      expect(outcome.text.length).toBeLessThanOrEqual(MAX_AI_REPLY_CHARS)
      expect(outcome.text).toContain('[Reply truncated to keep the panel readable]')
    }
  })

  it('handles 401/403, 429, 500, filtered, empty, and fetch errors cleanly', () => {
    const r401 = parseProviderReply(
      'gemini',
      401,
      JSON.stringify({ error: { message: 'Invalid API key AIzaSySecretKey99999999999999999' } }),
    )
    expect(r401.ok).toBe(false)
    if (!r401.ok) {
      expect(r401.kind).toBe('auth')
      expect(r401.message).toContain('[REDACTED_KEY]')
      expect(r401.message).not.toContain('AIzaSySecretKey')
    }

    const r403 = parseProviderReply('claude', 403, JSON.stringify({ error: { message: 'Forbidden' } }))
    expect(r403.ok).toBe(false)
    if (!r403.ok) expect(r403.kind).toBe('auth')

    const r429 = parseProviderReply('claude', 429, JSON.stringify({ error: { message: 'Credit balance low' } }))
    expect(r429.ok).toBe(false)
    if (!r429.ok) {
      expect(r429.kind).toBe('rate_limit')
      expect(r429.message).toContain('credit')
    }
    const g429 = parseProviderReply('gemini', 429, JSON.stringify({ error: { message: 'RESOURCE_EXHAUSTED' } }))
    expect(g429.ok).toBe(false)
    if (!g429.ok) {
      expect(g429.kind).toBe('rate_limit')
      expect(g429.message).toContain('per project')
      expect(g429.message).toContain('Rate Limits')
    }

    const r500 = parseProviderReply('gemini', 500, JSON.stringify({ error: { message: 'Backend down' } }))
    expect(r500.ok).toBe(false)
    if (!r500.ok) expect(r500.kind).toBe('api')

    const safety = parseProviderReply(
      'gemini',
      200,
      JSON.stringify({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }),
    )
    expect(safety).toMatchObject({ ok: false, kind: 'filtered' })

    const blockedPrompt = parseProviderReply(
      'gemini',
      200,
      JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }),
    )
    expect(blockedPrompt).toMatchObject({ ok: false, kind: 'filtered' })

    const refusal = parseProviderReply(
      'claude',
      200,
      JSON.stringify({ stop_reason: 'refusal', content: [] }),
    )
    expect(refusal).toMatchObject({ ok: false, kind: 'filtered' })

    const empty = parseProviderReply(
      'claude',
      200,
      JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '   ' }] }),
    )
    expect(empty).toMatchObject({ ok: false, kind: 'empty' })

    const abortErr = Object.assign(new Error('Aborted'), { name: 'AbortError' })
    expect(classifyFetchError(abortErr, true)).toMatchObject({ ok: false, kind: 'aborted' })
    expect(classifyFetchError(new TypeError('Failed to fetch'), false)).toMatchObject({
      ok: false,
      kind: 'offline',
    })
    expect(classifyFetchError(new TypeError('Failed to fetch'), true)).toMatchObject({
      ok: false,
      kind: 'network',
    })
  })
})

describe('Secret redaction and isolation from export/share modules', () => {
  it('strips explicit keys and Gemini/Claude key patterns', () => {
    const text =
      'Failed with key AIzaSy1234567890abcdefg12345 and sk-ant-api03-abcdef1234567890 and custom-secret-token!'
    const redacted = redactSecrets(text, ['custom-secret-token!'])
    expect(redacted).not.toContain('AIzaSy1234567890')
    expect(redacted).not.toContain('sk-ant-api03')
    expect(redacted).not.toContain('custom-secret-token!')
    expect(redacted).toBe('Failed with key [REDACTED_KEY] and [REDACTED_KEY] and [REDACTED_KEY]')
  })

  it('verifies backup, shareLink, modelLink, and ipynb never touch AI_API_KEY_STORAGE', () => {
    for (const file of [
      'src/core/backup.ts',
      'src/core/shareLink.ts',
      'src/core/modelLink.ts',
      'src/core/ipynb.ts',
    ]) {
      const content = readFileSync(file, 'utf8')
      expect(content, file).not.toContain('AI_API_KEY_STORAGE')
      expect(content, file).not.toContain('stratalab.ai.key')
      expect(content, file).not.toContain('stratalab.ai.settings')
    }
  })
})

describe('Reply block parsing and cell insertion', () => {
  it('splits text and fenced code blocks cleanly including unclosed trailing fence', () => {
    const reply = [
      'First inspect nulls:',
      '',
      '```python',
      'df.isna().sum()',
      '```',
      '',
      'Then plot:',
      '```py',
      'df["total"].hist()',
    ].join('\n')

    expect(parseAiReplyBlocks(reply)).toEqual([
      { kind: 'text', text: 'First inspect nulls:' },
      { kind: 'code', lang: 'python', code: 'df.isna().sum()' },
      { kind: 'text', text: 'Then plot:' },
      { kind: 'code', lang: 'py', code: 'df["total"].hist()' },
    ])
  })

  it('inserts a new # %% code cell below the current cell without running it', () => {
    const initial = '# %%\na = 1\n\n# %%\nb = 2\n'
    const res = insertCodeCellBelow(initial, initial.indexOf('a = 1'), 'df.isna().sum()')
    const cells = splitCells(res.text)
    expect(cells.map((c) => c.source)).toEqual(['a = 1', 'df.isna().sum()', 'b = 2'])

    const emptyRes = insertCodeCellBelow('   ', 0, 'df.describe()')
    expect(emptyRes.text).toBe('# %%\ndf.describe()\n')
    expect(splitCells(emptyRes.text).map((c) => c.source)).toEqual(['df.describe()'])
  })

  it('replaces the current cell across empty, unmarked, marked, markdown, and out-of-bounds cases', () => {
    const emptyRes = replaceCurrentCodeCell('   ', 0, 'df.describe()')
    expect(emptyRes.text).toBe('# %%\ndf.describe()\n')
    expect(emptyRes.cursor).toBe(emptyRes.text.length)

    const unmarked = replaceCurrentCodeCell('a = 1\nb = 2', 3, 'df.info()')
    expect(unmarked.text).toBe('df.info()\n')
    expect(splitCells(unmarked.text).map((c) => c.source)).toEqual(['df.info()'])

    const multi = '# %% Explore\na = 1\n\n# %%\nb = 2\n\n# %%\nc = 3\n'
    const repFirst = replaceCurrentCodeCell(multi, multi.indexOf('a = 1'), 'df.head()')
    expect(repFirst.text).toBe('# %% Explore\ndf.head()\n\n# %%\nb = 2\n\n# %%\nc = 3\n')
    expect(splitCells(repFirst.text).map((c) => c.source)).toEqual(['df.head()', 'b = 2', 'c = 3'])
    expect(repFirst.cursor).toBe(splitCells(repFirst.text)[0].to)

    const repMid = replaceCurrentCodeCell(multi, multi.indexOf('b = 2'), 'df.isna().sum()')
    expect(splitCells(repMid.text).map((c) => c.source)).toEqual(['a = 1', 'df.isna().sum()', 'c = 3'])
    expect(repMid.cursor).toBe(splitCells(repMid.text)[1].to)

    const repPastEnd = replaceCurrentCodeCell(multi, 9999, 'df.tail()')
    expect(splitCells(repPastEnd.text).map((c) => c.source)).toEqual(['a = 1', 'b = 2', 'df.tail()'])

    const repNegative = replaceCurrentCodeCell(multi, -5, 'x = 0')
    expect(splitCells(repNegative.text).map((c) => c.source)).toEqual(['x = 0', 'b = 2', 'c = 3'])

    const tight = '# %%\na = 1\n# %%\nb = 2\n'
    const repTight = replaceCurrentCodeCell(tight, tight.indexOf('a = 1'), 'x = 9')
    expect(splitCells(repTight.text).map((c) => c.source)).toEqual(['x = 9', 'b = 2'])

    const unmarkedThenMarked = 'x = 0\n\n# %%\na = 1\n'
    const repPreamble = replaceCurrentCodeCell(unmarkedThenMarked, 1, 'y = 1')
    expect(repPreamble.text).toBe('y = 1\n\n# %%\na = 1\n')
    expect(splitCells(repPreamble.text).map((c) => c.source)).toEqual(['y = 1', 'a = 1'])

    const mdDoc = '# %% [markdown]\n# Old note\n\n# %%\nb = 2\n'
    const repMd = replaceCurrentCodeCell(mdDoc, mdDoc.indexOf('Old note'), 'print("hi")')
    expect(repMd.text).toBe('# %%\nprint("hi")\n\n# %%\nb = 2\n')
    expect(splitCells(repMd.text).map((c) => c.kind)).toEqual(['code', 'code'])

    const clearCell = replaceCurrentCodeCell('# %%\na = 1\n\n# %%\nb = 2\n', 6, '   ')
    expect(splitCells(clearCell.text).map((c) => c.source)).toEqual(['', 'b = 2'])
  })

  it('inserts code at cursor cleanly across line boundaries, expressions, and edge cases', () => {
    expect(insertCodeAtCursor('', 0, 'df.head()')).toEqual({ text: 'df.head()', cursor: 9 })
    expect(insertCodeAtCursor('   ', 2, 'df.head()')).toEqual({ text: 'df.head()', cursor: 9 })
    expect(insertCodeAtCursor('a = 1\n', 5, '   ')).toEqual({ text: 'a = 1\n', cursor: 5 })

    const doc = '# %%\na = 1\n\nb = 2\n'
    const onBlank = insertCodeAtCursor(doc, doc.indexOf('\n\n') + 1, 'mid = 10')
    expect(onBlank.text).toBe('# %%\na = 1\nmid = 10\nb = 2\n')
    expect(onBlank.cursor).toBe('# %%\na = 1\nmid = 10'.length)

    const atMarkerEnd = insertCodeAtCursor('# %%\na = 1\n', 4, 'x = 0')
    expect(atMarkerEnd.text).toBe('# %%\nx = 0\na = 1\n')

    const atLineEnd = insertCodeAtCursor('# %%\na = 1', 10, 'b = 2')
    expect(atLineEnd.text).toBe('# %%\na = 1\nb = 2')
    expect(atLineEnd.cursor).toBe(atLineEnd.text.length)

    const atLineStart = insertCodeAtCursor('# %%\na = 1\n', 0, 'x = 0')
    expect(atLineStart.text).toBe('x = 0\n# %%\na = 1\n')

    const afterEquals = insertCodeAtCursor('res = \n', 6, 'df.mean()')
    expect(afterEquals.text).toBe('res = df.mean()\n')

    const midExpr = insertCodeAtCursor('print()', 6, 'df.shape')
    expect(midExpr.text).toBe('print(df.shape)')
    expect(midExpr.cursor).toBe('print(df.shape'.length)

    const outOfBoundsNeg = insertCodeAtCursor('a = 1\n', -10, 'x = 0')
    expect(outOfBoundsNeg.text).toBe('x = 0\na = 1\n')

    const outOfBoundsHigh = insertCodeAtCursor('a = 1\n', 999, 'b = 2')
    expect(outOfBoundsHigh.text).toBe('a = 1\nb = 2')
  })
})

describe('conversation history in each provider format (v0.62.0)', () => {
  const history = [
    { role: 'user' as const, text: 'first question' },
    { role: 'assistant' as const, text: 'first answer' },
    { role: 'user' as const, text: 'second question' },
    { role: 'assistant' as const, text: 'second answer' },
  ]
  const base = { apiKey: 'k', systemPrompt: 'SYS', userPrompt: 'NOW', history }

  it('OpenAI-compatible: system, then every message, then the new one', () => {
    const body = JSON.parse(buildProviderRequest({ ...base, provider: 'openai', model: 'm', baseUrl: 'http://localhost:11434/v1' }).body)
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user'])
    expect(body.messages[2]).toEqual({ role: 'assistant', content: 'first answer' })
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'NOW' })
  })
  it('Gemini: contents with the role "model" for the helper', () => {
    const body = JSON.parse(buildProviderRequest({ ...base, provider: 'gemini', model: 'gemini-3.8-flash' }).body)
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user', 'model', 'user'])
    expect(body.contents[1].parts[0].text).toBe('first answer')
    expect(body.contents.at(-1).parts[0].text).toBe('NOW')
    expect(body.systemInstruction.parts[0].text).toBe('SYS')
  })
  it('Claude: system on top, messages start with the learner and alternate', () => {
    const body = JSON.parse(buildProviderRequest({ ...base, provider: 'claude', model: 'claude-haiku-5-5' }).body)
    expect(body.system).toBe('SYS')
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
    expect(body.messages[3].content).toBe('second answer')
  })
  it('without history the body is the single message it was before', () => {
    const body = JSON.parse(buildProviderRequest({ provider: 'claude', apiKey: 'k', model: 'm', systemPrompt: 'S', userPrompt: 'U' }).body)
    expect(body.messages).toEqual([{ role: 'user', content: 'U' }])
  })
  it('the same history moves to another provider: switching mid-conversation keeps it', () => {
    const g = JSON.parse(buildProviderRequest({ ...base, provider: 'gemini', model: 'x' }).body).contents.length
    const c = JSON.parse(buildProviderRequest({ ...base, provider: 'claude', model: 'x' }).body).messages.length
    expect(g).toBe(5)
    expect(c).toBe(5)
  })
  it('a mangled history is repaired, not sent as is', () => {
    const body = JSON.parse(
      buildProviderRequest({
        ...base,
        provider: 'claude',
        model: 'x',
        history: [
          { role: 'assistant', text: 'stray' },
          { role: 'user', text: 'a' },
          { role: 'user', text: 'b' },
        ],
      }).body,
    )
    expect(body.messages).toEqual([{ role: 'user', content: 'NOW' }])
  })
  it('the mentor prompt asks for a closing Decision line and talks about cell numbers', () => {
    const p = buildTutorSystemPrompt()
    expect(p).toContain('"Decision: <one short sentence')
    expect(p).toContain('refer to cells by their number')
  })
})

describe('output limit detection', () => {
  const cut = (provider: 'gemini' | 'openai' | 'claude', body: unknown) =>
    parseProviderReply(provider, 200, JSON.stringify(body))

  it('flags Gemini MAX_TOKENS with a notice', () => {
    const o = cut('gemini', { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }] })
    expect(o.ok && o.truncated && o.text.startsWith('partial') && o.text.includes('output limit')).toBe(true)
  })
  it('flags OpenAI finish_reason length', () => {
    const o = cut('openai', { choices: [{ finish_reason: 'length', message: { content: 'partial' } }] })
    expect(o.ok && o.truncated && o.text.includes('output limit')).toBe(true)
  })
  it('flags Claude stop_reason max_tokens', () => {
    const o = cut('claude', { stop_reason: 'max_tokens', content: [{ type: 'text', text: 'partial' }] })
    expect(o.ok && o.truncated && o.text.includes('output limit')).toBe(true)
  })
  it('leaves a normal STOP reply untouched', () => {
    const o = cut('gemini', { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'done' }] } }] })
    expect(o).toEqual({ ok: true, text: 'done', truncated: false })
  })
  it('explains an empty reply cut by the limit', () => {
    const o = cut('gemini', { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] })
    expect(!o.ok && o.kind === 'empty' && o.message.includes('output limit')).toBe(true)
  })
  it('keeps a missing finishReason as a normal reply', () => {
    const o = cut('gemini', { candidates: [{ content: { parts: [{ text: 'hi' }] } }] })
    expect(o).toEqual({ ok: true, text: 'hi', truncated: false })
  })
})
