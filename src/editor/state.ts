import type { LevelData, MoteColor } from '../sim/types'

export type Tool = 'select' | 'mote' | 'obstacle' | 'blocker' | 'ghost'

export type Selection =
  | { kind: 'mote'; i: number }
  | { kind: 'obstacle'; i: number }
  | { kind: 'blocker'; i: number }
  | { kind: 'rune'; i: number }
  | null

// Design aid only (never saved): a hand rune layer pinned at a spot so the
// author can see its footprint and catch ring against the motes.
export interface Ghost {
  rune: number
  layer: number
  x: number
  y: number
}

const HISTORY_LIMIT = 200

// Single source of truth for the open level. Every edit goes through
// change() (or beginDrag/endDrag for continuous moves) so undo/redo and the
// dirty flag stay exact.
export class EditorState {
  path = ''
  level!: LevelData
  selection: Selection = null
  tool: Tool = 'select'
  moteColor: MoteColor = 'red'
  ghostLayer = 0
  ghosts: Ghost[] = []
  private saved = ''
  private past: string[] = []
  private future: string[] = []
  private listeners = new Set<() => void>()

  open(path: string, level: LevelData): void {
    this.path = path
    this.level = level
    this.saved = JSON.stringify(level)
    this.past = []
    this.future = []
    this.selection = null
    this.ghosts = []
    this.emit()
  }

  get dirty(): boolean {
    return !!this.level && JSON.stringify(this.level) !== this.saved
  }

  markSaved(): void {
    this.saved = JSON.stringify(this.level)
    this.emit()
  }

  change(mutate: (level: LevelData) => void): void {
    this.pushHistory()
    mutate(this.level)
    this.emit()
  }

  // Continuous edits (dragging): one history entry for the whole gesture.
  beginDrag(): void {
    this.pushHistory()
  }
  dragMove(mutate: (level: LevelData) => void): void {
    mutate(this.level)
    this.emit()
  }

  undo(): void {
    const prev = this.past.pop()
    if (prev === undefined) return
    this.future.push(JSON.stringify(this.level))
    this.level = JSON.parse(prev)
    this.fixSelection()
    this.emit()
  }

  redo(): void {
    const next = this.future.pop()
    if (next === undefined) return
    this.past.push(JSON.stringify(this.level))
    this.level = JSON.parse(next)
    this.fixSelection()
    this.emit()
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }
  get canRedo(): boolean {
    return this.future.length > 0
  }

  select(sel: Selection): void {
    this.selection = sel
    this.emit()
  }

  setTool(tool: Tool): void {
    this.tool = tool
    this.emit()
  }

  onChange(fn: () => void): void {
    this.listeners.add(fn)
  }

  emit(): void {
    this.listeners.forEach((fn) => fn())
  }

  private pushHistory(): void {
    this.past.push(JSON.stringify(this.level))
    if (this.past.length > HISTORY_LIMIT) this.past.shift()
    this.future = []
  }

  private fixSelection(): void {
    const s = this.selection
    if (!s) return
    const list = { mote: this.level.motes, obstacle: this.level.obstacles, blocker: this.level.blockers, rune: this.level.hand }[s.kind]
    if (s.i >= list.length) this.selection = null
  }
}
