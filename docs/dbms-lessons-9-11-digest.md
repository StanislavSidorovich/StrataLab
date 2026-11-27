# NOVA IMS DBMS, classes 9, 10 and 11: digest for Lab

Source: `D:/docs/2. study/9. abroad/NOVA/study/4. dbms/lesson 10,11/` (`Class 9.pdf` 96 slides, `Class10_without_solutions (2).pdf` 53, `Class11-without_solutions.pdf` 50+; teacher Jorge Nelson Neves, 2026/2027). Written 2026-11-26 as a brief for a design review (Opus). Nothing here is built yet. The slides were read as extracted text, not as images, so diagrams and the "Show solution" slides were not seen.

Lab's SQL practice today (`src/data/sqlPractice/`, rules in `RULES.md`): 13 sections, about 150 tasks, on the Kaiyo Trading data, in T-SQL for Fabric Warehouse, written for someone who has learnt SQL before. The course teaches from zero on other data, in SQL Server. So the question is not "copy the course" but "which course traps and exercises make Lab better for a student taking it".

## 1. What the three classes teach

| Class | Topics | Data |
|---|---|---|
| 9 | `SELECT`, aliases (`AS [..]`), `LIKE` patterns, integer division and `CAST`, `DISTINCT`, `IS NOT NULL`, `ORDER BY` (two keys, a column not shown), joins read in three steps (product, filter, projection), self join, `UNION` / `INTERSECT` / `EXCEPT`, NULL and three-valued logic (TRUE 1, FALSE 0, UNKNOWN ½: AND = min, OR = max, NOT = 1 - x). Project Pizzarias: 5 questions on 4 tables, "what is wrong with the design" (missing tables, names as keys), the same questions on the 8-table version, delete order under foreign keys | The Lisbon Reel (Movies 8, Critics 8, Ratings 14; a NULL director, two undated ratings, a critic rating a movie twice), Pizzarias simple (Person, Frequents, Eats, Serves) and full (8 tables) |
| 10 | `CROSS JOIN`, `INNER`, `LEFT`, `RIGHT`, `FULL OUTER JOIN`; anti-join as `LEFT JOIN ... WHERE key IS NULL`; conditions on the optional side go in `ON`; subqueries with `IN`, `NOT IN`, `EXISTS`, `ALL`, `ANY`; subquery or join with `DISTINCT` | Music Festivals (Festivals, Editions, Cities, Countries, Artists, Stages, Concerts), Cocktails |
| 11 | `GROUP BY` with a maximum (ties: `TOP 1` hides them, `TOP 1 WITH TIES`), Photo Sharing (generous reviewers, cautious users), `INSERT` (explicit, from a query, several rows, `DEFAULT`, no hardcoded ids, `SCOPE_IDENTITY()`), `SELECT ... INTO`, `DELETE` (with subqueries, joins, order under foreign keys, `ON DELETE` actions, `TRUNCATE` vs `DROP`), `UPDATE` (with `CASE`, subquery, `FROM`, several columns, `DATEADD`), constraints on every change, a statement is all or nothing, `NOT IN` with NULL deletes nothing. Exercises 1 to 7 with expected results; "a hacker broke in: repair the database". Class 11 ends with Advanced SQL (constraints, stored procedures, functions), not read | Music Festivals (with IDENTITY ids), Photo Sharing |

Teaching format of every class: a question from a character (Marta, Rita, Tiago), a multiple-choice guess, a hint when wrong, then the explanation.

## 2. Against Lab's practice

Checked by searching the section files for the keywords, so "covered" means the keyword appears, not that a task teaches it.

| Course topic | In Lab practice? |
|---|---|
| `SELECT`, `WHERE`, `LIKE`, `IS NULL`, `COALESCE`, `DISTINCT`, `CAST`, `ORDER BY`, `TOP` | Yes (s01 to s04) |
| `GROUP BY`, `HAVING`, aggregates, dates, `CASE` | Yes (s04 to s06, s09) |
| `INNER JOIN`, `LEFT JOIN`, anti-join with `IS NULL`, self join over the manager column | Yes (s03, s07, s08) |
| Subqueries `IN`, `NOT IN`, `EXISTS`; CTE; windows; ranking | Yes (s10 to s12) |
| `UNION`, `INTERSECT` (`EXCEPT` appears once in s09) | No |
| `RIGHT JOIN`, `FULL OUTER JOIN`, `CROSS JOIN` as a topic | No (`CROSS` only inside a window task) |
| `ALL`, `ANY` | No |
| Three-valued logic puzzles, `AND` before `OR` | No (NULL is s03; precedence has no task) |
| `INSERT`, `UPDATE`, `DELETE`, `SELECT INTO`, `TRUNCATE`, transactions, constraints, referential actions | No: the practice only reads data |
| `TOP ... WITH TIES` | No, and deliberately: RULES.md says the translator cannot run it |

## 3. What could improve Lab, by kind

**Practice, new tasks inside the existing ladder (read-only, fits the checker as is)**
- Set operations section: `UNION` against `UNION ALL`, `INTERSECT`, `EXCEPT`. Course questions to adapt: "Spielberg movies with more than 3 stars", "who eats a pizza Lucca serves but does not frequent Lucca".
- Join variants: `RIGHT JOIN` as a `LEFT JOIN` with the tables swapped, `FULL OUTER JOIN` with `IS NULL` on either side (concerts with no guest and artists never invited), `CROSS JOIN` counting 15 x 16.
- `ALL` and `ANY` ("the artist with the most people on stage").
- Traps people really write (RULES.md asks for about 10 on the page, so choose):
  - `m.DURATION / 60` gives 3 for 195 minutes (the page already prescribes `1.0 *`, but no task shows the failure).
  - `col > '2011-01-22'` silently drops the NULL rows.
  - `a AND b OR c` without parentheses, which breaks the join condition.
  - `NOT IN (subquery)` where the subquery holds a NULL returns nothing.
  - `TOP 1` hides ties: a "most popular" task with a deliberate tie.
  - "Both X and Y" needs two copies of the table or `INTERSECT`, because one row cannot hold two values.
  - An empty table in the `FROM` list empties the whole result, even with `OR`.

**Practice, a new kind of task (needs design)**
- Changing the data: `INSERT`, `UPDATE`, `DELETE`. Check cannot compare a result set, so it must compare the table afterwards (or a follow-up `SELECT`) against the expected state. Every exercise on the Class 11 slides already states its expected effect ("2 rows updated: Fogo fogo 3 to 4"), which is the check text.
- A task must start from known data, so each needs a reset of its tables (see section 4).
- The course runs on SQL Server (`IDENTITY`, `SCOPE_IDENTITY()`, `UPDATE ... FROM`, `DELETE c FROM ... JOIN`, `SELECT INTO`, `DATEADD`, `BEGIN TRANSACTION ... ROLLBACK`). Which of these Lab's T-SQL to DuckDB translation runs is not tested yet: that is the first thing to find out, and the PostgreSQL mode needs a `pg` text where it differs.
- The "hacker" exercise (repair a database from a log of the attack) is a good last task of such a section.

**Datasets**
- Candidates for the catalog: Lisbon Reel (small, with the quirks listed above), Pizzarias (simple and full), Music Festivals (script `MusicFestivals_CreateDB_AddData.sql`, also under `4. dbms/test quera/music_festivals`), Photo Sharing (`03_PhotoSharingFiles.zip`). Check licences before shipping any of them: these are the teacher's course files, not open data.
- Without a catalog entry the student runs the course script by hand. That is the case for "Run SQL script in a dataset" (below).

**Theory**
- Short notes (three sentences, RULES.md) for: reading a join as product, filter, projection; three-valued logic with the min/max/1-x rule; which rows `ON` and `WHERE` keep in an outer join; what a foreign key blocks and the delete order; an INSERT, UPDATE or DELETE statement is all or nothing.
- The guess-then-explain format of the slides is close to Lab's lesson mode (`plan=basics`, `lessonFill`); a lesson plan for the Class 9 to 11 topics may fit better than new practice sections. Not checked against the lesson-mode code.

**A feature, not content**
- "Run SQL script in this dataset" (dataset right-click): the script runs with the dataset's schema as the default; Lab keeps it, so "Reset to script" gives every exercise its starting data. Limits: DuckDB cannot link tables across schemas, and scripts that name `dbo.` or `main.` need rewriting.

## 4. Questions for the design review

1. Is the data-changing practice (INSERT, UPDATE, DELETE) in scope for Lab, which is written for revision, or is it left to the course? Its cost is high (new check, reset, dialect gaps).
2. Does the course's data go into Lab at all (licence, and Kaiyo is Lab's own story), or only the techniques on Kaiyo's tables?
3. If new content: add the set-operation, outer-join and trap tasks to the ladder first (cheap, read-only), then decide on the rest?
4. Lesson mode or practice sections for the Class 9 to 11 topics?
5. Order: T-SQL translation gaps, then "run script in dataset", then data-changing tasks?

## 5. Not read yet

Class 9 slides 30 to 96 were read from extracted text, in short. Class 11 slides 50 to the end (Advanced SQL) and the "Show solution" slides have not been read. The Class 1 to 3 PDFs, the cheat sheet and the SQL folders in `4. dbms` were not opened.

## 6. T-SQL write probe (2026-11-27)

`tests/tsqlWrite.test.ts` (45 tests) runs each construct below the way a T-SQL tab does: sqlglot translates the script, DuckDB runs the statements one at a time on one connection, the first error stops the script, the ones before it stay done. It uses small tables made in the test (customers 1:n orders, PK, FK, IDENTITY, like the demo shop) and asserts what Lab does today, so a red test means the behaviour moved and this table needs a look. It ran in Node without the ICU extension: `CAST(GETDATE() AS DATE)` failed there, which is not a finding; check it in the browser before using it in a task.

Verdicts: **runs**; **error**; **differs** (runs, but the effect is not SQL Server's).

| Construct | Result | Note |
|---|---|---|
| `INSERT` with explicit columns | runs | Columns left out take their `DEFAULT` and the next IDENTITY |
| Several rows in one `VALUES` | runs | |
| `INSERT ... SELECT` | runs | |
| `DEFAULT` keyword in `VALUES` | runs | |
| Text longer than `NVARCHAR(50)` | **differs** | Lab keeps all of it (a `VARCHAR` has no length); SQL Server: "String or binary data would be truncated" |
| `INSERT ... OUTPUT inserted.col` | error | Translated to `RETURNING inserted.col`: "Referenced table "inserted" not found" |
| `IDENTITY(1,1)` column | runs | A sequence `<table>_<column>_seq` is the column's default |
| Explicit id in an IDENTITY column | **differs** | Accepted without `SET IDENTITY_INSERT ON` (SQL Server: error). The sequence does not follow it (the sync only covers CREATE TABLEs of the same script), so later ids walk up to it and collide |
| `SCOPE_IDENTITY()` | error | "Scalar Function with name scope_identity does not exist"; the INSERT before it stays done |
| `DECLARE @id ...; SET @id = SCOPE_IDENTITY()` | error | Syntax error at `DECLARE`; no statement of the script runs |
| `@@IDENTITY`, `IDENT_CURRENT('t')` | error | `@@IDENTITY` reaches DuckDB as `$$IDENTITY` (parser error); `ident_current` does not exist |
| Way round it | runs | `SELECT currval('<table>_<column>_seq')` right after the INSERT, same connection |
| `SELECT ... INTO new_table` | runs | `CREATE TABLE ... AS SELECT`; no key, no IDENTITY, as in SQL Server. Into an existing name: error, as in SQL Server |
| `SELECT ... INTO #t` | runs | A `TEMPORARY` table |
| `UPDATE` with `CASE`, with a subquery (in `SET` or `WHERE`), several columns | runs | |
| `DATEADD(day / month, n, d)` | runs | `d + INTERVAL n DAY / MONTH` |
| `UPDATE c SET c.x = ... FROM t c JOIN u ON ...` | error | "Qualified column names in UPDATE .. SET not supported" |
| `UPDATE t SET x = ... FROM t JOIN u ON ...` | error | "Ambiguous reference to column name" |
| Way round it | runs | `UPDATE t SET x = x + u.y FROM u WHERE u.k = t.k` (DuckDB's own form: no repeat of `t`) |
| `DELETE FROM t WHERE k IN (subquery)`, `EXISTS` | runs | |
| `DELETE t FROM t JOIN u ON ...`, alias or table name | error | Syntax error at the alias or table name |
| `DELETE TOP (n) FROM t` | error | Syntax error at `TOP` |
| Way round it | runs | `DELETE FROM t USING u WHERE u.k = t.k`, or a subquery |
| `DELETE` of a parent row with children | error | `Constraint Error: Violates foreign key constraint ... still referenced`: blocks as SQL Server does, in DuckDB's words |
| `UPDATE` of a key a child points at | error | Same error; a key nobody points at changes. Moving the children first, then the key, runs |
| `ON DELETE CASCADE`, `ON DELETE SET NULL`, `ON DELETE SET DEFAULT`, `ON UPDATE CASCADE` in `CREATE TABLE` | error | "FOREIGN KEY constraints cannot use CASCADE, SET NULL or SET DEFAULT" at that CREATE TABLE; tables before it stay, the rest of the script does not run. `ON DELETE NO ACTION` written out runs |
| `TRUNCATE TABLE` (a table nobody points at) | **differs** | Runs, but does not reset the IDENTITY: the next id continues (SQL Server: back to 1) |
| `TRUNCATE TABLE` of a referenced parent | error | FK error, as in SQL Server. `DELETE` without `WHERE` keeps the IDENTITY in both |
| `NOT IN (subquery holding a NULL)` in `DELETE` | runs | Deletes nothing, as in SQL Server; with `IS NOT NULL` in the subquery it deletes the rows |
| `BEGIN TRANSACTION ... ROLLBACK`, `... COMMIT`, `BEGIN TRAN` / `ROLLBACK TRAN` | runs | Rolls back / keeps the changes; the statements run as `BEGIN`, ..., `ROLLBACK` |
| A statement fails inside `BEGIN ... COMMIT` | **differs** | The whole transaction is aborted and every later statement fails ("Current transaction is aborted (please ROLLBACK)") until a ROLLBACK is sent; Lab sends none by itself. SQL Server: COMMIT would keep the other statements |
| `BEGIN TRANSACTION` with no `COMMIT` / `ROLLBACK` | **differs** | The transaction stays open for the next Run. In a saved database Lab sends `CHECKPOINT` after every Run; that fails inside a transaction ("Cannot CHECKPOINT: ... transaction local changes") and aborts it. Shown here on the CHECKPOINT itself; in the app it would appear as an error after a successful Run (not checked in the browser) |
| Script where statement 3 of 4 fails | **differs** | 1 and 2 stay done, 4 never runs. SQL Server: an FK error ends only that statement and 4 runs |
| A statement sqlglot cannot read | error | Nothing of the script runs |
| `WHERE name = 'ana'` against 'Ana' | **differs** | Text compares case-sensitively: 0 rows touched (SQL Server's default collation: 1) |
| `credit / 2` in `SET` on an INT column | **differs** | True division, rounded on the way back into the column: `7 / 2` gives 4 (SQL Server: 3) |
| What a data-changing statement returns | **differs** | A one-cell table `Count`; SQL Server prints "(3 rows affected)" |

**What the future write section must avoid or translate**

- Write every `UPDATE ... FROM` as `UPDATE t SET x = ... FROM u WHERE u.k = t.k` and every `DELETE ... JOIN` as `DELETE FROM t USING u WHERE ...` or a subquery. A note can show the SQL Server form ("what the course writes"), but the cell the student runs takes the form that runs. The subquery forms run in both, so teach those first.
- No `SCOPE_IDENTITY()`, `@@IDENTITY`, `OUTPUT`, `DECLARE @x`, `DELETE TOP`. A task that needs the new id takes it from a subquery on the parent, or uses `currval` in a cell marked as DuckDB-only.
- Referential actions (`CASCADE`, `SET NULL`) cannot be declared in CREATE TABLE, so a task on them is a manual script (children first, then the parent) or a note. The "delete blocked by FK" lesson works as it is.
- Every task starts by dropping and recreating its copy of `demo` (or a fresh schema) and sends `ROLLBACK` first, so a transaction left open or aborted by the previous Run cannot break it. Whether Lab itself should send a ROLLBACK after a failed script, and before CHECKPOINT, is the one fix in Lab's own code this probe points at.
- Don't ask for a case-mismatched `WHERE`, `/` on integers, or an id shown after `TRUNCATE`, unless the task is the trap. Show ids from `ROW_NUMBER` or leave them out of the expected state.
- Check by comparing the table afterwards (or a follow-up `SELECT`) with the expected rows, never by the `Count` the statement returns.
- An INSERT with an explicit id into an IDENTITY table leaves the sequence behind; the reset script re-creates the table, so nothing carries over.
