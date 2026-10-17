# T-SQL → DuckDB (stage 4), run by Pyodide in a Web Worker (src/dialects/sqlglotWorker.ts) and
# by the tests in Node (tests/translate.test.ts). sqlglot does the translation; this file splits
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


def _statements(script):
    """(source text, start offset) of each statement: GO lines and top-level semicolons split."""
    out = []
    pos = 0
    for m in list(GO.finditer(script)) + [None]:
        end = m.start() if m else len(script)
        batch = script[pos:end]
        try:
            tokens = sqlglot.Dialect.get_or_raise("tsql").tokenize(batch)
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


# A statement starting a line: T-SQL scripts often leave out the semicolons.
STARTS = re.compile(r"^(?=(?:SELECT|INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|TRUNCATE|WITH|DECLARE|SET|EXEC|EXECUTE|PRINT|IF|BEGIN)\b)", re.IGNORECASE | re.MULTILINE)


def _clean(text):
    """The statements in `text`, or None when it doesn't read or reads only as an untranslated command."""
    try:
        trees = [t for t in sqlglot.parse(text, read="tsql") if t is not None]
    except ParseError:
        return None
    return None if any(isinstance(t, exp.Command) for t in trees) else trees


def _parse(text):
    trees = _clean(text)
    if trees is not None:
        return [(text, trees)]
    # SELECT @x <newline> SELECT 1: sqlglot needs a separator (without one it fails, or keeps the
    # lot as an untranslated command). Cut before each line that starts with a statement word and
    # glue the pieces back until they read: a UNION's second SELECT or a subquery on its own line
    # joins the piece before it.
    pieces = [p for p in STARTS.split(text) if _has_code(p)]
    if len(pieces) > 1:
        out, cur = [], ""
        for p in pieces:
            cur += p
            got = _clean(cur)
            if got is not None:
                out.append((cur.strip(), got))
                cur = ""
        if not cur:
            _handler.items = []
            return out
    return [(text, [t for t in sqlglot.parse(text, read="tsql") if t is not None])]  # raises the first error, or keeps the command


def _note(text):
    known = {
        "Unsupported query option.": "OPTION (…) query hints are SQL Server's own: left out.",
        "Unsupported Execute syntax": "EXEC runs a stored procedure; DuckDB has none (a MACRO is the nearest thing).",
    }
    if "Falling back to parsing as a 'Command'" in text:
        return "sqlglot could not read this statement, so it is passed on as written."
    return known.get(text, text)


def translate(script, pretty_multiline=True):
    """[{source, at, target, notes, error}] per statement; target is None when it could not be read."""
    result = []
    for source, at in _statements(script):
        text = source.strip()
        _handler.items = []
        try:
            parsed = _parse(text)
        except Exception as e:  # sqlglot raises ParseError, and now and then something else on odd input
            result.append({"source": text, "at": at, "target": None, "notes": [], "error": _parse_error(e)})
            continue
        for piece, trees in parsed:
            notes = []
            if len(parsed) > 1:
                _handler.items = []
            try:
                pretty = pretty_multiline and "\n" in piece
                target = ";\n".join(_fix(t, notes).sql(dialect="duckdb", pretty=pretty, unsupported_level=ErrorLevel.WARN) for t in trees)
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
