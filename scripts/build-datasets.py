"""
Builds the dataset catalog (stage 3): downloads each sample database from its source,
loads it into DuckDB with its keys, and writes

  public/datasets/<id>/<table>.parquet   the rows (zstd), served with the site
  src/data/datasets.json                 per dataset: CREATE TABLE statements (schema-qualified,
                                         in load order) and every table's row count and file size

The app creates the tables from the statements and fills them with INSERT … BY NAME from the
Parquet files, so the keys and constraints are the same as here.

Run:  py -3 -m pip install duckdb   then   py -3 scripts/build-datasets.py [dataset id …]
(only the named datasets are rebuilt; the others keep their files and manifest entries).
Sources are cached in data-local/datasets-src (git-ignored).

AdventureWorksLT ships only as a SQL Server backup, so its first build needs a SQL Server to
restore it into (any edition, 2022 or later): `sqlcmd` on PATH talks to it. Set
STRATALAB_SQLCMD to the command that reaches it (default `sqlcmd -C -S localhost -E`) and,
when the server sees the files under another path (Docker), AWLT_BAK to the backup's path
there. The rows are then cached as JSON and later builds need no server. With Docker:

  docker run -d --name mssql -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=<password> \
    -v <repo>/data-local/datasets-src:/src mcr.microsoft.com/mssql/server:2022-latest
  STRATALAB_SQLCMD="docker exec mssql /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P <password>" \
    AWLT_BAK=/src/AdventureWorksLT2022.bak python3 scripts/build-datasets.py
"""
import json
import os
import re
import shlex
import sqlite3
import subprocess
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
    'AdventureWorksLT2022.bak': 'https://github.com/microsoft/sql-server-samples/releases/download/adventureworks/AdventureWorksLT2022.bak',
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


# ------------------------------------------------------------------ AdventureWorksLT (SQL Server backup)

# The SalesLT schema of AdventureWorksLT2022, table by table in load order, as SQL Server has it:
# same names, keys (AK_… are UNIQUE), CHECKs and constant defaults. money → DECIMAL(19,4) (prices
# have 3–4 decimals), datetime → DATE where the source never has a time of day (checked below),
# TIMESTAMP otherwise; uniqueidentifier → UUID; the computed columns (LineTotal, SalesOrderNumber,
# TotalDue) are kept as stored values; ThumbNailPhoto (varbinary) is left out; ON DELETE CASCADE
# of SalesOrderDetail → SalesOrderHeader is left out (DuckDB keys only block).
AW = 'adventureworks'
AW_ROWGUID = '"rowguid" UUID NOT NULL DEFAULT uuid() UNIQUE'
# now() is in DuckDB-WASM's core; localtimestamp and current_date make it download ICU first.
AW_MODIFIED = '"ModifiedDate" TIMESTAMP NOT NULL DEFAULT CAST(now() AS TIMESTAMP)'
AW_DDL = [
    ('Address', f'''"AddressID" INTEGER NOT NULL PRIMARY KEY,
  "AddressLine1" VARCHAR NOT NULL,
  "AddressLine2" VARCHAR,
  "City" VARCHAR NOT NULL,
  "StateProvince" VARCHAR NOT NULL,
  "CountryRegion" VARCHAR NOT NULL,
  "PostalCode" VARCHAR NOT NULL,
  {AW_ROWGUID},
  {AW_MODIFIED}'''),
    ('Customer', f'''"CustomerID" INTEGER NOT NULL PRIMARY KEY,
  "NameStyle" BOOLEAN NOT NULL DEFAULT false,
  "Title" VARCHAR,
  "FirstName" VARCHAR NOT NULL,
  "MiddleName" VARCHAR,
  "LastName" VARCHAR NOT NULL,
  "Suffix" VARCHAR,
  "CompanyName" VARCHAR,
  "SalesPerson" VARCHAR,
  "EmailAddress" VARCHAR,
  "Phone" VARCHAR,
  "PasswordHash" VARCHAR NOT NULL,
  "PasswordSalt" VARCHAR NOT NULL,
  {AW_ROWGUID},
  {AW_MODIFIED}'''),
    ('CustomerAddress', f'''"CustomerID" INTEGER NOT NULL REFERENCES {AW}."Customer" ("CustomerID"),
  "AddressID" INTEGER NOT NULL REFERENCES {AW}."Address" ("AddressID"),
  "AddressType" VARCHAR NOT NULL,
  {AW_ROWGUID},
  {AW_MODIFIED},
  PRIMARY KEY ("CustomerID", "AddressID")'''),
    ('ProductCategory', f'''"ProductCategoryID" INTEGER NOT NULL PRIMARY KEY,
  "ParentProductCategoryID" INTEGER REFERENCES {AW}."ProductCategory" ("ProductCategoryID"),
  "Name" VARCHAR NOT NULL UNIQUE,
  {AW_ROWGUID},
  {AW_MODIFIED}'''),
    ('ProductModel', f'''"ProductModelID" INTEGER NOT NULL PRIMARY KEY,
  "Name" VARCHAR NOT NULL UNIQUE,
  "CatalogDescription" VARCHAR,
  {AW_ROWGUID},
  {AW_MODIFIED}'''),
    ('ProductDescription', f'''"ProductDescriptionID" INTEGER NOT NULL PRIMARY KEY,
  "Description" VARCHAR NOT NULL,
  {AW_ROWGUID},
  {AW_MODIFIED}'''),
    ('ProductModelProductDescription', f'''"ProductModelID" INTEGER NOT NULL REFERENCES {AW}."ProductModel" ("ProductModelID"),
  "ProductDescriptionID" INTEGER NOT NULL REFERENCES {AW}."ProductDescription" ("ProductDescriptionID"),
  "Culture" VARCHAR NOT NULL,
  {AW_ROWGUID},
  {AW_MODIFIED},
  PRIMARY KEY ("ProductModelID", "ProductDescriptionID", "Culture")'''),
    ('Product', f'''"ProductID" INTEGER NOT NULL PRIMARY KEY,
  "Name" VARCHAR NOT NULL UNIQUE,
  "ProductNumber" VARCHAR NOT NULL UNIQUE,
  "Color" VARCHAR,
  "StandardCost" DECIMAL(19,4) NOT NULL CHECK ("StandardCost" >= 0),
  "ListPrice" DECIMAL(19,4) NOT NULL CHECK ("ListPrice" >= 0),
  "Size" VARCHAR,
  "Weight" DECIMAL(8,2) CHECK ("Weight" > 0),
  "ProductCategoryID" INTEGER REFERENCES {AW}."ProductCategory" ("ProductCategoryID"),
  "ProductModelID" INTEGER REFERENCES {AW}."ProductModel" ("ProductModelID"),
  "SellStartDate" DATE NOT NULL,
  "SellEndDate" DATE,
  "DiscontinuedDate" DATE,
  "ThumbnailPhotoFileName" VARCHAR,
  {AW_ROWGUID},
  {AW_MODIFIED},
  CHECK ("SellEndDate" >= "SellStartDate" OR "SellEndDate" IS NULL)'''),
    ('SalesOrderHeader', f'''"SalesOrderID" INTEGER NOT NULL PRIMARY KEY,
  "RevisionNumber" SMALLINT NOT NULL DEFAULT 0,
  "OrderDate" DATE NOT NULL DEFAULT CAST(CAST(now() AS TIMESTAMP) AS DATE),
  "DueDate" DATE NOT NULL,
  "ShipDate" DATE,
  "Status" SMALLINT NOT NULL DEFAULT 1 CHECK ("Status" >= 0 AND "Status" <= 8),
  "OnlineOrderFlag" BOOLEAN NOT NULL DEFAULT true,
  "SalesOrderNumber" VARCHAR NOT NULL UNIQUE,
  "PurchaseOrderNumber" VARCHAR,
  "AccountNumber" VARCHAR,
  "CustomerID" INTEGER NOT NULL REFERENCES {AW}."Customer" ("CustomerID"),
  "ShipToAddressID" INTEGER REFERENCES {AW}."Address" ("AddressID"),
  "BillToAddressID" INTEGER REFERENCES {AW}."Address" ("AddressID"),
  "ShipMethod" VARCHAR NOT NULL,
  "CreditCardApprovalCode" VARCHAR,
  "SubTotal" DECIMAL(19,4) NOT NULL DEFAULT 0 CHECK ("SubTotal" >= 0),
  "TaxAmt" DECIMAL(19,4) NOT NULL DEFAULT 0 CHECK ("TaxAmt" >= 0),
  "Freight" DECIMAL(19,4) NOT NULL DEFAULT 0 CHECK ("Freight" >= 0),
  "TotalDue" DECIMAL(19,4) NOT NULL,
  "Comment" VARCHAR,
  {AW_ROWGUID},
  {AW_MODIFIED},
  CHECK ("DueDate" >= "OrderDate"),
  CHECK ("ShipDate" >= "OrderDate" OR "ShipDate" IS NULL)'''),
    ('SalesOrderDetail', f'''"SalesOrderID" INTEGER NOT NULL REFERENCES {AW}."SalesOrderHeader" ("SalesOrderID"),
  "SalesOrderDetailID" INTEGER NOT NULL,
  "OrderQty" SMALLINT NOT NULL CHECK ("OrderQty" > 0),
  "ProductID" INTEGER NOT NULL REFERENCES {AW}."Product" ("ProductID"),
  "UnitPrice" DECIMAL(19,4) NOT NULL CHECK ("UnitPrice" >= 0),
  "UnitPriceDiscount" DECIMAL(19,4) NOT NULL DEFAULT 0 CHECK ("UnitPriceDiscount" >= 0),
  "LineTotal" DECIMAL(38,6) NOT NULL,
  {AW_ROWGUID},
  {AW_MODIFIED},
  PRIMARY KEY ("SalesOrderID", "SalesOrderDetailID")'''),
]

AW_SELF_REFS = {'ProductCategory': {'columns': ['ParentProductCategoryID'], 'refColumns': ['ProductCategoryID'], 'key': ['ProductCategoryID']}}


def sqlcmd(query: str, database: str | None = None) -> str:
    """Runs one query on the SQL Server of STRATALAB_SQLCMD; output as UTF-8, no headers, no width limit."""
    cmd = shlex.split(os.environ.get('STRATALAB_SQLCMD', 'sqlcmd -C -S localhost -E'))
    cmd += ['-b', '-f', 'o:65001', '-y', '0'] + (['-d', database] if database else []) + ['-Q', 'SET NOCOUNT ON; ' + query]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode:
        raise RuntimeError(f'sqlcmd failed: {r.stdout.decode("utf-8", "replace")}{r.stderr.decode("utf-8", "replace")}')
    return r.stdout.decode('utf-8')


def adventureworks_json() -> Path:
    """
    Every SalesLT table as a JSON array of text values (cached): restores the backup into the
    SQL Server once and reads each table with FOR JSON. Values go out as text (datetime as ISO
    8601, money with its 4 decimals), so nothing is rounded on the way.
    """
    folder = CACHE / 'adventureworkslt'
    if (folder / 'counts.json').exists():
        return folder
    folder.mkdir(parents=True, exist_ok=True)
    bak = os.environ.get('AWLT_BAK') or str(fetch('AdventureWorksLT2022.bak').resolve())
    db = 'StrataLab_AdventureWorksLT'
    sqlcmd(f"""IF DB_ID('{db}') IS NULL BEGIN
      DECLARE @data nvarchar(400) = CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS nvarchar(400));
      DECLARE @log nvarchar(400) = CAST(SERVERPROPERTY('InstanceDefaultLogPath') AS nvarchar(400));
      DECLARE @sql nvarchar(max) = N'RESTORE DATABASE [{db}] FROM DISK = N''{bak}'' WITH '
        + N'MOVE ''AdventureWorksLT2022_Data'' TO N''' + @data + N'{db}.mdf'', '
        + N'MOVE ''AdventureWorksLT2022_Log'' TO N''' + @log + N'{db}_log.ldf''';
      EXEC (@sql);
    END""")
    counts = {}
    for table, _ in AW_DDL:
        cols = json.loads(sqlcmd(f"SELECT name, TYPE_NAME(system_type_id) AS t FROM sys.columns WHERE object_id = OBJECT_ID('SalesLT.{table}') ORDER BY column_id FOR JSON PATH", db).replace('\n', ''))
        select = []
        for c in cols:
            name, t = c['name'], c['t']
            if t in ('varbinary', 'image'):
                continue
            style = {'datetime': ', 126', 'money': ', 2'}.get(t, '')
            select.append(f'CONVERT(nvarchar(max), [{name}]{style}) AS [{name}]')
        out = sqlcmd(f'SELECT {", ".join(select)} FROM SalesLT.[{table}] FOR JSON PATH, INCLUDE_NULL_VALUES', db)
        rows = json.loads(out.replace('\n', '') or '[]')  # FOR JSON comes in lines of 2033 characters
        counts[table] = int(sqlcmd(f'SELECT COUNT(*) FROM SalesLT.[{table}]', db).strip())
        assert len(rows) == counts[table], f'{table}: read {len(rows)} rows of {counts[table]}'
        (folder / f'{table}.json').write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
    (folder / 'counts.json').write_text(json.dumps(counts, indent=1), encoding='utf-8')
    return folder


def adventureworks(con: duckdb.DuckDBPyConnection) -> tuple[list[str], list[str], dict]:
    folder = adventureworks_json()
    counts = json.loads((folder / 'counts.json').read_text(encoding='utf-8'))
    order, ddl = [], []
    for table, body in AW_DDL:
        sql = f'CREATE TABLE {AW}.{q(table)} (\n  {body}\n)'
        con.execute(sql)
        order.append(table)
        ddl.append(sql)
        types = {r[0]: r[1] for r in con.execute(f"SELECT column_name, data_type FROM duckdb_columns() WHERE schema_name = '{AW}' AND table_name = '{table}' ORDER BY column_index").fetchall()}
        cols = list(types)
        as_text = ', '.join(f"'{c}': 'VARCHAR'" for c in cols)
        src = f"read_json('{(folder / (table + '.json')).as_posix()}', format = 'array', columns = {{{as_text}}})"
        con.execute(f'CREATE OR REPLACE TEMP TABLE aw_stage AS SELECT * FROM {src}')

        def cast(c: str) -> str:
            t = types[c]
            if t == 'DATE':
                return f'CAST(CAST({q(c)} AS TIMESTAMP) AS DATE)'
            if t == 'BOOLEAN':
                return f"{q(c)} = '1'"
            if t == 'VARCHAR':
                return f'rtrim({q(c)})' if c == 'Culture' else q(c)  # nchar(6) is padded
            return f'CAST({q(c)} AS {t})'

        insert_rows(con, f'{AW}.{q(table)}', 'SELECT ' + ', '.join(f'{cast(c)} AS {q(c)}' for c in cols) + ' FROM aw_stage', AW_SELF_REFS.get(table))
        got = con.execute(f'SELECT count(*) FROM {AW}.{q(table)}').fetchone()[0]
        assert got == counts[table], f'{table}: {got} rows, SQL Server has {counts[table]}'
        for c in cols:
            t = types[c]
            if t == 'DATE':  # a DATE column must not drop a time of day
                n = con.execute(f'SELECT count(*) FROM aw_stage WHERE CAST({q(c)} AS TIMESTAMP) <> CAST(CAST({q(c)} AS TIMESTAMP) AS DATE)').fetchone()[0]
                assert n == 0, f'{table}.{c}: {n} values have a time of day'
            if t.startswith('DECIMAL'):  # nor a DECIMAL any digits
                n = con.execute(f'SELECT count(*) FROM aw_stage WHERE CAST({q(c)} AS DECIMAL(38,10)) <> CAST(CAST({q(c)} AS {t}) AS DECIMAL(38,10))').fetchone()[0]
                assert n == 0, f'{table}.{c}: {n} values lose digits as {t}'
    return order, ddl, AW_SELF_REFS


# ------------------------------------------------------------------ build

def sakila_sqlite() -> Path:
    path = CACHE / 'sakila-original-dates.sqlite'
    if not path.exists():
        db = sqlite3.connect(path)
        db.executescript(fetch('sakila-schema.sql').read_text(encoding='utf-8'))
        # The schema's triggers set last_update to the time of the INSERT: without them the rows
        # keep their own dates (2006-02-15 …) and every build gives the same files.
        for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type = 'trigger'").fetchall():
            db.execute(f'DROP TRIGGER {q(name)}')
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
    'adventureworks': adventureworks,
}


def main(only: list[str]):
    """Builds the datasets named on the command line (all when none); the others keep their files."""
    unknown = set(only) - set(DATASETS)
    if unknown:
        raise SystemExit(f'unknown dataset {", ".join(sorted(unknown))}; known: {", ".join(DATASETS)}')
    kept = json.loads(MANIFEST.read_text(encoding='utf-8')) if only and MANIFEST.exists() else {}
    manifest = {}
    for ds, build in DATASETS.items():
        if only and ds not in only:
            if ds in kept:
                manifest[ds] = kept[ds]
            continue
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
    import sys
    main(sys.argv[1:])
