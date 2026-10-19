// A sample dataset's guide: what the data is about, examples that open in a tab and run in one
// click (the same question in SQL and in pandas), and a pandas ↔ SQL cheat sheet on its tables.
// Content: src/data/guides.ts. Opened from a dataset's card in the catalog and its folder's menu.
import { useEffect, useState } from 'react'
import { BookOpen, Check, Copy, GraduationCap, NotebookText, Play, X } from 'lucide-react'
import { catalogState, openDataset, openGuide, openGuideCode, openWalkthrough, useLab } from './store'
import { datasetById, type Dataset } from '../data/datasets'
import { LEVEL_LABEL, cheatSetup, cheatSheet, guideById, guideNotebook, type Guide } from '../data/guides'
import { walkthroughById, type Walkthrough } from '../data/walkthroughs'

type View = 'about' | 'examples' | 'cheat'
type Lang = 'sql' | 'python'

// The last view and language are a per-browser convenience; storage may be unavailable.
function remembered<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* not kept */
  }
}

const codeBox = { background: 'var(--code-bg)', border: '1px solid var(--line)', fontSize: 12 } as const

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="btn btn-ghost"
      title="Copy the code"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

export function GuideDialog() {
  const id = useLab((s) => s.guide)
  useLab((s) => s.tables)
  const [view, setView] = useState<View>(() => remembered('lab.guide.view', ['about', 'examples', 'cheat'] as const, 'about'))
  const [lang, setLang] = useState<Lang>(() => remembered('lab.guide.lang', ['sql', 'python'] as const, 'sql'))
  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openGuide(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id])
  const d = id ? datasetById(id) : undefined
  const g = id ? guideById(id) : undefined
  if (!d || !g) return null
  const loaded = catalogState(d).state === 'loaded'

  const pickView = (v: View) => {
    setView(v)
    remember('lab.guide.view', v)
  }
  const pickLang = (l: Lang) => {
    setLang(l)
    remember('lab.guide.lang', l)
  }
  const views: [View, string][] = [
    ['about', 'About the data'],
    ['examples', 'Examples'],
    ['cheat', 'pandas ↔ SQL'],
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" style={{ background: 'rgba(10,14,20,0.55)' }} onMouseDown={(e) => e.target === e.currentTarget && openGuide(null)}>
      <div role="dialog" aria-label={`${d.title} guide`} className="w-full max-w-4xl max-h-full flex flex-col rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <BookOpen size={18} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">{d.title} guide</div>
            <div className="hidden sm:block" style={{ color: 'var(--muted)', fontSize: 12 }}>What the data is about, examples that run in one click, and the same steps in SQL and pandas.</div>
          </div>
          <button className="btn btn-ghost" onClick={() => openGuide(null)} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1 px-2 sm:px-3 py-1 shrink-0" style={{ borderBottom: '1px solid var(--line)', minHeight: 40 }} role="tablist">
          {views.map(([v, label]) => (
            <button key={v} role="tab" aria-selected={view === v} className="px-2 sm:px-3 py-1.5 rounded-md whitespace-nowrap" style={view === v ? { background: 'var(--panel-2)', fontWeight: 600 } : { color: 'var(--muted)' }} onClick={() => pickView(v)}>
              {label}
            </button>
          ))}
          {view !== 'about' && (
            <div className="ml-auto flex items-center rounded-md p-0.5 shrink-0" style={{ border: '1px solid var(--line)' }} role="group" aria-label="Language">
              {(['sql', 'python'] as const).map((l) => (
                <button key={l} className="px-2.5 py-1 rounded" style={lang === l ? { background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 600 } : { color: 'var(--muted)' }} aria-pressed={lang === l} onClick={() => pickLang(l)}>
                  {l === 'sql' ? 'SQL' : 'Python'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="overflow-auto min-h-0 p-3 sm:p-4">
          {view === 'about' && <About d={d} g={g} loaded={loaded} onExamples={() => pickView('examples')} />}
          {view === 'examples' && <Examples d={d} g={g} lang={lang} />}
          {view === 'cheat' && <Cheat d={d} g={g} lang={lang} />}
        </div>
      </div>
    </div>
  )
}

/** The dataset's whole analysis in Python, as a card: what it answers and the steps, one button. */
export function WalkthroughCard({ w }: { w: Walkthrough }) {
  return (
    <div className="rounded-lg p-3 flex flex-wrap items-center gap-3" style={{ border: '1px solid var(--accent)', background: 'var(--accent-soft)' }}>
      <GraduationCap size={20} className="shrink-0" style={{ color: 'var(--accent)' }} />
      <div className="flex-1 min-w-[14rem]">
        <div className="font-semibold">A whole analysis in Python, step by step</div>
        <div style={{ color: 'var(--muted)' }}>
          {w.question} Get to know the data, clean it, join, group and pivot, draw a chart, write what it shows and save the result: every cell explained in plain words.
        </div>
      </div>
      <button className="btn btn-primary shrink-0" onClick={() => void openWalkthrough(w)} title="Opens in a new Python tab without running it: run the cells one by one with Shift+Enter">
        <NotebookText size={14} /> Open the walkthrough
      </button>
    </div>
  )
}

function About({ d, g, loaded, onExamples }: { d: Dataset; g: Guide; loaded: boolean; onExamples: () => void }) {
  return (
    <div className="space-y-4">
      <p style={{ fontSize: 14, lineHeight: 1.55 }}>{g.summary}</p>
      <section>
        <h2 className="font-semibold mb-1.5">Main tables</h2>
        <ul className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--line)' }}>
          {g.tables.map((t, i) => (
            <li key={t.name} className="flex flex-col sm:flex-row sm:gap-3 px-3 py-1.5" style={i ? { borderTop: '1px solid var(--line)' } : undefined}>
              <span className="mono shrink-0 sm:w-64" style={{ fontSize: 12.5 }}>
                {t.name}
              </span>
              <span style={{ color: 'var(--muted)' }}>{t.about}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5" style={{ color: 'var(--muted)', fontSize: 12 }}>
          In SQL and in lab.table, a table's name starts with the schema: <span className="mono">{d.id}.{d.tables[0]?.name}</span>.
        </p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h2 className="font-semibold mb-1.5">How they connect</h2>
          <ul className="space-y-1">
            {g.links.map((l) => (
              <li key={l} className="mono" style={{ fontSize: 12 }}>
                {l}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="font-semibold mb-1.5">A few facts</h2>
          <ul className="space-y-1 list-disc pl-5">
            {g.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      </div>
      {walkthroughById(g.id) && <WalkthroughCard w={walkthroughById(g.id)!} />}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button className="btn btn-primary" onClick={onExamples}>
          <Play size={14} /> Examples
        </button>
        <button className="btn" onClick={() => void openDataset(d)}>
          {loaded ? 'New query' : 'Load the dataset'}
        </button>
      </div>
    </div>
  )
}

function Examples({ d, g, lang }: { d: Dataset; g: Guide; lang: Lang }) {
  const all = guideNotebook(g, d.title, lang)
  const w = walkthroughById(g.id)
  return (
    <div className="space-y-3">
      {lang === 'python' && w && <WalkthroughCard w={w} />}
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 min-w-[16rem]" style={{ color: 'var(--muted)' }}>
          {lang === 'sql' ? 'Each example opens in a new SQL tab and runs.' : 'Each example opens in a new Python tab and runs; the table comes from lab.table.'} Same questions in SQL and Python: switch above to compare.
          {catalogState(d).state !== 'loaded' && ' The dataset loads first.'}
        </p>
        <button className="btn" onClick={() => void openGuideCode(d, all, `${d.title} examples`, lang, false)} title={lang === 'python' ? 'Every example as a cell of one Python tab: run them one by one with Shift+Enter' : 'Every example in one SQL tab: select one and press Ctrl+Enter'}>
          <NotebookText size={14} /> All in one tab
        </button>
      </div>
      <ol className="space-y-2">
        {g.examples.map((e, i) => {
          const code = lang === 'sql' ? e.sql : e.python
          return (
            <li key={e.title} className="rounded-lg p-3" style={{ border: '1px solid var(--line)', background: 'var(--panel-2)' }}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">
                      {i + 1}. {e.title}
                    </span>
                    <span className="rounded px-1.5" style={{ fontSize: 11, color: 'var(--muted)', border: '1px solid var(--line)' }}>
                      {LEVEL_LABEL[e.level]}
                    </span>
                  </div>
                  <div style={{ color: 'var(--muted)' }}>{e.question}</div>
                </div>
                <CopyButton text={code} />
                <button className="btn btn-primary shrink-0" onClick={() => void openGuideCode(d, code, `${i + 1}. ${e.title}`, lang)}>
                  <Play size={14} /> Run
                </button>
              </div>
              <pre className="mono mt-2 p-2 rounded-md overflow-auto whitespace-pre" style={{ ...codeBox, maxHeight: 220 }}>
                {code.trimEnd()}
              </pre>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Cheat({ d, g, lang }: { d: Dataset; g: Guide; lang: Lang }) {
  const lines = cheatSheet(g.cheat)
  const run = (task: string, sql: string, python: string) => void openGuideCode(d, lang === 'sql' ? sql + '\n' : cheatSetup(g.cheat, python), task, lang)
  return (
    <div className="space-y-3">
      <p style={{ color: 'var(--muted)' }}>
        The same step in both languages, on this dataset. In pandas, <span className="mono">t = lab.table("{g.cheat.table}")</span> and <span className="mono">u = lab.table("{g.cheat.join.table}")</span>; Run adds those lines (and{' '}
        <span className="mono">import numpy as np</span>) and opens the {lang === 'sql' ? 'SQL' : 'Python'} side in a new tab.
      </p>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--line)' }}>
        <div className="hidden sm:grid grid-cols-[minmax(9rem,1fr)_2fr_2fr_auto] gap-3 px-3 py-1.5 font-semibold" style={{ background: 'var(--panel-2)', fontSize: 12 }}>
          <span>Step</span>
          <span>SQL</span>
          <span>pandas</span>
          <span className="w-8" />
        </div>
        {lines.map((l) => (
          <div key={l.task} className="grid sm:grid-cols-[minmax(9rem,1fr)_2fr_2fr_auto] gap-1 sm:gap-3 px-3 py-2 items-start" style={{ borderTop: '1px solid var(--line)' }}>
            <span>{l.task}</span>
            <pre className="mono p-1.5 rounded overflow-x-auto whitespace-pre-wrap break-words" style={{ ...codeBox, fontWeight: lang === 'sql' ? 600 : 400 }}>
              {l.sql}
            </pre>
            <pre className="mono p-1.5 rounded overflow-x-auto whitespace-pre-wrap break-words" style={{ ...codeBox, fontWeight: lang === 'python' ? 600 : 400 }}>
              {l.python}
            </pre>
            <button className="btn btn-ghost justify-self-start" onClick={() => run(l.task, l.sql, l.python)} title={`Run the ${lang === 'sql' ? 'SQL' : 'pandas'} side in a new tab`} aria-label={`Run: ${l.task}`}>
              <Play size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
