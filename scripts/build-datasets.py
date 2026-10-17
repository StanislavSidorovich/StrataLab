"""
Builds the dataset catalog (stage 3): downloads each sample database from its source,
loads it into DuckDB with its keys, and writes

  public/datasets/<id>/<table>.parquet   the rows (zstd), served with the site
  src/data/datasets.json                 per dataset: CREATE TABLE statements (schema-qualified,
                                         in load order) and every table's row count and file size

The app creates the tables from the statements and fills them with INSERT … BY NAME from the
Parquet files, so the keys and constraints are the same as here.

Run:  py -3 -m pip install duckdb   then   py -3 scripts/build-datasets.py
Sources are cached in data-local/datasets-src (git-ignored).
"""
import json
import re
import sqlite3
import urllib.request
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'data-local' / 'datasets-src'
OUT = ROOT / 'public' / 'datasets'
MANIFEST = ROOT / 'src' / 'data' / 'datasets.json'

SOURCES = {
    'chinook.sqlite': 'https://raw.githubusercontent.com/lerocha/chinook-database/master/ChinookDatabase/DataSources/Chinook_Sqlite.sqlite',
    'sakila-schema.sql': 'https://raw.githubusercontent.com/jOOQ/sakila/main/sqlite-sakila-db/sqlite-sakila-schema.sql',
    'sakila-data.sql': 'https://raw.githubusercontent.com/jOOQ/sakila/main/sqlite-sakila-db/sqlite-sakila-insert-data.sql',
    'instnwnd.sql': 'https://raw.githubusercontent.com/microsoft/sql-server-samples/master/samples/databases/northwind-pubs/instnwnd.sql',
    'quaera.dataset': 'https://quaera.app/data/quaera.dataset',
}


def fetch(name: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        print('downloading', SOURCES[name])
        with urllib.request.urlopen(SOURCES[name]) as r:
            path.write_bytes(r.read())
    return path


def q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


# ------------------------------------------------------------------ loading with a key to itself

def insert_rows(con: duckdb.DuckDBPyConnection, target: str, select: str, self_ref: dict | None) -> None:
    """
    INSERT … BY NAME. DuckDB checks a foreign key against the rows already in the table, so a
    table that refers to itself (an employee's boss) is filled in rounds: rows whose parent is
    NULL or already there, until all are in. The app does the same (src/db/datasets.ts).
    """
    if not self_ref:
        con.execute(f'INSERT INTO {target} BY NAME {select}')
        return
    con.execute(f'CREATE OR REPLACE TEMP TABLE self_stage AS {select}')
    key = ' AND '.join(f't.{q(k)} = s.{q(k)}' for k in self_ref['key'])
    parent = ' AND '.join(f't.{q(r)} = s.{q(c)}' for c, r in zip(self_ref['columns'], self_ref['refColumns']))
    nulls = ' OR '.join(f's.{q(c)} IS NULL' for c in self_ref['columns'])
    while True:
        before = con.execute(f'SELECT count(*) FROM {target}').fetchone()[0]
        con.execute(f'INSERT INTO {target} BY NAME SELECT s.* FROM self_stage s WHERE NOT EXISTS (SELECT 1 FROM {target} t WHERE {key}) AND ({nulls} OR EXISTS (SELECT 1 FROM {target} t WHERE {parent}))')
        if con.execute(f'SELECT count(*) FROM {target}').fetchone()[0] == before:
            break
    left = con.execute(f'SELECT count(*) FROM self_stage').fetchone()[0] - con.execute(f'SELECT count(*) FROM {target}').fetchone()[0]
    assert left == 0, f'{target}: {left} rows point at parents that never arrive'


# ------------------------------------------------------------------ SQLite → DuckDB

def sqlite_type(declared: str, values_hint: str | None) -> str | None:
    """DuckDB type for a SQLite column; None drops the column (pictures)."""
    t = (declared or '').upper()
    if 'BLOB' in t:
        return None
    if values_hint:
        return values_hint
    m = re.match(r'(NUMERIC|DECIMAL)\s*\((\d+)\s*,\s*(\d+)\)', t)
    if m:
        return f'DECIMAL({m.group(2)},{m.group(3)})'
    if t.startswith(('NUMERIC', 'DECIMAL')):
        return 'DECIMAL(10,2)'
    if t in ('INTEGER', 'INT', 'BIGINT'):
        return 'INTEGER' if t != 'BIGINT' else 'BIGINT'
    if t in ('SMALLINT', 'TINYINT'):
        return 'SMALLINT'
    if t.startswith(('REAL', 'FLOAT', 'DOUBLE')):
        return 'DOUBLE'
    if t.startswith(('DATETIME', 'TIMESTAMP')):
        return 'TIMESTAMP'
    if t == 'DATE':
        return 'DATE'
    if t in ('BOOLEAN', 'BOOL'):
        return 'BOOLEAN'
    if t == 'YEAR':
        return 'INTEGER'
    return 'VARCHAR'


def text_hint(src: sqlite3.Connection, table: str, col: str, declared: str) -> str | None:
    """TEXT columns that only hold ISO dates (the Quaera dataset) become DATE / TIMESTAMP."""
    if (declared or '').upper() not in ('TEXT', ''):
        return None
    n, not_date, not_ts = src.execute(
        f"SELECT count({q(col)}), "
        f"sum(CASE WHEN {q(col)} NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' THEN 1 ELSE 0 END), "
        f"sum(CASE WHEN {q(col)} NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]' THEN 1 ELSE 0 END) "
        f"FROM {q(table)}"
    ).fetchone()
    if n and not not_date:
        return 'DATE'
    if n and not not_ts:
        return 'TIMESTAMP'
    return None


def load_order(tables: list[str], deps: dict[str, set[str]]) -> list[str]:
    """Referenced tables first; ties keep the source order."""
    done: list[str] = []
    left = list(tables)
    while left:
        for t in left:
            if all(d in done or d == t for d in deps.get(t, set())):
                done.append(t)
                left.remove(t)
                break
        else:
            raise RuntimeError(f'circular foreign keys among {left}; list one in skip_fks')
    return done


def from_sqlite(con: duckdb.DuckDBPyConnection, schema: str, path: Path, skip_tables=(), skip_fks=()) -> tuple[list[str], list[str], dict]:
    """Creates schema.<table> for every table of a SQLite file, with its PK and FKs, and copies the rows."""
    src = sqlite3.connect(path)
    names = [r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid")]
    names = [n for n in names if n not in skip_tables]
    ddl: dict[str, str] = {}
    cols_of: dict[str, list[tuple[str, str]]] = {}
    deps: dict[str, set[str]] = {}
    self_refs: dict[str, dict] = {}
    for t in names:
        info = src.execute(f'PRAGMA table_info({q(t)})').fetchall()  # cid, name, type, notnull, default, pk
        lines, cols, pk = [], [], []
        for _, name, declared, notnull, _default, pkpos in info:
            typ = sqlite_type(declared, text_hint(src, t, name, declared))
            if typ is None:
                continue
            cols.append((name, typ))
            lines.append(f'  {q(name)} {typ}' + (' NOT NULL' if notnull or pkpos else ''))
            if pkpos:
                pk.append((pkpos, name))
        if pk:
            lines.append('  PRIMARY KEY (' + ', '.join(q(n) for _, n in sorted(pk)) + ')')
        fks: dict[int, list] = {}
        for fk_id, seq, ref, frm, to, *_ in src.execute(f'PRAGMA foreign_key_list({q(t)})').fetchall():
            fks.setdefault(fk_id, []).append((seq, ref, frm, to))
        for parts in fks.values():
            parts.sort()
            ref = parts[0][1]
            ref = next((n for n in names if n.lower() == ref.lower()), ref)
            frm = [p[2] for p in parts]
            if (t, tuple(frm)) in skip_fks or ref not in names:
                continue
            to = [p[3] or frm[i] for i, p in enumerate(parts)]
            if ref != t:
                deps.setdefault(t, set()).add(ref)
            else:
                self_refs[t] = {'columns': frm, 'refColumns': to, 'key': [n for _, n in sorted(pk)]}
            lines.append(f'  FOREIGN KEY ({", ".join(map(q, frm))}) REFERENCES {schema}.{q(ref)} ({", ".join(map(q, to))})')
        ddl[t] = f'CREATE TABLE {schema}.{q(t)} (\n' + ',\n'.join(lines) + '\n)'
        cols_of[t] = cols
    order = load_order(names, deps)
    con.execute('INSTALL sqlite; LOAD sqlite; SET sqlite_all_varchar = true')
    for t in order:
        con.execute(ddl[t])
        select = ', '.join(f'CAST(NULLIF({q(c)}, \'\') AS {typ}) AS {q(c)}' if typ != 'VARCHAR' else q(c) for c, typ in cols_of[t])
        insert_rows(con, f'{schema}.{q(t)}', f"SELECT {select} FROM sqlite_scan('{path.as_posix()}', '{t}')", self_refs.get(t))
    return order, [ddl[t] for t in order], self_refs


# ------------------------------------------------------------------ Northwind (T-SQL script)

NORTHWIND_DDL = [
    ('Categories', '''"CategoryID" INTEGER NOT NULL PRIMARY KEY,
  "CategoryName" VARCHAR NOT NULL,
  "Description" VARCHAR'''),
    ('Customers', '''"CustomerID" VARCHAR NOT NULL PRIMARY KEY,
  "CompanyName" VARCHAR NOT NULL,
  "ContactName" VARCHAR,
  "ContactTitle" VARCHAR,
  "Address" VARCHAR,
  "City" VARCHAR,
  "Region" VARCHAR,
  "PostalCode" VARCHAR,
  "Country" VARCHAR,
  "Phone" VARCHAR,
  "Fax" VARCHAR'''),
    ('Employees', '''"EmployeeID" INTEGER NOT NULL PRIMARY KEY,
  "LastName" VARCHAR NOT NULL,
  "FirstName" VARCHAR NOT NULL,
  "Title" VARCHAR,
  "TitleOfCourtesy" VARCHAR,
  "BirthDate" DATE,
  "HireDate" DATE,
  "Address" VARCHAR,
  "City" VARCHAR,
  "Region" VARCHAR,
  "PostalCode" VARCHAR,
  "Country" VARCHAR,
  "HomePhone" VARCHAR,
  "Extension" VARCHAR,
  "Notes" VARCHAR,
  "ReportsTo" INTEGER REFERENCES northwind."Employees" ("EmployeeID"),
  "PhotoPath" VARCHAR'''),
    ('Shippers', '''"ShipperID" INTEGER NOT NULL PRIMARY KEY,
  "CompanyName" VARCHAR NOT NULL,
  "Phone" VARCHAR'''),
    ('Suppliers', '''"SupplierID" INTEGER NOT NULL PRIMARY KEY,
  "CompanyName" VARCHAR NOT NULL,
  "ContactName" VARCHAR,
  "ContactTitle" VARCHAR,
  "Address" VARCHAR,
  "City" VARCHAR,
  "Region" VARCHAR,
  "PostalCode" VARCHAR,
  "Country" VARCHAR,
  "Phone" VARCHAR,
  "Fax" VARCHAR,
  "HomePage" VARCHAR'''),
    ('Orders', '''"OrderID" INTEGER NOT NULL PRIMARY KEY,
  "CustomerID" VARCHAR REFERENCES northwind."Customers" ("CustomerID"),
  "EmployeeID" INTEGER REFERENCES northwind."Employees" ("EmployeeID"),
  "OrderDate" DATE,
  "RequiredDate" DATE,
  "ShippedDate" DATE,
  "ShipVia" INTEGER REFERENCES northwind."Shippers" ("ShipperID"),
  "Freight" DECIMAL(10,2) DEFAULT 0,
  "ShipName" VARCHAR,
  "ShipAddress" VARCHAR,
  "ShipCity" VARCHAR,
  "ShipRegion" VARCHAR,
  "ShipPostalCode" VARCHAR,
  "ShipCountry" VARCHAR'''),
    ('Products', '''"ProductID" INTEGER NOT NULL PRIMARY KEY,
  "ProductName" VARCHAR NOT NULL,
  "SupplierID" INTEGER REFERENCES northwind."Suppliers" ("SupplierID"),
  "CategoryID" INTEGER REFERENCES northwind."Categories" ("CategoryID"),
  "QuantityPerUnit" VARCHAR,
  "UnitPrice" DECIMAL(10,2) DEFAULT 0 CHECK ("UnitPrice" >= 0),
  "UnitsInStock" SMALLINT DEFAULT 0 CHECK ("UnitsInStock" >= 0),
  "UnitsOnOrder" SMALLINT DEFAULT 0 CHECK ("UnitsOnOrder" >= 0),
  "ReorderLevel" SMALLINT DEFAULT 0 CHECK ("ReorderLevel" >= 0),
  "Discontinued" BOOLEAN NOT NULL DEFAULT false'''),
    ('Order Details', '''"OrderID" INTEGER NOT NULL REFERENCES northwind."Orders" ("OrderID"),
  "ProductID" INTEGER NOT NULL REFERENCES northwind."Products" ("ProductID"),
  "UnitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK ("UnitPrice" >= 0),
  "Quantity" SMALLINT NOT NULL DEFAULT 1 CHECK ("Quantity" > 0),
  "Discount" DOUBLE NOT NULL DEFAULT 0 CHECK ("Discount" >= 0 AND "Discount" <= 1),
  PRIMARY KEY ("OrderID", "ProductID")'''),
    ('CustomerDemographics', '''"CustomerTypeID" VARCHAR NOT NULL PRIMARY KEY,
  "CustomerDesc" VARCHAR'''),
    ('CustomerCustomerDemo', '''"CustomerID" VARCHAR NOT NULL REFERENCES northwind."Customers" ("CustomerID"),
  "CustomerTypeID" VARCHAR NOT NULL REFERENCES northwind."CustomerDemographics" ("CustomerTypeID"),
  PRIMARY KEY ("CustomerID", "CustomerTypeID")'''),
    ('Region', '''"RegionID" INTEGER NOT NULL PRIMARY KEY,
  "RegionDescription" VARCHAR NOT NULL'''),
    ('Territories', '''"TerritoryID" VARCHAR NOT NULL PRIMARY KEY,
  "TerritoryDescription" VARCHAR NOT NULL,
  "RegionID" INTEGER NOT NULL REFERENCES northwind."Region" ("RegionID")'''),
    ('EmployeeTerritories', '''"EmployeeID" INTEGER NOT NULL REFERENCES northwind."Employees" ("EmployeeID"),
  "TerritoryID" VARCHAR NOT NULL REFERENCES northwind."Territories" ("TerritoryID"),
  PRIMARY KEY ("EmployeeID", "TerritoryID")'''),
]

# Columns as the script lists them for INSERTs without a column list (in table order),
# including the pictures we leave out.
NORTHWIND_SCRIPT_COLUMNS = {
    'Customers': ['CustomerID', 'CompanyName', 'ContactName', 'ContactTitle', 'Address', 'City', 'Region', 'PostalCode', 'Country', 'Phone', 'Fax'],
    'Order Details': ['OrderID', 'ProductID', 'UnitPrice', 'Quantity', 'Discount'],
    'Region': ['RegionID', 'RegionDescription'],
    'Territories': ['TerritoryID', 'TerritoryDescription', 'RegionID'],
    'EmployeeTerritories': ['EmployeeID', 'TerritoryID'],
}

TOKEN = re.compile(r"\s*(?:(N?'(?:[^']|'')*')|(0x[0-9A-Fa-f]*)|(NULL)|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|(,)|(\)))", re.S)


def parse_values(s: str, pos: int) -> tuple[list, int]:
    """Values of `VALUES(…)` starting after the opening bracket; returns them and the position after `)`."""
    out = []
    while True:
        m = TOKEN.match(s, pos)
        if not m:
            raise ValueError(f'cannot read a value at: {s[pos:pos + 60]!r}')
        pos = m.end()
        text, hexa, null, num, comma, close = m.groups()
        if close:
            return out, pos
        if comma:
            continue
        if text is not None:
            out.append(text[text.index("'") + 1:-1].replace("''", "'"))
        elif hexa is not None or null:
            out.append(None)
        else:
            out.append(num)


NORTHWIND_SELF_REFS = {'Employees': {'columns': ['ReportsTo'], 'refColumns': ['EmployeeID'], 'key': ['EmployeeID']}}


def northwind(con: duckdb.DuckDBPyConnection) -> tuple[list[str], list[str], dict]:
    s = fetch('instnwnd.sql').read_text(encoding='utf-8')
    rows: dict[str, list[dict]] = {}
    stmt = re.compile(r'^\s*insert\s+(?:into\s+)?("[^"]+"|\[?\w+\]?)\s*(\(([^)]*)\))?\s*values\s*\(', re.I | re.M)
    for m in stmt.finditer(s):
        table = m.group(1).strip('"[]')
        cols = [c.strip().strip('"[]') for c in m.group(3).split(',')] if m.group(3) else NORTHWIND_SCRIPT_COLUMNS[table]
        values, _ = parse_values(s, m.end())
        rows.setdefault(table, []).append(dict(zip(cols, values)))

    order, ddl = [], []
    for table, body in NORTHWIND_DDL:
        sql = f'CREATE TABLE northwind.{q(table)} (\n  {body}\n)'
        con.execute(sql)
        order.append(table)
        ddl.append(sql)
        types = {r[0]: r[1] for r in con.execute(f"SELECT column_name, data_type FROM duckdb_columns() WHERE schema_name = 'northwind' AND table_name = '{table}' ORDER BY column_index").fetchall()}
        data = rows.get(table, [])
        if not data:
            continue
        cols = list(types)
        # Stage the text as it is in the script, then cast: the dates are m/d/yyyy, char(n) is padded.
        con.execute('CREATE OR REPLACE TEMP TABLE nw_stage (' + ', '.join(f'{q(c)} VARCHAR' for c in cols) + ')')
        con.executemany('INSERT INTO nw_stage VALUES (' + ', '.join('?' for _ in cols) + ')', [[r.get(c) for c in cols] for r in data])

        def cast(c: str) -> str:
            t = types[c]
            if t == 'DATE':
                return f"CAST(strptime({q(c)}, '%m/%d/%Y') AS DATE)"
            if t == 'BOOLEAN':
                return f"{q(c)} = '1'"
            if t == 'VARCHAR':
                return f'rtrim({q(c)})'
            return f'CAST({q(c)} AS {t})'

        insert_rows(con, f'northwind.{q(table)}', 'SELECT ' + ', '.join(f'{cast(c)} AS {q(c)}' for c in cols) + ' FROM nw_stage', NORTHWIND_SELF_REFS.get(table))
        # money values must not lose cents on the way into DECIMAL(10,2)
        for c in cols:
            if types[c].startswith('DECIMAL'):
                lost = con.execute(f'SELECT count(*) FROM nw_stage WHERE CAST({q(c)} AS DOUBLE) <> CAST(CAST({q(c)} AS DECIMAL(10,2)) AS DOUBLE)').fetchone()[0]
                assert lost == 0, f'{table}.{c}: {lost} values have more than 2 decimals'
    return order, ddl, NORTHWIND_SELF_REFS


# ------------------------------------------------------------------ build

def sakila_sqlite() -> Path:
    path = CACHE / 'sakila.sqlite'
    if not path.exists():
        db = sqlite3.connect(path)
        db.executescript(fetch('sakila-schema.sql').read_text(encoding='utf-8'))
        db.executescript(fetch('sakila-data.sql').read_text(encoding='utf-8'))
        db.commit()
        db.close()
    return path


def quaera_sqlite() -> Path:
    import gzip
    path = CACHE / 'quaera.sqlite'
    if not path.exists():
        path.write_bytes(gzip.decompress(fetch('quaera.dataset').read_bytes()))
    return path


DATASETS = {
    'chinook': lambda con: from_sqlite(con, 'chinook', fetch('chinook.sqlite')),
    'northwind': northwind,
    # store.manager_staff_id → staff closes a circle (staff.store_id → store): DuckDB can't add
    # a key after the table exists, so that one is left out. film_text only repeats film's text.
    'sakila': lambda con: from_sqlite(con, 'sakila', sakila_sqlite(), skip_tables=('film_text',), skip_fks={('store', ('manager_staff_id',))}),
    'quaera': lambda con: from_sqlite(con, 'quaera', quaera_sqlite()),
}


def main():
    manifest = {}
    for ds, build in DATASETS.items():
        con = duckdb.connect()
        con.execute(f'CREATE SCHEMA {ds}')
        order, ddl, self_refs = build(con)
        folder = OUT / ds
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob('*.parquet'):
            old.unlink()
        tables = []
        for t in order:
            file = re.sub(r'[^A-Za-z0-9_]+', '_', t) + '.parquet'
            con.execute(f"COPY {ds}.{q(t)} TO '{(folder / file).as_posix()}' (FORMAT parquet, COMPRESSION zstd)")
            rows = con.execute(f'SELECT count(*) FROM {ds}.{q(t)}').fetchone()[0]
            entry = {'name': t, 'file': file, 'rows': rows, 'bytes': (folder / file).stat().st_size}
            if t in self_refs:
                entry['selfRef'] = self_refs[t]
            tables.append(entry)
        manifest[ds] = {'ddl': ddl, 'tables': tables}
        total = sum(t['bytes'] for t in tables)
        print(f"{ds}: {len(tables)} tables, {sum(t['rows'] for t in tables):,} rows, {total / 1024:,.0f} kB")
    MANIFEST.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
