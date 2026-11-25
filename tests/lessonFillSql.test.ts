// supabase/0003_lesson_fill.sql run on PGlite (real Postgres) after 0001, the way the owner runs it in the Supabase SQL editor:
// casting answers, changing them, the limits, the closed question, and the teacher-only read. PGlite has no `anon` / `authenticated`
// roles, so they are made first (the grants name them).
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const sql = (f: string) => readFileSync(`supabase/${f}`, 'utf8')
const TOKEN = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('0003_lesson_fill.sql', () => {
  let db: PGlite
  let code = ''
  let secret = ''
  const one = async <T = unknown>(q: string, params: unknown[] = []) => ((await db.query<{ v: T }>(`select ${q} as v`, params)).rows[0]?.v) as T
  const cast = (key: string, token: string, answers: string[], room = code) => one<string>('public.lesson_cast_fill($1, $2, $3::uuid, $4::text[])', [room, key, token, answers])
  const read = (key: string | null = null, sec = secret) => one<{ q_key: string; answers: string[]; sample: string[]; n: number }[] | null>('public.lesson_fill_read($1, $2::uuid, $3)', [code, sec, key])
  const ask = (key: string | null) => one<string>('public.lesson_set_question($1, $2::uuid, $3, $4)', [code, secret, key, 'Step 9 of 9'])

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('create role anon; create role authenticated;')
    await db.exec(sql('0001_lesson_voting.sql'))
    await db.exec(sql('0003_lesson_fill.sql'))
    const room = await one<{ code: string; secret: string }>('public.lesson_create_room()')
    code = room.code
    secret = room.secret
  }, 60_000)

  it('is safe to run again', async () => {
    await db.exec(sql('0003_lesson_fill.sql'))
    await db.exec(sql('0003_lesson_fill.sql'))
  })

  it('keeps the table closed: RLS on, no policies, no grants', async () => {
    const t = await db.query<{ rls: boolean }>("select relrowsecurity as rls from pg_class where relname = 'lesson_fill_answers'")
    expect(t.rows[0].rls).toBe(true)
    const pol = await db.query("select 1 from pg_policies where tablename = 'lesson_fill_answers'")
    expect(pol.rows).toHaveLength(0)
    const g = await db.query("select 1 from information_schema.role_table_grants where table_name = 'lesson_fill_answers' and grantee in ('anon', 'authenticated', 'PUBLIC')")
    expect(g.rows).toHaveLength(0)
  })

  it('a question that is not open takes nothing', async () => {
    expect(await cast('f1', TOKEN(1), ['WHERE', 'GROUP BY', 'HAVING'])).toBe('closed') // the room has no question yet
    expect(await ask('f1')).toBe('ok')
    expect(await cast('f2', TOKEN(1), ['LEFT JOIN', 'c.customer_id'])).toBe('closed') // another question is on
  })

  it('takes answers, cleaned, and counts them', async () => {
    expect(await cast('f1', TOKEN(1), ['  where ', 'GROUP   BY', 'having;'])).toBe('ok')
    expect(await cast('f1', TOKEN(2), ['WHERE', 'GROUP BY', 'HAVING'])).toBe('ok')
    expect(await cast('f1', TOKEN(3), ['WHERE', 'GROUP BY', 'WHERE'])).toBe('ok')
    const rows = (await read('f1'))!
    // the first two are the same set once normalised ("having;" loses its semicolon)
    expect(rows.map((r) => [r.answers, r.n])).toEqual([
      [['where', 'group by', 'having'], 2],
      [['where', 'group by', 'where'], 1],
    ])
    expect(rows[0].sample.every((s) => !/\s{2}|^\s|\s$/.test(s))).toBe(true) // collapsed and trimmed as sent
  })

  it('a double tap and a resend of the same answers change nothing', async () => {
    const before = await one<number>("(select changes from public.lesson_fill_answers where token = $1::uuid and q_key = 'f1')", [TOKEN(3)])
    expect(await cast('f1', TOKEN(3), ['WHERE', 'GROUP BY', 'WHERE'])).toBe('ok')
    expect(await cast('f1', TOKEN(3), [' WHERE', 'GROUP BY ', 'WHERE'])).toBe('ok') // trimmed it is the same
    expect(await one<number>("(select changes from public.lesson_fill_answers where token = $1::uuid and q_key = 'f1')", [TOKEN(3)])).toBe(before)
    expect(await one<number>("(select count(*)::int from public.lesson_fill_answers where q_key = 'f1')")).toBe(3)
  })

  it('a changed mind overwrites the same row (same token), up to 20 changes', async () => {
    expect(await cast('f1', TOKEN(3), ['WHERE', 'GROUP BY', 'HAVING'])).toBe('ok')
    expect((await read('f1'))!.map((r) => r.n)).toEqual([3])
    let last = 'ok'
    for (let i = 0; i < 25 && last === 'ok'; i++) last = await cast('f1', TOKEN(4), [`word${i}`, 'GROUP BY', 'HAVING'])
    expect(last).toBe('too_many_changes')
    expect(await one<number>("(select changes from public.lesson_fill_answers where token = $1::uuid)", [TOKEN(4)])).toBe(20)
  })

  it('refuses what is not an answer: empty, too long, too many, none, null', async () => {
    expect(await cast('f1', TOKEN(5), ['', 'GROUP BY', 'HAVING'])).toBe('invalid')
    expect(await cast('f1', TOKEN(5), ['   ', 'GROUP BY', 'HAVING'])).toBe('invalid')
    expect(await cast('f1', TOKEN(5), ['x'.repeat(31)])).toBe('invalid')
    expect(await cast('f1', TOKEN(5), ['x'.repeat(30)])).toBe('ok') // exactly 30 is fine
    expect(await cast('f1', TOKEN(6), ['a', 'b', 'c', 'd'])).toBe('invalid')
    expect(await cast('f1', TOKEN(6), [])).toBe('invalid')
    expect(await one<string>("public.lesson_cast_fill($1, 'f1', $2::uuid, null)", [code, TOKEN(6)])).toBe('invalid')
    expect(await one<string>("public.lesson_cast_fill($1, 'f1', $2::uuid, array['a', null]::text[])", [code, TOKEN(6)])).toBe('invalid')
    expect(await cast('f1', TOKEN(6), ['a'], 'bad')).toBe('invalid')
    expect(await cast('f 1', TOKEN(6), ['a'])).toBe('invalid')
    expect(await cast('f1', TOKEN(6), ['a'], 'AAAAA')).toBe('unknown')
  })

  it('only the teacher, with the room’s secret, reads the counts', async () => {
    expect(await read('f1', TOKEN(99))).toBeNull()
    expect(await one('public.lesson_fill_read($1, null, null)', [code])).toBeNull()
    expect(await one('public.lesson_fill_read($1, $2::uuid, $3)', ['bad', secret, null])).toBeNull()
    expect(Array.isArray(await read('f1'))).toBe(true)
  })

  it('reads one question, or all of them; a question nobody answered is an empty list', async () => {
    expect(await read('f9')).toEqual([])
    expect(await read(null)).toSatisfy((r: unknown) => Array.isArray(r) && (r as { q_key: string }[]).every((x) => x.q_key === 'f1'))
  })

  it('stops at 300 different phones, counting votes and fill answers together', async () => {
    const room = await one<{ code: string; secret: string }>('public.lesson_create_room()')
    const r = room.code
    await db.query('update public.lesson_rooms set q_key = $2, q_open = true where code = $1', [r, 'f1'])
    await db.query("insert into public.lesson_votes (room, q_key, token, letter) select $1, 'w1', ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'A' from generate_series(1000, 1149) g", [r]) // 150 voters
    await db.query("insert into public.lesson_fill_answers (room, q_key, token, answers) select $1, 'f0', ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, array['x'] from generate_series(2000, 2148) g", [r]) // 149 more
    expect(await cast('f1', TOKEN(7001), ['a'], r)).toBe('ok') // the 300th
    expect(await cast('f1', TOKEN(7002), ['a'], r)).toBe('room_full')
    expect(await cast('f1', TOKEN(7001), ['b'], r)).toBe('ok') // a phone already in may change
    expect(await cast('f1', TOKEN(1000), ['b'], r)).toBe('ok') // so may one that voted
  })

  it('answers vanish with their room (cascade)', async () => {
    const room = await one<{ code: string }>('public.lesson_create_room()')
    await db.query('update public.lesson_rooms set q_key = $2, q_open = true where code = $1', [room.code, 'f1'])
    expect(await cast('f1', TOKEN(8001), ['a'], room.code)).toBe('ok')
    await db.query('delete from public.lesson_rooms where code = $1', [room.code])
    expect(await one<number>('(select count(*)::int from public.lesson_fill_answers where room = $1)', [room.code])).toBe(0)
  })
})
