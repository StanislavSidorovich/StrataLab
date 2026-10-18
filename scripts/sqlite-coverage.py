"""
SQLite (Quaera) dialect: how many of the Quaera trainer's queries give the same result in Lab.

The trainer (quaera.app) runs SQL on SQLite (sql.js) over the Kaiyo Trading dataset with bare
table names. Lab runs DuckDB over the same rows (catalog dataset `quaera`, Parquet built from the
trainer's SQLite file by build-datasets.py, dates as DATE). A SQLite (Quaera) tab is translated by
sqlglot (src/dialects/translate.py, read="sqlite") and runs on DuckDB with search_path
'quaera,main'. This script runs every query both ways and compares the result sets:

  - the same number of columns and rows, values equal (numbers within 1e-9, relative);
  - rows in order only when the query ends with ORDER BY, otherwise as a multiset;
  - DuckDB's DATE / TIMESTAMP compared as the ISO text SQLite holds, DECIMAL as a number;
  - column names are not compared (the trainer's checker doesn't either), only reported.

Queries, from a checkout of the trainer (git clone https://github.com/StanislavSidorovich/Quaera):
  solution   reference solution of every SQL task, and of every computing step of a multi-step task
  predict    the query shown in a "predict the result" task
  recipe     the SQL of the recipe cards (English text)
  trap       the wrong answers the trainer recognises (what learners actually type)
  probe      SQLite habits the trainer's queries don't use yet (PROBES below): strftime, date
             modifiers, julianday, 'now', 7 / 2, LIKE, CAST, bare columns, true as 1

Run:  python3 -m pip install duckdb   then
      python3 scripts/sqlite-coverage.py [--quaera data-local/Quaera] [--db data-local/datasets-src/quaera.sqlite] [-v]
The SQLite file is the one build-datasets.py caches (or the trainer's `npm run gen:data`, gunzipped).
sqlglot is imported from the wheel Lab serves (public/sqlglot/), so this measures what runs in the
browser. Exit status 1 when a reference solution differs.
"""
import argparse
import datetime
import decimal
import glob
import json
import math
import sqlite3
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
GROUPS = ("solution", "predict", "recipe", "trap", "probe")

# SQLite habits a learner may bring from the trainer, over the same tables.
PROBES = {
    "integer division": "SELECT 7 / 2, -7 / 2, 7.0 / 2, 7 / 2.0, 7 % 3, 1 / 0",
    "integer division of sums": "SELECT p.brand, SUM(f.units) / COUNT(*) AS per_row FROM fact_sellout f JOIN dim_product p USING (product_id) GROUP BY p.brand",
    "round then divide": "SELECT ROUND(list_price) / 7 FROM dim_product ORDER BY product_id",
    "strftime month": "SELECT strftime('%Y-%m', week_start) AS ym, SUM(units) AS units FROM fact_sellout GROUP BY ym ORDER BY ym",
    "strftime codes": "SELECT DISTINCT week_start, strftime('%w %j %W %d.%m.%Y %H:%M:%S', week_start), strftime('%s', week_start), strftime('%f', week_start) FROM fact_sellout ORDER BY week_start",
    "strftime as year": "SELECT CAST(strftime('%Y', week_start) AS INTEGER) AS y, COUNT(*) AS n FROM fact_sellout GROUP BY y",
    "date modifiers": "SELECT DISTINCT week_start, date(week_start, '+6 days'), date(week_start, 'start of month'), date(week_start, '-1 month'), date(week_start, 'weekday 0'), date(week_start, 'start of year', '+1 year', '-1 day') FROM fact_sellout ORDER BY week_start",
    "datetime and time": "SELECT DISTINCT datetime(week_start, '+36 hours'), time(week_start, '+90 minutes') FROM fact_sellout",
    "julianday": "SELECT DISTINCT week_start, julianday('2026-06-30') - julianday(week_start) AS days_left FROM fact_sellout ORDER BY week_start",
    "julianday span": "SELECT customer_id, julianday(MAX(week_start)) - julianday(MIN(week_start)) AS span FROM fact_sellout GROUP BY customer_id",
    "unixepoch": "SELECT DISTINCT unixepoch(week_start), date(unixepoch(week_start), 'unixepoch') FROM fact_sellout",
    "now": "SELECT date('now') = strftime('%Y-%m-%d', 'now'), date('now') > '2026-01-01', date('now', 'start of month') <= date('now')",
    "rows in the last days": "SELECT COUNT(*) FROM fact_sellout WHERE week_start >= date('2026-06-30', '-28 days')",
    "like ignores case": "SELECT COUNT(*) FROM dim_product WHERE product_name LIKE '%AQUA%' OR brand LIKE 'nett%'",
    "like on a date": "SELECT COUNT(*) FROM fact_sellout WHERE week_start LIKE '2025-06%'",
    "between months": "SELECT COUNT(*) FROM fact_sellout WHERE week_start BETWEEN '2025-06' AND '2025-07'",
    "cast to integer": "SELECT product_id, CAST(list_price AS INTEGER), CAST(list_price * 1.5 AS INT), CAST('12.7' AS INTEGER) FROM dim_product",
    "cast to real": "SELECT CAST(units AS REAL) / 3 FROM fact_sellout WHERE sellout_id <= 5",
    "bare column with max": "SELECT division, product_name, MAX(list_price) AS top_price FROM dim_product GROUP BY division",
    "bare column with min, order by it": "SELECT brand, product_name, MIN(list_price) FROM dim_product GROUP BY brand ORDER BY product_name",
    "true is 1": "SELECT product_name, list_price > 500 AS premium, brand IN ('Aqualis', 'Nettora') AS ours FROM dim_product",
    "sum of a true": "SELECT SUM(list_price > 500) AS premium, AVG(promo_id IS NOT NULL) FROM dim_product, (SELECT promo_id FROM fact_sellout LIMIT 100)",
    "text functions on dates": "SELECT DISTINCT length(week_start), substr(week_start, -2), instr(week_start, '-'), replace(week_start, '-', '/'), upper(week_start) FROM fact_sellout",
    "scalar max and min": "SELECT sellout_id, max(units, 5), min(units, 5, promo_id) FROM fact_sellout WHERE sellout_id <= 50",
    "ifnull and iif": "SELECT ifnull(promo_id, 0), iif(units > 10, 'big', 'small') FROM fact_sellout WHERE sellout_id <= 50",
    "is as equals": "SELECT COUNT(*) FROM fact_sellout WHERE promo_id IS 5 OR promo_id IS NULL",
    "total": "SELECT total(units), total(revenue) FROM fact_sellout WHERE units < 0",
    "limit with comma": "SELECT sellout_id FROM fact_sellout ORDER BY sellout_id LIMIT 5, 3",
    "printf": "SELECT printf('%.2f', list_price), printf('%5d|%s', product_id, brand) FROM dim_product",
    "sum of reals": "SELECT p.brand, ROUND(SUM(f.revenue)) AS revenue, ROUND(AVG(f.revenue), 4) FROM fact_sellout f JOIN dim_product p USING (product_id) GROUP BY p.brand",
}


def load_translator():
    wheel = sorted(glob.glob(str(ROOT / "public" / "sqlglot" / "sqlglot-*.whl")))[-1]
    sys.path.insert(0, wheel)
    space = {"__name__": "translate"}
    exec(compile((ROOT / "src" / "dialects" / "translate.py").read_text(encoding="utf-8"), "translate.py", "exec"), space)
    import sqlglot

    return space["translate"], sqlglot


def queries(quaera: Path):
    """(id, group, sql, order matters) for every SQL query of the trainer's content."""
    pack = json.loads((quaera / "src" / "content" / "packs" / "sql-core.json").read_text(encoding="utf-8"))
    out = []
    for t in pack["tasks"]:
        if t.get("solution"):
            out.append((t["id"], "solution", t["solution"]))
        if t.get("predictSql"):
            out.append((t["id"], "predict", t["predictSql"]))
        for i, tr in enumerate(t.get("traps", [])):
            out.append((f"{t['id']} trap {i + 1}", "trap", tr["code"]))
        for k, step in enumerate(t.get("steps", [])):
            if step.get("kind") != "compute":
                continue
            out.append((f"{t['id']} step {k + 1}", "solution", step["solution"]))
            for i, tr in enumerate(step.get("traps", [])):
                out.append((f"{t['id']} step {k + 1} trap {i + 1}", "trap", tr["code"]))
    recipes = json.loads((quaera / "src" / "content" / "recipes.json").read_text(encoding="utf-8"))
    for r in recipes["recipes"]:
        sql = r.get("code", {}).get("sql", {}).get("en")
        if sql:
            out.append((r["id"], "recipe", sql))
    for name, sql in PROBES.items():
        out.append((name, "probe", sql))
    return out


def norm(v):
    """A DuckDB or SQLite value as SQLite would hand it to the trainer."""
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, datetime.datetime):
        return v.isoformat(sep=" ")
    if isinstance(v, datetime.date):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return float(v)
    return v


def same(a, b):
    if a is None or b is None:
        return a is None and b is None
    num = (int, float)
    if isinstance(a, num) and isinstance(b, num):
        return a == b or math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)
    return type(a) is type(b) and a == b


def key(row):
    return tuple(("n", round(v, 6)) if isinstance(v, (int, float)) else ("s", v) for v in row)


def compare(lite, duck, ordered):
    """None when equal, else what differs."""
    (lc, lr), (dc, dr) = lite, duck
    if len(lc) != len(dc):
        return f"{len(dc)} columns, SQLite has {len(lc)}"
    if len(lr) != len(dr):
        return f"{len(dr)} rows, SQLite has {len(lr)}"
    if not ordered:
        lr, dr = sorted(lr, key=key), sorted(dr, key=key)
    bad = next((i for i, (x, y) in enumerate(zip(lr, dr)) if not all(map(same, x, y))), None)
    return None if bad is None else f"row {bad + 1}: DuckDB {dr[bad]!r}, SQLite {lr[bad]!r}"


def tie_broken(sql, dialect, sqlglot):
    """The query with every output column added to its ORDER BY, so rows that tie keep one order."""
    tree = sqlglot.parse_one(sql, read=dialect)
    n = len(tree.expressions)
    order = tree.args["order"]
    order.set("expressions", order.expressions + [sqlglot.exp.Ordered(this=sqlglot.exp.Literal.number(i + 1)) for i in range(n)])
    return tree.sql(dialect)


def kinds(lite, duck):
    """Differences that are only in how a value is typed (bool vs 0/1, 3 vs 3.0)."""
    out = set()
    for x, y in zip(lite[1][:50], duck[1][:50]):
        for a, b in zip(x, y):
            if isinstance(b, bool) and not isinstance(a, bool):
                out.add("true/false where SQLite shows 1/0")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quaera", default=str(ROOT / "data-local" / "Quaera"))
    ap.add_argument("--db", default=str(ROOT / "data-local" / "datasets-src" / "quaera.sqlite"))
    ap.add_argument("-v", "--verbose", action="store_true", help="print the translation of every query that differs")
    ap.add_argument("--json", help="write every query's outcome to this file")
    ap.add_argument("--baseline", action="store_true", help="sqlglot alone: no fixes of translate.py, no integer_division (what the fixes are measured against)")
    args = ap.parse_args()

    translate, sqlglot = load_translator()
    lite = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    lite.execute("PRAGMA case_sensitive_like = OFF")  # as the trainer's worker
    duck = duckdb.connect()
    duck.execute("CREATE SCHEMA quaera")
    for f in sorted((ROOT / "public" / "datasets" / "quaera").glob("*.parquet")):
        duck.execute(f"CREATE TABLE quaera.{f.stem} AS SELECT * FROM read_parquet('{f.as_posix()}')")
    # As the page runs a SQLite (Quaera) tab: src/core/sqliteDialect.ts (sqliteSession).
    duck.execute("SET search_path = 'quaera,main'")
    if not args.baseline:
        duck.execute("SET integer_division = true")
    schema = {}
    for table, column, typ in duck.execute("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'quaera' ORDER BY ordinal_position").fetchall():
        schema.setdefault(table, {})[column] = typ

    results = []
    for qid, group, sql in queries(Path(args.quaera)):
        r = {"id": qid, "group": group, "sql": sql}
        try:
            cur = lite.execute(sql.strip().rstrip(";"))
            want = ([d[0] for d in cur.description], [tuple(norm(v) for v in row) for row in cur.fetchall()])
        except sqlite3.Error as e:
            r.update(outcome="sqlite error", why=str(e))
            results.append(r)
            continue
        try:
            tree = sqlglot.parse_one(sql, read="sqlite")
            ordered = tree.args.get("order") is not None
        except Exception:
            ordered = "order by" in sql.lower()
        if args.baseline:
            try:
                stmts = [{"target": t, "error": None} for t in sqlglot.transpile(sql, read="sqlite", write="duckdb")]
            except Exception as e:
                stmts = [{"target": None, "error": str(e).split("\n")[0]}]
        else:
            stmts = translate(sql, False, "sqlite", schema)
        r["duckdb"] = "; ".join(s["target"] or "" for s in stmts)
        errs = [s["error"] for s in stmts if s["error"]]
        if errs:
            r.update(outcome="not translated", why=errs[0])
            results.append(r)
            continue
        try:
            cur = duck.execute(r["duckdb"])
            raw = cur.fetchall()
            got = ([d[0] for d in cur.description], [tuple(norm(v) for v in row) for row in raw])
        except duckdb.Error as e:
            r.update(outcome="duckdb error", why=str(e).split("\n")[0])
            results.append(r)
            continue
        diff = compare(want, got, ordered)
        r.update(outcome="different" if diff else "same", why=diff or "")
        if diff and ordered:
            # Rows whose ORDER BY keys are equal come in whatever order the engine likes (and a
            # LIMIT may cut between them): with every column as a tie-breaker, do both agree?
            try:
                cur = lite.execute(tie_broken(sql.strip().rstrip(";"), "sqlite", sqlglot))
                want2 = ([d[0] for d in cur.description], [tuple(norm(v) for v in row) for row in cur.fetchall()])
                cur = duck.execute(tie_broken(r["duckdb"], "duckdb", sqlglot))
                got2 = ([d[0] for d in cur.description], [tuple(norm(v) for v in row) for row in cur.fetchall()])
                if compare(want2, got2, True) is None:
                    r.update(outcome="ties", why=f"rows that tie in ORDER BY come in another order ({diff})")
            except Exception as e:
                r["why"] += f" (tie check failed: {e})"
        extra = kinds(want, (got[0], raw))
        names = [a for a, b in zip(want[0], got[0]) if a != b]
        if extra:
            r["notes"] = sorted(extra)
        if names:
            r.setdefault("notes", []).append("column names: " + ", ".join(f"{a} → {b}" for a, b in zip(want[0], got[0]) if a != b))
        results.append(r)

    print(f"{'group':<10} {'queries':>7} {'same':>5} {'ties':>5} {'differ':>6} {'error':>5}")
    for g in GROUPS:
        rs = [r for r in results if r["group"] == g and r["outcome"] != "sqlite error"]
        n = {k: sum(r["outcome"] == k for r in rs) for k in ("same", "ties", "different")}
        print(f"{g:<10} {len(rs):>7} {n['same']:>5} {n['ties']:>5} {n['different']:>6} {len(rs) - sum(n.values()):>5}")
    print("(ties: the same rows, but rows with equal ORDER BY keys in another order, or another of them kept by LIMIT)")
    skipped = [r for r in results if r["outcome"] == "sqlite error"]
    if skipped:
        print(f"({len(skipped)} queries fail in SQLite too and are left out: {', '.join(r['id'] for r in skipped)})")
    print()
    for r in results:
        if r["outcome"] not in ("same", "sqlite error"):
            print(f"{r['id']:<22} {r['group']:<9} {r['outcome']}: {r['why'][:160]}")
            if args.verbose:
                print("   sqlite:", " ".join(r["sql"].split()))
                print("   duckdb:", " ".join(r.get("duckdb", "").split()))
    notes = [r for r in results if r["outcome"] == "same" and r.get("notes")]
    if args.verbose and notes:
        print()
        for r in notes:
            print(f"{r['id']:<22} same, but {'; '.join(r['notes'])}")
    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=1, ensure_ascii=False), encoding="utf-8")
    return 1 if any(r["group"] == "solution" and r["outcome"] not in ("same", "ties", "sqlite error") for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
