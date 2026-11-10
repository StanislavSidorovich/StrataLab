// A free SQL editor for the step More: Lab's own CodeMirror setup (SQL highlighting, completion of the tables in the
// database, both themes), without the workbench's tabs. Mod-Enter runs. The text lives in a ref: the editor is rebuilt
// only when the theme or the tables change.
import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { PostgreSQL, sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { completionSchema, darkBackground, lightTheme } from '../SqlEditor'
import { useLab } from '../store'

export function MoreEditor({ value, onChange, onRun, label }: { value: string; onChange: (v: string) => void; onRun: () => void; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const text = useRef(value)
  const handlers = useRef({ onChange, onRun })
  handlers.current = { onChange, onRun }
  const dark = useLab((s) => s.theme === 'dark')
  const tables = useLab((s) => s.tables)

  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      parent: host.current,
      doc: text.current,
      extensions: [
        Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (handlers.current.onRun(), true) }])),
        basicSetup,
        EditorView.lineWrapping,
        EditorView.theme({ '&': { borderRadius: '6px', minHeight: '120px' }, '.cm-scroller': { borderRadius: '6px', minHeight: '120px' }, '.cm-gutters': { borderRadius: '6px 0 0 6px' } }),
        sql({ dialect: PostgreSQL, schema: completionSchema(tables, 'main'), upperCaseKeywords: false }),
        dark ? [Prec.high(darkBackground), oneDark] : lightTheme,
        EditorView.contentAttributes.of({ 'aria-label': label }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return
          text.current = u.state.doc.toString()
          handlers.current.onChange(text.current)
        }),
      ],
    })
    return () => view.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, tables])

  return <div ref={host} className="more-editor" data-testid="more-editor" />
}
