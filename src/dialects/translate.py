# T-SQL and SQLite → DuckDB (stage 4), run by Pyodide in a Web Worker (src/dialects/sqlglotWorker.ts)
# and by the tests in Node (tests/translate.test.ts). sqlglot does the translation; this file splits
# the script into statements (so each one can be shown next to its translation), fixes the few
# things sqlglot leaves as they are, and turns its warnings into notes a learner can read.
import logging
import re

import sqlglot
from sqlglot import exp
from sqlglot.errors import ErrorLevel, ParseError
from sqlglot.tokens import TokenType

GO = re.compile(r"^[ \t]*GO[ \t]*(?:\d+[ \t]*)?$", re.IGNORECASE | re.MULTILINE)


class _Notes(logging.Handler):
    def __init__(self):
        super().__init__(logging.WARNING)
        self.items = []

    def emit(self, record):
        self.items.append(record.getMessage())


_handler = _Notes()
logging.getLogger("sqlglot").addHandler(_handler)
logging.getLogger("sqlglot").propagate = False


def _statements(script, read):
    """(source text, start offset) of each statement: GO lines (T-SQL) and top-level semicolons split."""
    out = []
    pos = 0
    for m in (list(GO.finditer(script)) if read == "tsql" else []) + [None]:
        end = m.start() if m else len(script)
        batch = script[pos:end]
        try:
            tokens = sqlglot.Dialect.get_or_raise(read).tokenize(batch)
        except Exception:
            tokens = []
        start = 0
        for t in tokens:
            if t.token_type == TokenType.SEMICOLON:
                out.append((batch[start : t.start], pos + start))
                start = t.end + 1
        out.append((batch[start:], pos + start))
        pos = m.end() if m else len(script)
    return [(s, at) for s, at in out if _has_code(s)]


def _has_code(s):
    s = re.sub(r"--[^\n]*|/\*.*?\*/", "", s, flags=re.DOTALL)
    return bool(s.strip())


def _is_text(node):
    return (isinstance(node, exp.Literal) and node.is_string) or isinstance(node, exp.DPipe)


TEXT_TYPES = (exp.DataType.Type.VARCHAR, exp.DataType.Type.NVARCHAR, exp.DataType.Type.TEXT, exp.DataType.Type.NCHAR, exp.DataType.Type.CHAR)


def _text_length(dt):
    """10 for VARCHAR(10), None for VARCHAR, VARCHAR(MAX) or a type that is not text."""
    if not isinstance(dt, exp.DataType) or dt.this not in TEXT_TYPES or not dt.expressions:
        return None
    p = dt.expressions[0]
    p = p.this if isinstance(p, exp.DataTypeParam) else p
    return int(p.name) if isinstance(p, exp.Literal) and p.name.isdigit() else None


def _fix(tree, notes):
    """What sqlglot keeps as written but DuckDB reads differently."""
    # 'a' + name: T-SQL joins text with +, DuckDB only adds numbers. Deepest first, so
    # first_name + ' ' + last_name becomes first_name || ' ' || last_name.
    adds = list(tree.find_all(exp.Add))
    for node in reversed(adds):
        if _is_text(node.this) or _is_text(node.expression):
            node.replace(exp.DPipe(this=node.this, expression=node.expression, safe=True))
    # dbo.orders: the user's tables live in DuckDB's main schema.
    for t in tree.find_all(exp.Table):
        if t.args.get("db") and t.db.lower() == "dbo" and not t.args.get("catalog"):
            t.set("db", None)
    # CONVERT(varchar(10), d, 120), CAST(x AS NVARCHAR(5)): SQL Server cuts the text to that
    # length (the usual way to get 'yyyy-mm-dd'); DuckDB's VARCHAR has no length, so left(…, n).
    for node in reversed(list(tree.find_all(exp.Cast, exp.TryCast, exp.Convert))):
        dt = node.this if isinstance(node, exp.Convert) else node.args.get("to")
        n = _text_length(dt)
        if n is not None:
            dt.replace(exp.DataType.build("VARCHAR"))
            node.replace(exp.Left(this=node.copy(), expression=exp.Literal.number(n)))
    for dt in list(tree.find_all(exp.DataType)):
        # BIT is a yes/no column in SQL Server; in DuckDB it is a string of bits.
        if dt.this == exp.DataType.Type.BIT:
            dt.replace(exp.DataType.build("BOOLEAN"))
        # NVARCHAR(MAX), NVARCHAR(50): one text type in DuckDB, Unicode and without a length.
        elif dt.this in TEXT_TYPES:
            dt.replace(exp.DataType.build("VARCHAR"))
    if any(isinstance(v, exp.Parameter) or (isinstance(v, exp.Var) and v.name.startswith("@")) for v in tree.walk()) or tree.find(exp.Declare):
        notes.append("Variables (@name) have no place in a DuckDB query: write the value in, or use SET VARIABLE name = value and getvariable('name').")
    return tree


# ------------------------------------------------------------------ SQLite (Quaera)
# The Quaera trainer (quaera.app) runs on SQLite; in Lab its dataset is the `quaera` schema, with
# dates as DATE where SQLite keeps text. The page runs a SQLite tab with search_path
# 'quaera,main' and integer_division on (src/core/sqliteDialect.ts), so bare table names and
# 7 / 2 = 3 need no rewriting here. scripts/sqlite-coverage.py measures the lot on the trainer's
# own queries.

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$")
NUMBER = re.compile(r"^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$")
INT_TYPES = (exp.DataType.Type.TINYINT, exp.DataType.Type.SMALLINT, exp.DataType.Type.MEDIUMINT, exp.DataType.Type.INT, exp.DataType.Type.BIGINT)
FLOAT_TYPES = (exp.DataType.Type.FLOAT, exp.DataType.Type.DOUBLE, exp.DataType.Type.DECIMAL)
TEXT_OUT = (exp.Substring, exp.Upper, exp.Lower, exp.Trim, exp.DPipe, exp.Concat, exp.TimeToStr, exp.Replace, exp.GroupConcat)


def _texty(node, texts=frozenset()):
    """True when the expression is text in DuckDB too, so a CAST(… AS TEXT) would add nothing.
    `texts`: names of columns known to be text."""
    if isinstance(node, exp.Column):
        return node.name.lower() in texts
    if isinstance(node, exp.Literal):
        return node.is_string
    if isinstance(node, (exp.Cast, exp.TryCast)):
        return node.to.this in TEXT_TYPES
    if isinstance(node, exp.Anonymous):
        return node.name.lower() in ("strftime", "time", "printf", "format")
    return isinstance(node, TEXT_OUT)


def _as_text(node, texts=frozenset()):
    """SQLite reads any value as its text where a text function wants one (a date is text there)."""
    if node is None or _texty(node, texts) or isinstance(node, exp.Null):
        return node
    return exp.Cast(this=node.copy(), to=exp.DataType.build("VARCHAR"))


def _odd_text(node):
    """A string literal DuckDB would read as a date or a number and fail: '2025-06', 'abc'."""
    return isinstance(node, exp.Literal) and node.is_string and not ISO_DATE.match(node.name) and not NUMBER.match(node.name)


def _duck(sql, **parts):
    """A DuckDB expression from text, with __name placeholders replaced by the given trees."""
    tree = sqlglot.parse_one(sql, read="duckdb")
    for col in list(tree.find_all(exp.Column)):
        if col.name.startswith("__") and col.name[2:] in parts:
            col.replace(parts[col.name[2:]].copy())
    return tree


NOW_UTC = "CAST(NOW() AT TIME ZONE 'UTC' AS TIMESTAMP)"
UNITS = {"day": 86400, "hour": 3600, "minute": 60, "second": 1}


def _timestamp(value, modifiers, fn):
    """SQLite's time value and modifiers (date(d, '+7 days', 'start of month')) as a DuckDB TIMESTAMP."""
    mods = []
    for m in modifiers:
        if not (isinstance(m, exp.Literal) and m.is_string):
            raise ValueError(f"{fn}(): a modifier made at run time ({m.sql('sqlite')}) can't be translated; write it as text, like '+7 days', or add an INTERVAL.")
        mods.append(m.name.strip().lower())
    if mods and mods[0] == "unixepoch":
        mods = mods[1:]
        ts = _duck("MAKE_TIMESTAMP(CAST(__v * 1000000 AS BIGINT))", v=value)
    elif isinstance(value, exp.Literal) and value.is_string and value.name.strip().lower() == "now":
        ts = _duck(NOW_UTC)
    elif (isinstance(value, exp.Literal) and not value.is_string) or (isinstance(value, exp.Neg) and isinstance(value.this, exp.Literal)):
        ts = _duck("MAKE_TIMESTAMP(CAST((__v - 2440587.5) * 86400000000 AS BIGINT))", v=value)  # a Julian day number
    else:
        ts = _duck("TRY_CAST(__v AS TIMESTAMP)", v=value)  # NULL where SQLite finds no date either
    for m in mods:
        shift = re.match(r"^([+-]?\d+(?:\.\d+)?)\s+(day|hour|minute|second|month|year)s?$", m)
        if shift:
            n, unit = shift.groups()
            if unit in ("month", "year"):
                if "." in n:
                    raise ValueError(f"{fn}(): '{m}': SQLite's fractional months and years have no DuckDB counterpart.")
                # SQLite keeps the day and lets it run over: 2025-03-31 '-1 month' is 2025-03-03.
                ts = _duck(f"DATE_TRUNC('month', __t) + TO_{unit.upper()}S({int(n)}) + (__t - DATE_TRUNC('month', __t))", t=ts)
            elif "." in n:
                ts = _duck(f"__t + TO_MICROSECONDS({round(float(n) * UNITS[unit] * 1000000)})", t=ts)
            else:
                ts = _duck(f"__t + TO_{unit.upper()}S({int(n)})", t=ts)
            continue
        start = re.match(r"^start of (month|year|day)$", m)
        if start:
            ts = _duck(f"DATE_TRUNC('{start.group(1)}', __t)", t=ts)
            continue
        week = re.match(r"^weekday ([0-6])$", m)
        if week:
            ts = _duck(f"__t + TO_DAYS(CAST(({week.group(1)} - DAYOFWEEK(__t) + 7) % 7 AS INTEGER))", t=ts)
            continue
        raise ValueError(f"{fn}(): the modifier '{m}' has no DuckDB counterpart here (supported: ±N days / hours / minutes / seconds / months / years, start of day / month / year, weekday N, unixepoch).")
    return ts


def _strftime(fmt, ts):
    """strftime(format, …): DuckDB knows SQLite's codes except %f (seconds with milliseconds), %s and %J."""
    if not (isinstance(fmt, exp.Literal) and fmt.is_string):
        return _duck("STRFTIME(__t, __f)", t=ts, f=fmt)
    special = {
        "%f": "STRFTIME(__t, '%S.%g')",
        "%s": "CAST(CAST(FLOOR(EPOCH(__t)) AS BIGINT) AS TEXT)",
        "%J": "CAST(EPOCH(__t) / 86400 + 2440587.5 AS TEXT)",
    }
    parts = []
    for piece in re.split(r"(%%|%[fsJ])", fmt.name):
        if not piece:
            continue
        if piece in special:
            parts.append(_duck(special[piece], t=ts))
        else:
            parts.append(_duck("STRFTIME(__t, __f)", t=ts, f=exp.Literal.string(piece)))
    if not parts:
        return exp.Literal.string("")
    out = parts[0]
    for p in parts[1:]:
        out = exp.DPipe(this=out, expression=p, safe=True)
    return out


def _date_function(node):
    """date(), time(), datetime(), julianday(), unixepoch(), strftime() as SQLite computes them, or None."""
    if isinstance(node, exp.Date):
        args = [node.this] + ([node.args["zone"]] if node.args.get("zone") else []) + list(node.expressions)
        return exp.Cast(this=_timestamp(args[0], args[1:], "date"), to=exp.DataType.build("DATE"))
    if isinstance(node, exp.TimeToStr) and isinstance(node.this, exp.TsOrDsToTimestamp):
        return _strftime(node.args["format"], _timestamp(node.this.this, [], "strftime"))
    if isinstance(node, exp.Anonymous):
        name, args = node.name.lower(), list(node.expressions)
        if not args:
            args = [exp.Literal.string("now")]
        if name == "datetime":
            return _duck("DATE_TRUNC('second', __t)", t=_timestamp(args[0], args[1:], name))
        if name == "time":
            return _strftime(exp.Literal.string("%H:%M:%S"), _timestamp(args[0], args[1:], name))
        if name == "julianday":
            return exp.Paren(this=_duck("EPOCH(__t) / 86400 + 2440587.5", t=_timestamp(args[0], args[1:], name)))
        if name == "unixepoch":
            return _duck("CAST(FLOOR(EPOCH(__t)) AS BIGINT)", t=_timestamp(args[0], args[1:], name))
        if name == "strftime" and len(args) >= 2:
            return _strftime(args[0], _timestamp(args[1], args[2:], name))
    return None


def _within(node, types, stop):
    """True when an ancestor of node below `stop` is one of `types`."""
    p = node.parent
    while p is not None and p is not stop:
        if isinstance(p, types):
            return True
        p = p.parent
    return False


def _bare_columns(select, notes):
    """SELECT brand, MAX(price) … GROUP BY division: SQLite takes the bare column from some row of the
    group (the row of the MAX or MIN when there is one of them); DuckDB refuses. Same rows: arg_max / arg_min."""
    aggs = [a for p in select.expressions for a in p.find_all(exp.AggFunc) if not _within(a, (exp.Window, exp.Select), select) and not isinstance(a.parent, exp.Window)]
    group = select.args.get("group")
    if not aggs and not group:
        return
    keys = []
    aliases = {p.alias: p.unalias() for p in select.expressions if p.alias}
    for k in group.expressions if group else []:
        if isinstance(k, exp.Literal) and k.is_int and 0 < int(k.name) <= len(select.expressions):
            keys.append(select.expressions[int(k.name) - 1].unalias())
        elif isinstance(k, exp.Column) and not k.table and k.name in aliases:
            keys.append(aliases[k.name])
        else:
            keys.append(k)
    names = {k.name for k in keys if isinstance(k, exp.Column)}
    extremes = [a for a in aggs if isinstance(a, (exp.Max, exp.Min))]

    def bare(col, part):
        if col.name in names or _within(col, (exp.AggFunc, exp.Window, exp.Select), select):
            return False
        if part != "select" and not col.table and col.name in aliases:
            return False  # ORDER BY / HAVING an output column
        up = col
        while up is not None and up is not select:
            if any(up == k for k in keys):
                return False
            up = up.parent
        return True

    def wrap(col):
        if len(extremes) == 1:
            fn = exp.ArgMax if isinstance(extremes[0], exp.Max) else exp.ArgMin
            return fn(this=col.copy(), expression=extremes[0].this.copy())
        return exp.AnyValue(this=col.copy())

    wrapped = False
    for p in list(select.expressions):
        if isinstance(p, exp.Column) and bare(p, "select"):
            p.replace(exp.alias_(wrap(p), p.output_name))  # the header stays brand, as in SQLite
            wrapped = True
            continue
        for col in list(p.find_all(exp.Column)):
            if bare(col, "select"):
                col.replace(wrap(col))
                wrapped = True
    for part in ("order", "having"):
        node = select.args.get(part)
        for col in list(node.find_all(exp.Column)) if node else []:
            if bare(col, part):
                col.replace(wrap(col))
                wrapped = True
    if wrapped:
        notes.append(
            "A column that is neither grouped nor aggregated: SQLite takes it from the row of the MAX / MIN, DuckDB needs that said (arg_max / arg_min)."
            if len(extremes) == 1
            else "A column that is neither grouped nor aggregated: SQLite takes it from some row of the group, DuckDB needs that said (any_value) and may pick another row."
        )


PREDICATES = (exp.EQ, exp.NEQ, exp.GT, exp.GTE, exp.LT, exp.LTE, exp.And, exp.Or, exp.Not, exp.Like, exp.ILike, exp.Glob, exp.In, exp.Between, exp.Is, exp.NullSafeEQ, exp.Exists)


def _columns_of_kind(tree, schema, kind):
    """Names of the columns whose type matches `kind` in every table the statement reads that has them."""
    kinds = {}
    for t in tree.find_all(exp.Table):
        for name, typ in (schema or {}).get(t.name.lower(), {}).items():
            kinds.setdefault(name.lower(), set()).add(bool(re.match(kind, typ.upper())))
    return {n for n, k in kinds.items() if k == {True}}


FLOAT_KIND = r"(DOUBLE|FLOAT|REAL|DECIMAL|NUMERIC)"
TEXT_KIND = r"(VARCHAR|TEXT|STRING|CHAR)"


def _is_float(e, floats):
    """True when SQLite computes the expression as a REAL (so its SUM is a sum of fractions)."""
    if isinstance(e, exp.Literal):
        return not e.is_string and bool(re.search(r"[.eE]", e.name))
    if isinstance(e, exp.Column):
        return e.name.lower() in floats
    if isinstance(e, (exp.Cast, exp.TryCast)):
        return e.to.this in FLOAT_TYPES
    if isinstance(e, (exp.Round, exp.Avg)):
        return True
    if isinstance(e, (exp.Paren, exp.Neg, exp.Abs)):
        return _is_float(e.this, floats)
    if isinstance(e, PREDICATES):
        return False
    if isinstance(e, exp.Binary):
        return _is_float(e.left, floats) or _is_float(e.right, floats)
    if isinstance(e, exp.Case):
        return any(_is_float(i.args.get("true"), floats) for i in e.args.get("ifs", [])) or (e.args.get("default") is not None and _is_float(e.args["default"], floats))
    if isinstance(e, exp.Coalesce):
        return _is_float(e.this, floats) or any(_is_float(x, floats) for x in e.expressions)
    return False


END_OF_LIST = {TokenType.FROM, TokenType.WHERE, TokenType.GROUP_BY, TokenType.HAVING, TokenType.ORDER_BY, TokenType.LIMIT, TokenType.UNION, TokenType.EXCEPT, TokenType.INTERSECT, TokenType.WINDOW, TokenType.SEMICOLON}


def _select_items(source):
    """The text of each item of the outermost SELECT list: SQLite names an unaliased column by it."""
    try:
        tokens = sqlglot.Dialect.get_or_raise("sqlite").tokenize(source)
    except Exception:
        return []
    depth, items, cur, on = 0, [], [], False
    for t in tokens:
        if not on:
            depth += t.token_type == TokenType.L_PAREN
            depth -= t.token_type == TokenType.R_PAREN
            if depth == 0 and t.token_type == TokenType.SELECT:
                on = True
            continue
        if depth == 0 and t.token_type in END_OF_LIST:
            break
        if depth == 0 and not items and not cur and t.token_type in (TokenType.DISTINCT, TokenType.ALL):
            continue
        if depth == 0 and t.token_type == TokenType.COMMA:
            items.append(cur)
            cur = []
            continue
        depth += t.token_type == TokenType.L_PAREN
        depth -= t.token_type == TokenType.R_PAREN
        cur.append(t)
    if cur:
        items.append(cur)
    return [source[i[0].start : i[-1].end + 1] for i in items if i]


def _keep_headers(tree, source):
    """SELECT 7 / 2 is headed `7 / 2` in SQLite; when the DuckDB expression reads otherwise, an alias keeps that."""
    sel = tree
    while isinstance(sel, exp.SetOperation):
        sel = sel.this
    if not isinstance(sel, exp.Select):
        return
    items = _select_items(source)
    if len(items) != len(sel.expressions):
        return
    squash = lambda t: re.sub(r"\s+", "", t).lower()
    for p, text in zip(list(sel.expressions), items):
        if isinstance(p, (exp.Alias, exp.Column, exp.Star)) or squash(p.sql("duckdb")) == squash(text):
            continue
        p.replace(exp.alias_(p.copy(), text, quoted=True))


def _fix_sqlite(tree, notes, schema=None, source=None):
    """What sqlglot keeps as written but DuckDB computes differently from SQLite. `schema`: the column
    types of the tables a bare name reaches ({table: {column: type}}), for the sums below."""
    # CAST(x AS INTEGER) cuts the fraction off in SQLite (3.7 → 3); DuckDB rounds (→ 4).
    for node in list(tree.find_all(exp.Cast)):
        if node.to.this in INT_TYPES and not (isinstance(node.this, exp.Literal) and node.this.is_int):
            node.replace(_duck("CAST(TRUNC(CAST(__x AS DOUBLE)) AS BIGINT)", x=node.this))
    for dt in list(tree.find_all(exp.DataType)):
        # SQLite's REAL is a double, its INTEGER 64 bits, NUMERIC no fixed decimal, and text has no length.
        if dt.this in FLOAT_TYPES and dt.this != exp.DataType.Type.DOUBLE:
            dt.replace(exp.DataType.build("DOUBLE"))
        elif dt.this in INT_TYPES and dt.this != exp.DataType.Type.BIGINT:
            dt.replace(exp.DataType.build("BIGINT"))
        elif dt.this in TEXT_TYPES:
            dt.replace(exp.DataType.build("VARCHAR"))
    texts = _columns_of_kind(tree, schema, TEXT_KIND)
    # LIKE ignores case in SQLite (for A-Z), not in DuckDB.
    for node in list(tree.find_all(exp.Like)):
        node.replace(exp.ILike(this=_as_text(node.this, texts), expression=node.expression))
    for node in list(tree.find_all(exp.Glob)):
        node.set("this", _as_text(node.this, texts))
    # substr(week_start, 1, 7): in SQLite a date is text; in Lab it is a DATE.
    for node in list(tree.find_all(exp.Substring, exp.Upper, exp.Lower, exp.Trim, exp.Replace, exp.StrPosition, exp.Length)):
        node.set("this", _as_text(node.this, texts))
    # week_start = '2025-06': SQLite compares the text; DuckDB would read '2025-06' as a date and fail.
    for node in list(tree.find_all(exp.EQ, exp.NEQ, exp.GT, exp.GTE, exp.LT, exp.LTE)):
        if _odd_text(node.expression) and not _texty(node.this, texts):
            node.set("this", _as_text(node.this, texts))
        elif _odd_text(node.this) and not _texty(node.expression, texts):
            node.set("expression", _as_text(node.expression, texts))
    # week_start = strftime('%Y-%m-%d', 'now'): a DATE against text, which DuckDB won't compare.
    for node in list(tree.find_all(exp.EQ, exp.NEQ, exp.GT, exp.GTE, exp.LT, exp.LTE)):
        for a, b in (("this", "expression"), ("expression", "this")):
            if isinstance(node.args[a], exp.Column) and not _texty(node.args[a], texts) and _texty(node.args[b]) and not isinstance(node.args[b], exp.Literal):
                node.set(a, _as_text(node.args[a], texts))
    for node in list(tree.find_all(exp.Between)):
        if (_odd_text(node.args["low"]) or _odd_text(node.args["high"])) and not _texty(node.this, texts):
            node.set("this", _as_text(node.this, texts))
    for node in list(tree.find_all(exp.In)):
        if any(_odd_text(e) for e in node.expressions) and not _texty(node.this, texts):
            node.set("this", _as_text(node.this, texts))
    # a IS b is SQLite's NULL-safe equals.
    for node in list(tree.find_all(exp.Is)):
        if not isinstance(node.expression, (exp.Null, exp.Boolean)):
            node.replace(exp.NullSafeEQ(this=node.this, expression=node.expression))
    # max(a, b) and min(a, b) with two or more arguments compare values in a row.
    for node in list(tree.find_all(exp.Max, exp.Min)):
        if node.expressions:
            cls = exp.Greatest if isinstance(node, exp.Max) else exp.Least
            node.replace(cls(this=node.this, expressions=node.expressions))
    # total(x): SUM as a REAL that is 0.0 over no rows.
    for node in list(tree.find_all(exp.Anonymous)):
        if node.name.lower() == "total" and len(node.expressions) == 1:
            node.replace(_duck("COALESCE(CAST(SUM(__x) AS DOUBLE), 0.0)", x=node.expressions[0]))
    # ROUND gives a REAL in SQLite, so ROUND(a) / 2 is not a whole-number division there.
    for node in list(tree.find_all(exp.Div)):
        for side in ("this", "expression"):
            if isinstance(node.args.get(side), exp.Round):
                node.set(side, exp.Cast(this=node.args[side].copy(), to=exp.DataType.build("DOUBLE")))
    for select in list(tree.find_all(exp.Select)):
        _bare_columns(select, notes)
        # SELECT price > 100: SQLite has no booleans, a comparison is 1 or 0.
        for p in select.expressions:
            inner = p.this if isinstance(p, exp.Alias) else p
            if isinstance(inner, PREDICATES):
                inner.replace(exp.Cast(this=inner.copy(), to=exp.DataType.build("INTEGER")))
    # … and adds up as one: SUM(price > 100), (a > b) + 1.
    for node in list(tree.find_all(*PREDICATES)):
        if isinstance(node.parent, (exp.Sum, exp.Avg, exp.Add, exp.Sub, exp.Mul, exp.Div, exp.Mod)) or (
            isinstance(node.parent, exp.Paren) and isinstance(node.parent.parent, (exp.Sum, exp.Avg, exp.Add, exp.Sub, exp.Mul, exp.Div, exp.Mod))
        ):
            node.replace(exp.Cast(this=node.copy(), to=exp.DataType.build("INTEGER")))
    # SUM and AVG of REAL values: SQLite adds them with error compensation, DuckDB's FSUM / FAVG do
    # too (plain SUM can end a cent off, and ROUND then shows a whole unit off).
    floats = _columns_of_kind(tree, schema, FLOAT_KIND)
    for node in list(tree.find_all(exp.Sum, exp.Avg)):
        if not isinstance(node.this, exp.Distinct) and _is_float(node.this, floats):
            node.replace(exp.Anonymous(this="FSUM" if isinstance(node, exp.Sum) else "FAVG", expressions=[node.this.copy()]))
    # CREATE TABLE t: the user's tables live in main (the search path puts quaera first).
    if isinstance(tree, exp.Create) and tree.kind in ("TABLE", "VIEW"):
        props = tree.args.get("properties")
        temp = props and any(isinstance(p, exp.TemporaryProperty) for p in props.expressions)
        target = tree.this.this if isinstance(tree.this, exp.Schema) else tree.this
        if isinstance(target, exp.Table) and not target.args.get("db") and not temp:
            target.set("db", exp.to_identifier("main"))
    if tree.find(exp.Div):
        notes.append("Runs with SET integer_division = true, as in SQLite: a whole number divided by a whole number gives a whole number (7 / 2 = 3).")
    # date(), strftime() …: last, so the rules above leave the DuckDB they become alone; the
    # deepest first, so julianday(date('now')) gets the translated date().
    for node in reversed(list(tree.walk())):
        new = _date_function(node)
        if new is not None:
            node.replace(new)
    if source:
        _keep_headers(tree, source)
    return tree


# A statement starting a line: T-SQL scripts often leave out the semicolons.
STARTS = re.compile(r"^(?=(?:SELECT|INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|TRUNCATE|WITH|DECLARE|SET|EXEC|EXECUTE|PRINT|IF|BEGIN)\b)", re.IGNORECASE | re.MULTILINE)


def _clean(text, read):
    """The statements in `text`, or None when it doesn't read or reads only as an untranslated command."""
    try:
        trees = [t for t in sqlglot.parse(text, read=read) if t is not None]
    except ParseError:
        return None
    return None if any(isinstance(t, exp.Command) for t in trees) else trees


def _parse(text, read):
    trees = _clean(text, read)
    if trees is not None:
        return [(text, trees)]
    # SELECT @x <newline> SELECT 1 (T-SQL; SQLite needs the semicolons): sqlglot needs a separator
    # (without one it fails, or keeps the lot as an untranslated command). Cut before each line that starts with a statement word and
    # glue the pieces back until they read: a UNION's second SELECT or a subquery on its own line
    # joins the piece before it.
    pieces = [p for p in STARTS.split(text) if _has_code(p)] if read == "tsql" else []
    if len(pieces) > 1:
        out, cur = [], ""
        for p in pieces:
            cur += p
            got = _clean(cur, read)
            if got is not None:
                out.append((cur.strip(), got))
                cur = ""
        if not cur:
            _handler.items = []
            return out
    return [(text, [t for t in sqlglot.parse(text, read=read) if t is not None])]  # raises the first error, or keeps the command


def _note(text):
    known = {
        "Unsupported query option.": "OPTION (…) query hints are SQL Server's own: left out.",
        "Unsupported Execute syntax": "EXEC runs a stored procedure; DuckDB has none (a MACRO is the nearest thing).",
    }
    if "Falling back to parsing as a 'Command'" in text:
        return "sqlglot could not read this statement, so it is passed on as written."
    return known.get(text, text)


def translate(script, pretty_multiline=True, read="tsql", schema=None):
    """[{source, at, target, notes, error}] per statement; target is None when it could not be read.
    `read` is the dialect written: "tsql" or "sqlite"; `schema` see _fix_sqlite."""
    result = []
    for source, at in _statements(script, read):
        text = source.strip()
        _handler.items = []
        try:
            parsed = _parse(text, read)
        except Exception as e:  # sqlglot raises ParseError, and now and then something else on odd input
            result.append({"source": text, "at": at, "target": None, "notes": [], "error": _parse_error(e)})
            continue
        for piece, trees in parsed:
            notes = []
            if len(parsed) > 1:
                _handler.items = []
            try:
                pretty = pretty_multiline and "\n" in piece
                fixed = [_fix(t, notes) if read == "tsql" else _fix_sqlite(t, notes, schema, piece if len(trees) == 1 else None) for t in trees]
                target = ";\n".join(t.sql(dialect="duckdb", pretty=pretty, unsupported_level=ErrorLevel.WARN) for t in fixed)
                error = None
            except Exception as e:
                target, error = None, str(e)
            notes = list(dict.fromkeys([_note(n) for n in _handler.items] + notes))
            if target is not None and not target.strip():  # EXEC: nothing left to run
                target, error = None, notes.pop(0) if notes else "This statement has no DuckDB counterpart."
            result.append({"source": piece, "at": at + max(0, source.find(piece)), "target": target, "notes": notes, "error": error})
    return result


def _parse_error(e):
    if not isinstance(e, ParseError):
        return str(e).split("\n")[0]
    errors = getattr(e, "errors", None) or []
    if errors:
        first = errors[0]
        text = re.sub(r"<Token token_type: [^,]+, text: ([^,]*),.*?>", r"\1", first.get("description", "Could not read this statement"))
        return f"{text} (line {first.get('line')}, column {first.get('col')})"
    return str(e).split("\n")[0]
