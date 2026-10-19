// Python tabs: the cells of the `# %%` format made visible inside the one editor. A thin bar over
// each cell with Run cell / Run below (like VS Code's CodeLens), and every other cell tinted.
// The text stays one file with `# %%` lines; nothing here changes what is saved or exported.
import { StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import { splitCells } from '../core/pyCells'
import { runPython, useLab } from './store'

function run(view: EditorView, tabId: string, index: number, below: boolean) {
  if (useLab.getState().engine.status !== 'ready') return
  const cells = splitCells(view.state.doc.toString())
  const pick = cells
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c.kind === 'code' && (below ? i >= index : i === index))
    .map(({ c, i }) => ({ code: c.source, line: c.line, index: i, source: c.source }))
  void runPython(tabId, pick)
}

class CellBar extends WidgetType {
  constructor(readonly tabId: string, readonly index: number, readonly markdown: boolean) {
    super()
  }
  eq(o: CellBar) {
    return o.tabId === this.tabId && o.index === this.index && o.markdown === this.markdown
  }
  toDOM(view: EditorView) {
    const bar = document.createElement('div')
    bar.className = 'cm-cellbar'
    const label = document.createElement('span')
    label.className = 'cm-cellbar-label'
    label.textContent = this.markdown ? `Text · cell ${this.index + 1}` : `Cell ${this.index + 1}`
    bar.append(label)
    const button = (text: string, title: string, below: boolean) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'cm-cellbar-btn'
      b.textContent = text
      b.title = title
      // mousedown, not click: the editor keeps its cursor and focus
      b.addEventListener('mousedown', (e) => {
        e.preventDefault()
        run(view, this.tabId, this.index, below)
      })
      bar.append(b)
    }
    if (!this.markdown) button('▶ Run cell', 'Run this cell (Shift+Enter runs the cell at the cursor and moves on)', false)
    button('Run below', 'Run this cell and every cell under it, in order', true)
    return bar
  }
  ignoreEvent() {
    return true
  }
}

function build(state: EditorState, tabId: string) {
  const text = state.doc.toString()
  const deco: Range<Decoration>[] = []
  splitCells(text).forEach((c, i) => {
    deco.push(Decoration.widget({ widget: new CellBar(tabId, i, c.kind === 'markdown'), block: true, side: -1 }).range(c.from))
    const first = state.doc.lineAt(c.from).number
    const last = state.doc.lineAt(Math.min(c.to, state.doc.length)).number
    for (let n = first; n <= last; n++) {
      const from = state.doc.line(n).from
      const cls = (i % 2 ? 'cm-cell-alt ' : '') + (/^#\s?%%/.test(state.doc.line(n).text) ? 'cm-cell-marker' : '')
      if (cls.trim()) deco.push(Decoration.line({ class: cls.trim() }).range(from))
    }
  })
  return Decoration.set(deco, true)
}

/** The cell bars and tints of a Python tab's editor (`tabId` is who the Run buttons run). */
export function pyCellBars(tabId: string) {
  return StateField.define({
    create: (state) => build(state, tabId),
    update: (value, tr) => (tr.docChanged ? build(tr.state, tabId) : value),
    provide: (f) => EditorView.decorations.from(f),
  })
}
