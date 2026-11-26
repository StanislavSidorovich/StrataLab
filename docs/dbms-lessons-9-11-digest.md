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
