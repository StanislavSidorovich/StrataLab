import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  AI_API_KEY_STORAGE,
  AI_CONSENT_KEY,
  AI_KEY_HELP,
  AI_QUICK_ACTIONS,
  AI_SETTINGS_KEY,
  DEFAULT_AI_MODELS,
  MAX_AI_REPLY_CHARS,
  buildProviderRequest,
  buildTutorSystemPrompt,
  classifyFetchError,
  insertCodeCellBelow,
  parseAiConsent,
  parseAiReplyBlocks,
  parseAiSettings,
  parseAiSpeechLang,
  parseProviderReply,
  redactSecrets,
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
    })
    expect(DEFAULT_AI_MODELS).toEqual({
      gemini: 'gemini-3.8-flash',
      claude: 'claude-sonnet-4-6',
    })
    expect(AI_KEY_HELP.gemini.url).toBe('https://aistudio.google.com/apikey')
    expect(AI_KEY_HELP.claude.url).toBe('https://console.anthropic.com')
    expect(AI_QUICK_ACTIONS.map((a) => a.id)).toEqual([
      'explain-stage',
      'why-failed',
      'suggest-next',
      'what-odd',
    ])

    expect(parseAiSettings(null)).toEqual({
      enabled: false,
      provider: 'gemini',
      models: { gemini: 'gemini-3.8-flash', claude: 'claude-sonnet-4-6' },
    })
    expect(parseAiSettings('{not json')).toEqual({
      enabled: false,
      provider: 'gemini',
      models: { gemini: 'gemini-3.8-flash', claude: 'claude-sonnet-4-6' },
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
      models: { gemini: 'gemini-3.8-flash', claude: 'claude-sonnet-4-6' },
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
      models: { gemini: 'gemini-3.8-flash', claude: 'claude-sonnet-4-6' },
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
      models: { gemini: 'gemini-2.5-pro', claude: 'claude-opus-4-6' },
    })
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
    expect(parseAiConsent(null)).toEqual({ gemini: false, claude: false })
    expect(parseAiConsent('bad')).toEqual({ gemini: false, claude: false })
    expect(parseAiConsent(JSON.stringify({ gemini: true }))).toEqual({ gemini: true, claude: false })
    expect(parseAiConsent(JSON.stringify({ gemini: 'yes', claude: true }))).toEqual({
      gemini: false,
      claude: true,
    })
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
    expect(body.generationConfig).toEqual({ maxOutputTokens: 1024, temperature: 0.3 })
  })

  it('builds Claude request with x-api-key, anthropic-version, and direct browser header', () => {
    const secret = 'sk-ant-api03-DummySecretKey1234567890'
    const req = buildProviderRequest({
      provider: 'claude',
      apiKey: secret,
      model: 'claude-sonnet-4-6',
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
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: 'sys',
      messages: [{ role: 'user', content: 'usr' }],
    })
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
    if (!r429.ok) expect(r429.kind).toBe('rate_limit')

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
})
