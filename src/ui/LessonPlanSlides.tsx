// The two slides a lesson plan can hold besides questions and tasks: `s` the schema (the tables the plan uses, with keys and links)
// and `r` the results (every vote of the plan with its votes and the share who were right). Rules: src/core/lessonSchema.ts, lessonResults.ts.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { LETTERS, arrange, warmOptions, planKey, stepLabel, type LessonTable, type PlanItem } from '../core/lesson'
import { rightQuery } from '../core/lessonFill'
import { HANDS_KEY, computeResults, readHands, shortText, sourceText, type HandsStore, type ResultItem } from '../core/lessonResults'
import { linkText, schemaOf, tablesOfQueries } from '../core/lessonSchema'
import { ApiError, fillRead, roomSummary } from '../core/voteApi'
import type { FillRow } from '../core/lessonFill'
import { TEACHER_POLL_MS, type Counts } from '../core/voting'
import { SECTIONS } from '../data/sqlPractice'
import { SHOP_VOTES, VOTES, WARMUP } from '../data/lessonVotes'
import { FILL_ANSWERS } from '../data/lessonFillAnswers'
import { FILL_QUESTIONS } from '../data/lessonFill'
import { SHOP_KEYS, SHOP_TABLES } from '../data/shopTables'
import { tasksOf } from '../data/practiceBook'
import { useRoom } from './LessonRoom'

/** The lesson the screen belongs to (its room key): typed hand counts are kept under it for this browser session. */
export const ScopeContext = createContext<string | null>(null)

// ------------------------------------------------------------------ hand counts kept for the lesson

const hands = (): Storage | null => {
  try {
    return sessionStorage
  } catch {
    return null
  }
}
export const loadHands = (scope: string | null): Record<string, string[]> => {
  if (!scope) return {}
  try {
    return readHands(hands()?.getItem(HANDS_KEY) ?? null)[scope] ?? {}
  } catch {
    return {}
  }
}
export function saveHands(scope: string | null, key: string, raw: string[]): void {
  if (!scope) return
  try {
    const all: HandsStore = readHands(hands()?.getItem(HANDS_KEY) ?? null)
    all[scope] = { ...all[scope], [key]: raw }
    hands()?.setItem(HANDS_KEY, JSON.stringify(all))
  } catch {
    /* kept for this screen only */
  }
}
export const useScope = () => useContext(ScopeContext)

// ------------------------------------------------------------------ what a plan's items say

const DATA = SECTIONS.flatMap((s) => s.blocks).find((b) => b.kind === 'tables')
const ALL_TABLES = DATA?.kind === 'tables' ? DATA.tables : []
const ALL_KEYS = DATA?.kind === 'tables' ? (DATA.keys ?? []) : []

/** Every query one plan item shows: the options of warm-ups and votes, the right query of a fill question, the solution of a task. */
export function sqlsOfItem(it: PlanItem): string[] {
  const out: string[] = []
  if (it.kind === 'w' || it.kind === 'd') {
    const q = (it.kind === 'w' ? WARMUP : SHOP_VOTES)[it.n - 1]
    if (q) for (const o of warmOptions(q)) if (o.sql) out.push(o.sql)
  } else if (it.kind === 'v') {
    const q = VOTES[it.set]?.[it.n - 1]
    if (q) out.push(q.right, ...q.wrong)
  } else if (it.kind === 'f') {
    const q = FILL_QUESTIONS[it.n - 1]
    const accepted = q && FILL_ANSWERS[q.id]
    if (q && accepted) out.push(rightQuery(q.template, accepted))
  } else if (it.kind === 't') {
    const s = SECTIONS.find((x) => x.id === it.set)
    const t = s ? tasksOf(s)[it.n - 1] : undefined
    if (t) out.push(t.solution)
  }
  return out
}

/** Every query a plan's items show. */
const sqlsOf = (items: readonly PlanItem[]): string[] => items.flatMap(sqlsOfItem)

/** The tables one question's queries use (the strip under it on the projector): metadata, key = first column; the demo shop's for `d` and `f`. */
export function stripTables(it: PlanItem): { schema: 'quaera' | 'demo'; tables: (LessonTable & { key: string })[] } {
  const shop = it.kind === 'd' || it.kind === 'f'
  const all: readonly LessonTable[] = shop ? SHOP_TABLES : ALL_TABLES
  const tables = tablesOfQueries(sqlsOfItem(it), all).map((n) => all.find((t) => t.name === n)!).map((t) => ({ ...t, key: t.columns[0] }))
  return { schema: shop ? 'demo' : 'quaera', tables }
}

/** A plan with demo shop questions describes the demo shop (the phone follows the same rule by the question key: isShopKey). */
export const isShopPlan = (items: readonly PlanItem[]): boolean => items.some((it) => it.kind === 'd' || it.kind === 'f')

/** The tables of the plan, with keys and links; all of the Kaiyo tables when the plan runs no query. */
export function planSchema(items: readonly PlanItem[]) {
  if (isShopPlan(items)) return schemaOf(SHOP_TABLES.map((t) => t.name), SHOP_TABLES, SHOP_KEYS) // all four: the class sees the whole shop once
  const names = tablesOfQueries(sqlsOf(items), ALL_TABLES)
  return schemaOf(names.length ? names : ALL_TABLES.map((t) => t.name), ALL_TABLES, ALL_KEYS)
}

/** The votes of a plan as the results slide lists them: step, key, short question, the right letter. */
export function resultItems(items: readonly PlanItem[]): ResultItem[] {
  const out: ResultItem[] = []
  items.forEach((it, i) => {
    if (it.kind === 'w' || it.kind === 'd') {
      const q = (it.kind === 'w' ? WARMUP : SHOP_VOTES)[it.n - 1]
      if (q) out.push({ step: i + 1, key: planKey(it), text: shortText(q.question), right: LETTERS[q.right] })
    } else if (it.kind === 'v') {
      const q = VOTES[it.set]?.[it.n - 1]
      if (q) out.push({ step: i + 1, key: planKey(it), text: shortText(q.question), right: arrange(q, it.n - 1).find((o) => o.right)!.letter })
    } else if (it.kind === 'f') {
      const q = FILL_QUESTIONS[it.n - 1]
      if (q) out.push({ step: i + 1, key: planKey(it), text: shortText(q.question), fill: FILL_ANSWERS[q.id] })
    }
  })
  return out
}

// ------------------------------------------------------------------ s: the schema slide

interface SlideNav {
  n: number
  count: number
  go: (m: number) => void
}

function SlideBar({ crumb, nav }: { crumb: string; nav: SlideNav }) {
  return (
    <div className="lesson-bar">
      <span className="lesson-crumb">
        <b>{crumb}</b>
      </span>
      <span className="lesson-nav">
        <button className="btn" disabled={nav.n <= 1} onClick={() => nav.go(nav.n - 1)} aria-label="Previous">
          <ArrowLeft size={16} />
        </button>
        <b data-testid="lesson-position">{stepLabel(nav.n, nav.count)}</b>
        <button className="btn" disabled={nav.n >= nav.count} onClick={() => nav.go(nav.n + 1)} aria-label="Next">
          <ArrowRight size={16} />
        </button>
      </span>
    </div>
  )
}

export function SchemaSlide({ items, nav }: { items: readonly PlanItem[]; nav: SlideNav }) {
  const tables = useMemo(() => planSchema(items), [items])
  const shown = new Set(tables.map((t) => t.name))
  return (
    <>
      <SlideBar crumb="The tables" nav={nav} />
      <div className="lesson-body" data-testid="schema-slide">
        <div className="lesson-schema">
          {tables.map((t) => (
            <section key={t.name} className="lesson-fold lesson-schema-card" data-testid={`schema-${t.name}`}>
              <h3 className="mono">{t.name}</h3>
              <div className="lesson-muted">one row: {t.row}</div>
              <div className="lesson-cols">
                {t.columns.map((c) => (
                  <span key={c} className={`mono lesson-col${c === t.key ? ' key' : ''}`}>
                    {c}
                    {c === t.key ? ' · key' : ''}
                  </span>
                ))}
              </div>
              {t.links.filter((l) => shown.has(l.to)).map((l) => (
                <div key={l.from} className="mono lesson-schema-link" data-testid="schema-link">
                  {linkText(t.name, l)}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ r: the results slide

export function ResultsSlide({ items, nav, goStep }: { items: readonly PlanItem[]; nav: SlideNav; goStep: (step: number) => void }) {
  const room = useRoom()
  const scope = useScope()
  const code = room?.state.phase === 'live' ? room.state.code : null
  const [phones, setPhones] = useState<Record<string, Counts> | null>(null)
  const [missing, setMissing] = useState(false)
  const [fills, setFills] = useState<Record<string, FillRow[]> | null>(null)
  const [fillMissing, setFillMissing] = useState(false)
  const hasFill = items.some((it) => it.kind === 'f')
  const secret = room?.state.secret ?? null
  const [typed, setTyped] = useState(() => loadHands(scope))

  useEffect(() => {
    if (!code) {
      setPhones(null)
      setMissing(false)
      setFills(null)
      setFillMissing(false)
      return
    }
    let off = false
    const tick = async () => {
      try {
        const s = await roomSummary(code)
        if (off) return
        setMissing(s === null)
        setPhones(s)
      } catch {
        /* a failed poll keeps the last counts */
      }
      if (hasFill && secret) {
        try {
          const rows = await fillRead(code, secret, null)
          if (off) return
          const by: Record<string, FillRow[]> = {}
          for (const r of rows) (by[r.q_key] ??= []).push(r)
          setFills(by)
          setFillMissing(false)
        } catch (e) {
          if (!off && e instanceof ApiError && e.kind === 'not-set-up') setFillMissing(true) // 0003 has not been run
        }
      }
      if (!off) setTyped(loadHands(scope))
    }
    void tick()
    const id = setInterval(() => void tick(), TEACHER_POLL_MS)
    return () => {
      off = true
      clearInterval(id)
    }
  }, [code, scope, hasFill, secret])

  const rows = useMemo(() => computeResults(resultItems(items), phones, typed, fills), [items, phones, typed, fills])
  return (
    <>
      <SlideBar crumb="Results" nav={nav} />
      <div className="lesson-body" data-testid="results-slide">
        {rows.length === 0 ? (
          <p className="lesson-q">Nothing was voted on in this lesson.</p>
        ) : (
          <table className="lesson-results-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Question</th>
                <th>Votes</th>
                <th>Right</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="lesson-results-row" tabIndex={0} role="link" data-testid={`result-${r.key}`} onClick={() => goStep(r.step)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), goStep(r.step))} title={`Go to step ${r.step}`}>
                  <td className="mono">{r.step}</td>
                  <td>{r.text}</td>
                  <td data-testid={`result-votes-${r.key}`}>
                    {r.total > 0 ? (
                      <>
                        {r.total.toLocaleString('en-US')} <span className="lesson-muted">{sourceText(r.total, r.source)}</span>
                      </>
                    ) : (
                      <span className="lesson-muted">not counted</span>
                    )}
                  </td>
                  <td>
                    {r.rightPct === null ? (
                      <span className="lesson-muted">–</span>
                    ) : (
                      <div className="lesson-barrow lesson-resultbar">
                        <div className="lesson-bartrack">
                          <div className="lesson-barfill right" style={{ width: `${r.rightPct}%` }} />
                        </div>
                        <span className="lesson-barnum">{r.rightPct}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {hasFill && fillMissing && (
          <p className="lesson-muted" role="status" data-testid="results-fill-note">
            Run supabase/0003 to collect fill answers.
          </p>
        )}
        {missing && (
          <p className="lesson-muted" role="status" data-testid="results-note">
            Phone results need the summary update.
          </p>
        )}
      </div>
    </>
  )
}
