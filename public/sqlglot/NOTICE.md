# Dialect engines: sources and licences

Served with the site, unmodified, and downloaded only when a tab is switched to that dialect.

## sqlglot (`sqlglot/sqlglot-30.23.0-py3-none-any.whl`)

Translates T-SQL to DuckDB. The wheel as published on PyPI: https://pypi.org/project/sqlglot/30.23.0/
Source: https://github.com/tobymao/sqlglot

```
MIT License

Copyright (c) 2026 Toby Mao

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Pyodide (`pyodide/`)

Python compiled to WebAssembly, runs sqlglot. Copied at build time from the npm package `pyodide`
(version in `package.json`), unmodified. Licence: Mozilla Public License 2.0
(https://mozilla.org/MPL/2.0/). Source: https://github.com/pyodide/pyodide. Python's standard
library (`python_stdlib.zip`) is under the Python Software Foundation License.

## PGlite (bundled in `assets/`)

PostgreSQL compiled to WebAssembly, for PostgreSQL tabs. npm package `@electric-sql/pglite`,
Apache-2.0 (PostgreSQL itself: the PostgreSQL License). Source: https://github.com/electric-sql/pglite
