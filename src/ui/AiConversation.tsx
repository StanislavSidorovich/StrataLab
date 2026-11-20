// What the AI helper remembers and what it sees (v0.62.0, feed v0.63.0): the "Sees" line with the exact request,
// the tab's "Decisions so far" note, "New conversation", and "Add to decisions" under a reply.
import { useMemo, useState } from 'react'
import { BookMarked, Check, ChevronDown, ChevronRight, Copy, Eye, MessageSquarePlus } from 'lucide-react'
import { describeSees, extractDecision, hasDecision, MAX_AI_DECISIONS_CHARS } from '../core/aiChat'
import { activeCursorPos } from './SqlEditor'
import { addAiDecision, clearAiConversation, previewAiRequest, setTabDecisions, tabDialect, useLab } from './store'
import { SQL_DIALECT_NAMES, type SqlScope } from '../core/aiSqlContext'
import './AiConversation.css'

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** The line under the input, and the exact text of the next request behind "Show exactly what is sent". */
export function AiSees({ tabId, question, includeRows }: { tabId: string; question: string; includeRows: boolean }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'yes' | 'no'>('idle')
  // The cursor lives in the editor, not in the store: refresh when the pointer comes here or the box opens.
  const [tick, setTick] = useState(0)
  const sql = useLab((s) => s.tabs.find((t) => t.id === tabId)?.sql ?? '')
  const decisions = useLab((s) => s.tabs.find((t) => t.id === tabId)?.decisions ?? '')
  const chat = useLab((s) => s.aiChats[tabId])
  const sendNotebook = useLab((s) => s.aiSendNotebook)
  const tables = useLab((s) => s.tables)
  const cellRuns = useLab((s) => s.cellRuns[tabId])
  const results = useLab((s) => s.results[tabId])
  const pgTables = useLab((s) => s.pgTables)
  const translation = useLab((s) => s.translations[tabId])
  const dialect = useLab((s) => tabDialect(s.tabs.find((t) => t.id === tabId)))
  const isSql = dialect !== 'python'

  const preview = useMemo(
    () => previewAiRequest(tabId, activeCursorPos(), open ? question : '', includeRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabId, sql, decisions, chat, sendNotebook, tables, pgTables, translation, dialect, cellRuns, results, tick, includeRows, open ? question : ''],
  )
  const built = preview.built as typeof preview.built & { scope?: SqlScope; earlierStatements?: number }
  const outcome: 'error' | 'result' | 'none' = built.lastError ? 'error' : results?.status === 'done' && results.table && results.table.numCols > 0 ? 'result' : 'none'
  const sees = describeSees({
    hasSchema: preview.hasSchema,
    sendNotebook,
    notebookCodeCells: preview.built.notebookCodeCells,
    messages: preview.messages,
    hasDecisions: preview.built.hasDecisions,
    sampleRows: includeRows,
    sql: isSql
      ? {
          dialect: SQL_DIALECT_NAMES[dialect as keyof typeof SQL_DIALECT_NAMES],
          scope: built.scope ?? 'statement',
          earlier: built.earlierStatements ?? 0,
          tables: built.referencedTables,
          outcome,
        }
      : undefined,
  })

  const copy = async () => {
    const ok = await copyText(preview.text)
    setCopied(ok ? 'yes' : 'no')
    setTimeout(() => setCopied('idle'), 1800)
  }

  return (
    <div className="ai-sees" onMouseEnter={() => setTick((n) => n + 1)}>
      <div className="ai-sees-line" role="status">
        <Eye size={12} className="shrink-0" aria-hidden />
        <span>{sees}</span>
      </div>
      <button
        type="button"
        className="ai-sees-toggle"
        aria-expanded={open}
        onClick={() => {
          setTick((n) => n + 1)
          setOpen((o) => !o)
        }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Show exactly what is sent
      </button>
      {open && (
        <div className="ai-sees-box">
          <div className="ai-sees-note">
            This is the whole request, in the order the provider reads it. Nothing is sent until you click Send. Your code goes to the
            provider you chose; it is not personal data, but do not paste anything confidential into {isSql ? 'a query' : 'a cell'}. Works without a key, too: copy
            it into any chat.
            {preview.built.truncated ? ' The context was cut to fit the size limit.' : ''}
            {!isSql && preview.built.notebookShortened > 0
              ? ` ${preview.built.notebookShortened} older cell${preview.built.notebookShortened === 1 ? ' is' : 's are'} shortened to a title line.`
              : ''}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn" style={{ padding: '3px 8px', fontSize: 11.5 }} onClick={() => void copy()}>
              {copied === 'yes' ? <Check size={12} /> : <Copy size={12} />}{' '}
              {copied === 'yes' ? 'Copied' : copied === 'no' ? 'Clipboard unavailable: select the text' : 'Copy this text'}
            </button>
            <span className="ai-sees-count">{preview.text.length.toLocaleString('en-US')} characters</span>
          </div>
          <pre className="ai-sees-pre mono" tabIndex={0} aria-label="Exact text of the request">
            {preview.text}
          </pre>
        </div>
      )}
    </div>
  )
}

/** The tab's "Decisions so far" note: written by hand or filled by "Add to decisions". */
export function AiDecisions({ tabId }: { tabId: string }) {
  const [open, setOpen] = useState(false)
  const note = useLab((s) => s.tabs.find((t) => t.id === tabId)?.decisions ?? '')
  const isPython = useLab((s) => tabDialect(s.tabs.find((t) => t.id === tabId)) === 'python')
  const lines =note.split('\n').filter((l) => l.trim()).length
  return (
    <div className="ai-decisions">
      <button type="button" className="ai-sees-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <BookMarked size={12} aria-hidden /> Decisions so far
        {lines ? ` (${lines})` : ''}
      </button>
      {open && (
        <div className="space-y-1">
          <textarea
            rows={4}
            className="field w-full"
            style={{ fontSize: 12.5, resize: 'vertical' }}
            placeholder={'One line per decision, for example:\n- dropped 12 rows with price 0: they are test orders'}
            aria-label="Decisions so far"
            value={note}
            onChange={(e) => setTabDecisions(tabId, e.target.value)}
          />
          <div className="ai-sees-note">
            Kept with this tab and sent with every question{isPython ? ', and written as the first cell of the notebook when you save it as .ipynb' : ''}.
            {note.length > MAX_AI_DECISIONS_CHARS
              ? ` Only the newest ${MAX_AI_DECISIONS_CHARS.toLocaleString('en-US')} characters are sent.`
              : ''}
          </div>
        </div>
      )}
    </div>
  )
}

/** Under a reply that ends with a `Decision:` line: one click puts that line into the note. */
export function AddDecisionButton({ tabId, reply, emphasis = true }: { tabId: string; reply: string; emphasis?: boolean }) {
  const note = useLab((s) => s.tabs.find((t) => t.id === tabId)?.decisions ?? '')
  const decision = extractDecision(reply)
  if (!decision) return null
  const added = hasDecision(note, decision)
  return (
    <button
      type="button"
      className={`btn${emphasis ? ' ai-decision-btn' : ''}`}
      style={{ padding: '3px 8px', fontSize: 11.5, alignSelf: 'flex-start' }}
      disabled={added}
      onClick={() => addAiDecision(tabId, decision)}
      title={`${decision}

Saved in "Decisions so far" and sent with every question.`}
    >
      {added ? <Check size={12} /> : <BookMarked size={12} />} {added ? 'In decisions' : 'Add to decisions'}
    </button>
  )
}

export function NewConversationButton({ tabId }: { tabId: string }) {
  const count = useLab((s) => s.aiChats[tabId]?.length ?? 0)
  if (!count) return null
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ padding: '3px 6px', fontSize: 11.5 }}
      onClick={() => clearAiConversation(tabId)}
      title="Forget the earlier messages of this tab (the decisions stay)"
    >
      <MessageSquarePlus size={12} /> New conversation
    </button>
  )
}
