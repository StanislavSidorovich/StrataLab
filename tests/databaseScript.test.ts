// A course script as SSMS or PowerDesigner saves it: CRLF line ends, CREATE DATABASE / USE, SET IDENTITY_INSERT
// around INSERT [dbo].[T] lines. Made up for this test. It goes through the real translator and runs in DuckDB-WASM
// the way the T-SQL tab runs it into a dataset.
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { SQLGLOT_VERSION, type TranslatedStatement } from '../src/dialects/tsql'
import { foldKeys, runOrder } from '../src/core/pdScript'
import { qualifyDrops, qualifyReferences, suggestDatasetName } from '../src/core/scriptDataset'
import { decodeSqlText } from '../src/core/sqlText'
import { identitySyncSql } from '../src/core/identitySync'

const require = createRequire(import.meta.url)
let py: PyodideInterface
let duck: { query: (sql: string) => { numRows: number; toArray: () => { toJSON: () => Record<string, unknown> }[] } }

function translate(script: string): (TranslatedStatement & { database?: string })[] {
  py.globals.set('_script', script)
  return foldKeys(JSON.parse(py.runPython('import json\njson.dumps(translate(_script))')))
}
const rows = (sql: string) => duck.query(sql).toArray().map((r) => r.toJSON())

beforeAll(async () => {
  py = await loadPyodide()
  py.unpackArchive(new Uint8Array(readFileSync(`public/sqlglot/sqlglot-${SQLGLOT_VERSION}-py3-none-any.whl`)), 'wheel')
  py.runPython(readFileSync('src/dialects/translate.py', 'utf8'))
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
  const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
  const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
  await db.instantiate()
  duck = db.connect()
}, 60_000)

const SCRIPT = [
  '/* DBMS name: Microsoft SQL Server 2008 */',
  'create database music_festivals',
  'go',
  '',
  'use music_festivals',
  'go',
  "if exists (select 1 from sysobjects where id = object_id('SHOWS') and type = 'U')",
  '   drop table SHOWS',
  'go',
  "if exists (select 1 from sysobjects where id = object_id('ARTISTS') and type = 'U')",
  '   drop table ARTISTS',
  'go',
  '',
  'create table ARTISTS (IDARTIST numeric identity, NAME varchar(50) not null, constraint PK_ARTISTS primary key (IDARTIST))',
  'go',
  'create table SHOWS (IDSHOW numeric identity, IDARTIST numeric not null, constraint PK_SHOWS primary key (IDSHOW))',
  'go',
  'alter table SHOWS add constraint FK_SHOWS foreign key (IDARTIST) references ARTISTS (IDARTIST)',
  'go',
  'SET IDENTITY_INSERT [dbo].[ARTISTS] ON ',
  '',
  "INSERT [dbo].[ARTISTS] ([IDARTIST], [NAME]) VALUES (CAST(1 AS Numeric(18, 0)), N'Capitão Fausto')",
  "INSERT [dbo].[ARTISTS] ([IDARTIST], [NAME]) VALUES (CAST(7 AS Numeric(18, 0)), N'Luísa Sobral')",
  'SET IDENTITY_INSERT [dbo].[ARTISTS] OFF',
  'GO',
  'SET IDENTITY_INSERT [dbo].[SHOWS] ON',
  'INSERT [dbo].[SHOWS] ([IDSHOW], [IDARTIST]) VALUES (CAST(3 AS Numeric(18, 0)), CAST(7 AS Numeric(18, 0)))',
  'SET IDENTITY_INSERT [dbo].[SHOWS] OFF',
  'GO',
].join('\r\n')

describe('CREATE DATABASE, USE and SET IDENTITY_INSERT', () => {
  it('splits a CRLF script at GO and leaves out what Lab has no use for', () => {
    const st = translate(SCRIPT)
    expect(st.filter((s) => s.error)).toEqual([])
    expect(st.length).toBeGreaterThan(6)
    const db = st.filter((s) => s.database)
    expect(db.map((s) => [s.database, s.target])).toEqual([['music_festivals', ''], ['music_festivals', '']])
    expect(db[0].notes[0]).toContain('Lab has one database')
    const run = runOrder(st)
    expect(run.some((s) => /database|^use\b/i.test(s))).toBe(false)
    expect(run.some((s) => /identity_insert|\[dbo\]/i.test(s))).toBe(false)
  })

  it('fills the tables of the dataset, keeping the ids of the data', () => {
    const into = 'music_festivals'
    duck.query(`CREATE SCHEMA ${into}`)
    duck.query(`SET search_path = '${into}'`)
    for (const s of runOrder(translate(SCRIPT))) duck.query(qualifyReferences(qualifyDrops(s, into), into))
    expect(rows(`select cast(idartist as int) as id, name as nm from ${into}.artists order by 1`)).toEqual([
      { id: 1, nm: 'Capitão Fausto' },
      { id: 7, nm: 'Luísa Sobral' },
    ])
    expect(rows(`select cast(count(*) as int) n from ${into}.shows`)).toEqual([{ n: 1 }])
    expect(rows(`select cast(count(*) as int) n from information_schema.tables where table_schema = 'main' and table_name in ('artists','shows')`)).toEqual([{ n: 0 }])
    // A second run of the same script does not double anything.
    for (const s of runOrder(translate(SCRIPT))) duck.query(qualifyReferences(qualifyDrops(s, into), into))
    expect(rows(`select cast(count(*) as int) n from ${into}.artists`)).toEqual([{ n: 2 }])
  })

  it('reads names in brackets, quotes, spaces and any case; leaves strings and comments alone', () => {
    const one = (sql: string) => translate(sql)
    expect(one('CREATE DATABASE [Music Festivals]')[0].database).toBe('Music Festivals')
    expect(one('USE "Music"')[0].database).toBe('Music')
    expect(one('Use [master];')[0].database).toBe('master')
    expect(one('create database x on primary (name = a)\ngo\nselect 1').map((s) => s.target)).toEqual(['', 'SELECT 1'])
    // a statement after USE with no GO between them
    const both = one('use x\nselect 1 as a')
    expect(both.map((s) => s.target)).toEqual(['SELECT 1 AS a'])
    expect(both[0].database).toBe('x')
    expect(one("select 'use x' as t")[0].target).toBe("SELECT 'use x' AS t")
    expect(one('-- use x\nselect 2')[0].database).toBeUndefined()
    expect(one('/* create database x */ select 2')[0].database).toBeUndefined()
  })

  it('has nothing to run for an empty script or one made only of those statements', () => {
    expect(runOrder(translate(''))).toEqual([])
    expect(runOrder(translate('-- nothing\n'))).toEqual([])
    expect(runOrder(translate('create database x\ngo\nuse x\ngo'))).toEqual([])
  })
})

describe('the database a script names suggests the dataset', () => {
  it('beats the tab title, and is made unique', () => {
    expect(suggestDatasetName('Query 1', [], [], 'music_festivals')).toBe('music_festivals')
    expect(suggestDatasetName('file.sql', [], [], 'Music Festivals')).toBe('music_festivals')
    expect(suggestDatasetName('file.sql', ['music_festivals'], [], 'music_festivals')).toBe('music_festivals_2')
    expect(suggestDatasetName('file.sql', [], [], '  ')).toBe('file')
  })
})

describe('reading a .sql file', () => {
  const bytes = (...b: number[]) => new Uint8Array(b)
  it('reads UTF-8 (with a BOM too), UTF-16 and Windows-1252', () => {
    expect(decodeSqlText(new TextEncoder().encode('N\'Não\'')).text).toBe("N'Não'")
    expect(decodeSqlText(bytes(0xef, 0xbb, 0xbf, 0x61, 0xc3, 0xa3))).toEqual({ text: 'aã', encoding: 'utf-8' })
    expect(decodeSqlText(bytes(0xff, 0xfe, 0x61, 0x00, 0xe3, 0x00))).toEqual({ text: 'aã', encoding: 'utf-16le' })
    expect(decodeSqlText(bytes(0x43, 0x61, 0x70, 0x69, 0x74, 0xe3, 0x6f, 0x20, 0x80))).toEqual({ text: 'Capitão €', encoding: 'windows-1252' })
    expect(decodeSqlText(bytes())).toEqual({ text: '', encoding: 'utf-8' })
  })
})

describe('IDENTITY sequences after the data is loaded', () => {
  const runAll = (st: TranslatedStatement[], into: string) => {
    for (const s of runOrder(st)) duck.query(qualifyReferences(qualifyDrops(s, into), into))
    for (const s of identitySyncSql(st)) duck.query(s)
  }
  const next = (table: string, col: string) => rows(`insert into ${table} (name) values ('next') returning cast(${col} as int) as id`)[0].id

  it('moves each sequence past the highest id, so an INSERT without an id does not collide', () => {
    duck.query('CREATE SCHEMA sync1')
    duck.query("SET search_path = 'sync1'")
    const st = translate(SCRIPT)
    expect(identitySyncSql(st)).toHaveLength(2)
    runAll(st, 'sync1')
    expect(next('sync1.ARTISTS', 'IDARTIST')).toBe(8)
    // Run again: the table is dropped and refilled, and the sequence is back where the ids put it.
    runAll(st, 'sync1')
    expect(next('sync1.ARTISTS', 'IDARTIST')).toBe(8)
    // Syncing again, with nothing new, moves nothing.
    expect(rows(identitySyncSql(st)[0])).toEqual([{ moved: 0n }])
    expect(next('sync1.ARTISTS', 'IDARTIST')).toBe(9)
  })

  it('leaves no gap after ids the sequence gave itself, and starts at 1 for an empty table', () => {
    duck.query('CREATE SCHEMA sync2')
    duck.query("SET search_path = 'sync2'")
    const st = translate(`create table T (id numeric identity, name varchar(20))
go
insert into T (name) values ('a')
insert into T (name) values ('b')
go
create table E (id numeric identity, name varchar(20))
go`)
    runAll(st, 'sync2')
    expect(next('sync2.T', 'id')).toBe(3)
    expect(next('sync2.E', 'id')).toBe(1)
  })

  it('does not touch an IDENTITY with its own start or step, nor a column that has none', () => {
    expect(identitySyncSql(translate('create table T (id int identity(10, 5), name varchar(20))'))).toEqual([])
    expect(identitySyncSql(translate('create table T (id int, name varchar(20))'))).toEqual([])
    expect(identitySyncSql(translate('select 1'))).toEqual([])
  })

  it('leaves a very high id alone', () => {
    duck.query('CREATE SCHEMA sync3')
    duck.query("SET search_path = 'sync3'")
    const st = translate(`create table T (id numeric identity, name varchar(20))
go
SET IDENTITY_INSERT T ON
insert into T (id, name) values (5000000, 'a')
SET IDENTITY_INSERT T OFF
go`)
    runAll(st, 'sync3')
    expect(next('sync3.T', 'id')).toBe(1)
  })
})
