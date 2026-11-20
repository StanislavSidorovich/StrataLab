// The AI helper's message feed (v0.63.0): every kept question and reply of the tab, oldest first, the
// newest at the bottom and scrolled into view. Replies are drawn from a small Markdown tree
// (`src/core/aiMarkdown.ts`) as React elements, never as HTML.
import { useEffect, useRef, useState } from 'react'
import { Check, Copy, PlusSquare, Replace, TextCursorInput } from 'lucide-react'
import { parseAiReplyBlocks, type AiProvider } from '../core/aiProvider'
import { parseMarkdown, type AiInline, type AiMdBlock } from '../core/aiMarkdown'
import type { AiChatMessage } from '../core/aiChat'
import { AddDecisionButton } from './AiConversation'
import { getAiChat, insertAiCodeAtCursor, insertAiCodeCell, replaceAiCodeCell, useLab } from './store'
import './AiFeed.css'

const NO_MESSAGES: AiChatMessage[] = []

const PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: 'Gemini',
  claude: 'Claude',
  openai: 'OpenAI-compatible',
}

export function CopyCodeButton({ code }: { code: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'unavailable'>('idle')
  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code)
        setStatus('copied')
        setTimeout(() => setStatus('idle'), 1200)
        return
      }
    } catch {
      /* fallback notice below */
    }
    setStatus('unavailable')
    useLab.setState({ notice: 'Clipboard is unavailable in this browser. Select the code block and copy it manually.' })
    setTimeout(() => setStatus('idle'), 2400)
  }
  return (
    <button
      type="button"
      className="btn btn-ghost shrink-0"
      style={{ padding: '2px 6px', fontSize: 11.5 }}
      onClick={() => void onCopy()}
      title="Copy code"
    >
      {status === 'copied' ? <Check size={12} /> : <Copy size={12} />}
      <span>{status === 'copied' ? 'Copied' : status === 'unavailable' ? 'Copy manually' : 'Copy'}</span>
    </button>
  )
}

function renderInline(nodes: readonly AiInline[], keyBase = ''): React.ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyBase}${i}`
    if (n.t === 'text') return n.v
    if (n.t === 'code') return <code key={key} className="ai-md-code mono">{n.v}</code>
    if (n.t === 'b') return <strong key={key}>{renderInline(n.c, `${key}.`)}</strong>
    return <em key={key}>{renderInline(n.c, `${key}.`)}</em>
  })
}

function renderBlock(b: AiMdBlock, i: number) {
  if (b.t === 'p') return <p key={i} className="ai-md-p">{renderInline(b.c)}</p>
  if (b.t === 'h') return <p key={i} className="ai-md-h">{renderInline(b.c)}</p>
  const items = b.items.map((it, j) => (
    <li key={j} style={it.level ? { marginLeft: `${it.level * 14}px` } : undefined}>
      {renderInline(it.c)}
    </li>
  ))
  return b.t === 'ul' ? (
    <ul key={i} className="ai-md-list">{items}</ul>
  ) : (
    <ol key={i} className="ai-md-list ai-md-ol" start={b.start}>{items}</ol>
  )
}

/** Markdown text as elements: bold, italic, `code`, lists. Text nodes only, so the model cannot add markup. */
export function AiMarkdown({ text }: { text: string }) {
  return <div className="ai-md">{parseMarkdown(text).map(renderBlock)}</div>
}

/** A reply: its text as Markdown, its code blocks as cards with the insert buttons. */
export function AiReplyView({ text }: { text: string }) {
  return (
    <div className="ai-reply">
      {parseAiReplyBlocks(text).map((block, idx) =>
        block.kind === 'text' ? (
          <AiMarkdown key={idx} text={block.text} />
        ) : (
          <div key={idx} className="ai-code">
            <div className="ai-code-bar">
              <span className="mono mr-auto min-w-0 truncate" style={{ color: 'var(--muted)' }}>
                {block.lang || 'code'}
              </span>
              <CopyCodeButton code={block.code} />
              <button
                type="button"
                className="btn btn-ghost shrink-0"
                style={{ padding: '2px 6px', fontSize: 11.5, color: 'var(--accent)' }}
                onClick={() => insertAiCodeCell(block.code)}
                title="Insert below current cell without running it"
              >
                <PlusSquare size={12} /> Insert as new cell
              </button>
              <button
                type="button"
                className="btn btn-ghost shrink-0"
                style={{ padding: '2px 6px', fontSize: 11.5, color: 'var(--accent)' }}
                onClick={() => replaceAiCodeCell(block.code)}
                title="Replace current cell content (preserving # %% boundary; Ctrl+Z to undo)"
              >
                <Replace size={12} /> Replace current cell
              </button>
              <button
                type="button"
                className="btn btn-ghost shrink-0"
                style={{ padding: '2px 6px', fontSize: 11.5, color: 'var(--accent)' }}
                onClick={() => insertAiCodeAtCursor(block.code)}
                title="Insert code at current cursor position (Ctrl+Z to undo)"
              >
                <TextCursorInput size={12} /> Insert at cursor
              </button>
            </div>
            <pre className="mono ai-code-pre">{block.code}</pre>
          </div>
        ),
      )}
    </div>
  )
}

/** Every kept question and reply of this tab. A reply of another tab never shows here. */
export function AiFeed({ tabId }: { tabId: string }) {
  const messages = useLab((s) => s.aiChats[tabId]) ?? NO_MESSAGES
  const req = useLab((s) => s.aiRequest)
  const lastReply = useRef<HTMLDivElement | null>(null)

  // The messages of a tab live in its own localStorage key and are read once, here or in the "Sees" line.
  useEffect(() => {
    getAiChat(tabId)
  }, [tabId])

  // A new reply (or a switch of tab) brings the newest reply into view.
  useEffect(() => {
    lastReply.current?.scrollIntoView?.({ block: 'start', behavior: 'auto' })
  }, [tabId, messages.length])

  if (messages.length === 0) return null
  const lastAssistant = messages.length - 1
  const meta = req.status === 'done' && req.tabId === tabId ? req : null

  return (
    <section className="ai-feed" aria-label="Conversation in this tab" aria-live="polite">
      {messages.map((m, i) =>
        m.role === 'user' ? (
          <div key={i} className="ai-msg ai-msg-user">
            <div className="ai-msg-who">You</div>
            <div className="ai-msg-text">{m.text}</div>
          </div>
        ) : (
          <div
            key={i}
            className="ai-msg ai-msg-helper"
            ref={i === lastAssistant ? lastReply : undefined}
          >
            <div className="ai-msg-who">
              <span>Helper</span>
              {i === lastAssistant && meta && (
                <span className="truncate">
                  {PROVIDER_LABELS[meta.provider]} · <code className="mono">{meta.model}</code>
                </span>
              )}
            </div>
            <AiReplyView text={m.text} />
            <div className="flex">
              <AddDecisionButton tabId={tabId} reply={m.text} emphasis={i === lastAssistant} />
            </div>
          </div>
        ),
      )}
    </section>
  )
}
