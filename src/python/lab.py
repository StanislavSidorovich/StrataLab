# The `lab` module of Quaera Lab's Python tabs (stage 7), and the cell runner around it.
# Runs in Pyodide in its own worker (src/python/pythonWorker.ts). Tables come from DuckDB in the
# page as columns (src/python/columns.ts): bytes read with numpy, or lists of strings, with a null
# mask; DataFrames go back the same way. Outputs have Jupyter's shape, so an .ipynb takes them as
# they are (src/core/ipynb.ts).
import ast
import base64
import io
import linecache
import os
import sys
import traceback
import warnings

os.environ["MPLBACKEND"] = "module://lab_backend"

import numpy as np
import pandas as pd

ROW_LIMIT = 10_000

# Set by the worker before each cell: the tables and query results the page fetched for it (by
# key, see src/core/pyCells.ts callKey), the table names for lab.tables(), and a JS function that
# fetches one more while the cell runs (where the browser can wait: JSPI).
_fetched = {}
_names = []
_fetch_js = None
# Filled while a cell runs: lab.save calls, done by the page after the cell; the cell's outputs.
_saves = []
_outputs = []
# Every DataFrame or Series the cell showed, with its place in `_outputs`: each shows inline in
# Output and can be opened in the DataFrame view.
_frames = []


class LabError(Exception):
    """A table or query the page could not give (its DuckDB error)."""


# ------------------------------------------------------------------ tables in


try:
    from pyodide.ffi import jsnull as _jsnull
except ImportError:  # outside Pyodide (no JS values to meet)
    _jsnull = object()


def _missing(x):
    """None, NaN, pd.NA, NaT, and JS null (which Pyodide turns into jsnull, not None)."""
    if x is None or x is _jsnull:
        return True
    try:
        return bool(pd.isna(x))
    except (TypeError, ValueError):
        return False


def _bytes(x):
    """A column's bytes: a JS Uint8Array (JsProxy) or Python bytes."""
    return x.to_bytes() if hasattr(x, "to_bytes") else bytes(x)


def _frame(f):
    """A DataFrame from the page's columns (a dict made by to_py())."""
    rows = f["rows"]
    data = {}
    for c in f["columns"]:
        dtype = c["dtype"]
        nulls = c.get("nulls")
        mask = np.frombuffer(_bytes(nulls), dtype=np.uint8).astype(bool) if nulls is not None else None
        has_nulls = mask is not None and mask.any()
        if dtype == "str":
            # JS null arrives as jsnull, which pandas would keep as the text "jsnull": None where the mask says NULL.
            values = list(c["values"])
            s = pd.Series([None if _missing(v) or (has_nulls and mask[i]) else v for i, v in enumerate(values)], dtype="str")
        elif dtype == "datetime64[us]":
            a = np.frombuffer(_bytes(c["data"]), dtype=np.int64).view("datetime64[us]").copy()
            if has_nulls:
                a[mask] = np.datetime64("NaT")
            s = pd.Series(a)
            if c.get("tz"):
                s = s.dt.tz_localize("UTC").dt.tz_convert(c["tz"])
        elif dtype == "bool":
            a = np.frombuffer(_bytes(c["data"]), dtype=np.uint8).astype(bool)
            s = pd.Series(pd.arrays.BooleanArray(a, mask)) if has_nulls else pd.Series(a)
        else:
            a = np.frombuffer(_bytes(c["data"]), dtype=dtype).copy()
            if not has_nulls:
                s = pd.Series(a)
            elif a.dtype.kind == "f":
                a[mask] = np.nan
                s = pd.Series(a)
            else:
                s = pd.Series(pd.arrays.IntegerArray(a, mask))
        data[c["name"]] = s
    df = pd.DataFrame(data) if data else pd.DataFrame(index=range(rows))
    return df


def _get(kind, arg):
    key = f"{kind}:{arg.strip() if kind == 'table' else arg}"
    f = _fetched.get(key)
    if f is None:
        f = _fetch_now(kind, arg)
        _fetched[key] = f
    if "error" in f:
        raise LabError(f["error"])
    return _frame(f)


def _fetch_now(kind, arg):
    from pyodide.ffi import can_run_sync, run_sync

    if _fetch_js is None or not can_run_sync():
        call = f'lab.{kind}("{arg}")' if kind == "table" else 'lab.sql("SELECT …")'
        raise LabError(
            f"This browser can't fetch a table while Python runs. Write the name or the SQL as a string in the call, "
            f"like {call}, so Lab can fetch it before the cell starts (or use Chrome or Edge)."
        )
    return run_sync(_fetch_js(kind, arg)).to_py()


def table(name):
    """A table or view of the database as a DataFrame: lab.table("demo.orders"), lab.table("quaera.dim_customer")."""
    if not isinstance(name, str):
        raise TypeError("lab.table takes the table's name as a string")
    return _get("table", name)


def sql(query):
    """Runs DuckDB SQL and gives its result as a DataFrame: lab.sql("SELECT … FROM …")."""
    if not isinstance(query, str):
        raise TypeError("lab.sql takes the SQL as a string")
    return _get("sql", query)


def tables():
    """The tables and views of the database (sample datasets as schema.table)."""
    return list(_names)


def save(df, name):
    """Writes a DataFrame to My tables as `name` (replacing a table of that name) when the cell ends."""
    if isinstance(df, pd.Series):
        df = df.to_frame()
    if not isinstance(df, pd.DataFrame):
        raise TypeError("lab.save takes a pandas DataFrame and a name: lab.save(df, \"name\")")
    if not isinstance(name, str) or not name.strip():
        raise TypeError("lab.save needs a table name as a string")
    _saves.append({"name": name.strip(), "frame": _encode(_shown(df))})


# ------------------------------------------------------------------ DataFrames out


def _shown(df):
    """A DataFrame as the grid shows it: a meaningful index becomes columns, as pandas prints it."""
    if isinstance(df, pd.Series):
        df = df.to_frame(name=df.name if df.name is not None else "value")
    if not (isinstance(df.index, pd.RangeIndex) and df.index.name is None and df.index.start == 0 and df.index.step == 1):
        df = df.reset_index(allow_duplicates=True)
    return df


def _column_name(name):
    if isinstance(name, tuple):
        return " ".join(str(p) for p in name if str(p) != "")
    return str(name)


def _encode_column(name, s):
    dt = s.dtype
    mask = s.isna().to_numpy(dtype=bool)
    out = {"name": name}
    if mask.any():
        out["nulls"] = mask.astype(np.uint8).tobytes()
    if pd.api.types.is_bool_dtype(dt):
        out.update(dtype="bool", data=s.fillna(False).to_numpy(dtype=np.uint8).tobytes())
    elif pd.api.types.is_integer_dtype(dt):
        np_dtype = np.dtype(getattr(dt, "numpy_dtype", dt))
        out.update(dtype=np_dtype.name, data=s.to_numpy(dtype=np_dtype, na_value=0).tobytes())
    elif pd.api.types.is_float_dtype(dt):
        out.update(dtype="float64", data=s.to_numpy(dtype=np.float64, na_value=np.nan).tobytes())
    elif pd.api.types.is_datetime64_any_dtype(dt):
        tz = getattr(dt, "tz", None)
        v = s.dt.tz_convert("UTC").dt.tz_localize(None) if tz is not None else s
        a = v.to_numpy(dtype="datetime64[us]").view(np.int64).copy()
        a[mask] = 0
        out.update(dtype="datetime64[us]", data=a.tobytes())
        if tz is not None:
            out["tz"] = str(tz)
    else:
        out.update(dtype="str", values=[None if m or _missing(x) else str(x) for x, m in zip(s.tolist(), mask)])
    return out


def _encode(df, limit=None):
    total = len(df)
    if limit is not None and total > limit:
        df = df.iloc[:limit]
    cols = [_encode_column(_column_name(df.columns[i]), df.iloc[:, i]) for i in range(df.shape[1])]
    return {"rows": len(df), "total": total, "columns": cols}


# ------------------------------------------------------------------ running a cell


class _Stream(io.TextIOBase):
    def __init__(self, name):
        self.name = name

    def writable(self):
        return True

    def write(self, text):
        if not text:
            return 0
        last = _outputs[-1] if _outputs else None
        if last and last["output_type"] == "stream" and last["name"] == self.name:
            last["text"] += text
        else:
            _outputs.append({"output_type": "stream", "name": self.name, "text": text})
        return len(text)


def _is_plot(value):
    mod = type(value).__module__ or ""
    if mod.startswith(("matplotlib", "seaborn")):
        return True
    if isinstance(value, (list, tuple)) and value and all(_is_plot(v) for v in value):
        return True
    return False


def _bundle(value):
    """Jupyter's MIME bundle for a value; a DataFrame or Series is also sent as columns."""
    data = {"text/plain": repr(value)}
    if isinstance(value, (pd.DataFrame, pd.Series)):
        _frames.append((len(_outputs), value))
        if isinstance(value, pd.DataFrame):
            try:
                data["text/html"] = value._repr_html_()
            except Exception:
                pass
    return data


def display(*values):
    """Shows values in the cell's output, as Jupyter's display() does."""
    for v in values:
        if v is None or _is_plot(v):
            _flush_figures()
            continue
        _outputs.append({"output_type": "display_data", "data": _bundle(v), "metadata": {}})


def _flush_figures():
    """Every open matplotlib figure as a PNG in the output, then closed (plt.show() and a cell's end)."""
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return
    for num in plt.get_fignums():
        fig = plt.figure(num)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=100, bbox_inches="tight", facecolor="white")
        w, h = fig.get_size_inches()
        text = f"<Figure size {w * 100:.0f}x{h * 100:.0f} with {len(fig.axes)} Axes>"
        _outputs.append({"output_type": "display_data", "data": {"image/png": base64.b64encode(buf.getvalue()).decode("ascii"), "text/plain": text}, "metadata": {}})
    plt.close("all")


MISSING_HINT = "Python tabs in Quaera Lab have pandas, numpy, matplotlib and seaborn (and Python's standard library); other packages can't be installed yet."


def _error(e):
    tb = e.__traceback__
    # Leave out the frames of Lab's own runner: start at the first frame of the user's cell.
    while tb is not None and not tb.tb_frame.f_code.co_filename.startswith("<cell"):
        tb = tb.tb_next
    lines = traceback.format_exception(type(e), e, tb)
    evalue = str(e)
    if isinstance(e, ModuleNotFoundError):
        evalue = f"{evalue}. {MISSING_HINT}"
    return {"output_type": "error", "ename": type(e).__name__, "evalue": evalue, "traceback": [l.rstrip("\n") for l in lines]}


namespace = {"__name__": "__main__", "__builtins__": __builtins__, "display": display, "lab": sys.modules[__name__]}


async def run_cell(code, line, count, fetched, names, fetch_js):
    """Runs one cell in the session's namespace; its outputs, the DataFrames it showed, lab.save calls."""
    global _fetched, _names, _fetch_js, _saves, _outputs, _frames
    from pyodide.code import eval_code_async

    _fetched = dict(fetched)
    _names = list(names)
    _fetch_js = fetch_js
    _saves, _outputs, _frames = [], [], []
    filename = f"<cell [{count}]>"
    # Blank lines first, so line numbers in errors are the tab's.
    source = "\n" * (line - 1) + code
    linecache.cache[filename] = (len(source), None, source.splitlines(True), filename)
    out, err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = _Stream("stdout"), _Stream("stderr")
    try:
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message=".*non-interactive.*")
            value = await eval_code_async(source, globals=namespace, filename=filename, return_mode="last_expr", quiet_trailing_semicolon=True)
        _flush_figures()
        if value is not None and not _is_plot(value):
            _outputs.append({"output_type": "execute_result", "execution_count": count, "data": _bundle(value), "metadata": {}})
    except BaseException as e:  # noqa: BLE001 (SystemExit and KeyboardInterrupt too: they end the cell, not Python)
        _flush_figures()
        _outputs.append(_error(e))
    finally:
        sys.stdout, sys.stderr = out, err
    frames = [{"at": at, "frame": _encode(_shown(v), ROW_LIMIT)} for at, v in _frames]
    return {"outputs": _outputs, "frames": frames, "saves": _saves}


def imports(code):
    """The top-level modules a cell imports (for the packages to download first)."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return []
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found += [a.name.split(".")[0] for a in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
            found.append(node.module.split(".")[0])
    return sorted(set(found))
