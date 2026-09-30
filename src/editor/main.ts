import './editor.css'
import { Application } from 'pixi.js'
import { api } from './api'
import { EditorState, type Tool } from './state'
import { EditorCanvas } from './canvas'
import { el, renderInspector, swatch } from './inspector'
import { validateLevel } from '../sim/validate'
import { runCareless } from '../sim/headless'
import { GameScene } from '../core/GameScene'
import { usePalette } from '../render/Theme'
import type { PackManifest } from '../data/levels/pack'
import type { LevelData, MoteColor } from '../sim/types'

const st = new EditorState()
let manifest: PackManifest = { levels: [], debug: [] }
let pendingDiscard: string | null = null

// ---------------------------------------------------------------- layout
const root = document.getElementById('editor')!
const sidebar = el('div', { class: 'sidebar' })
const toolbar = el('div', { class: 'toolbar' })
const stage = el('div', { class: 'stage' })
const inspector = el('div', { class: 'inspector' })
const status = el('div', { class: 'status' })
const errors = el('div', { class: 'errors' })
root.append(sidebar, el('div', { class: 'center' }, toolbar, stage, status), el('div', { class: 'right' }, errors, inspector))

const canvas = new EditorCanvas(st, stage)

// ---------------------------------------------------------------- sidebar
function renderSidebar(): void {
  const list = (title: string, ids: string[], prefix: string) => {
    const box = el('div', { class: 'level-list' }, el('h3', {}, title))
    ids.forEach((id, i) => {
      const path = prefix + id
      const row = el(
        'div',
        { class: `level-row ${st.path === path ? 'active' : ''}` },
        el('button', { class: 'level-name', textContent: `${prefix ? '' : i + 1 + '. '}${id}`, on: { click: () => void openLevel(path) } }),
      )
      if (!prefix) {
        row.append(
          el('button', { class: 'ibtn', textContent: '↑', title: 'Move up', on: { click: () => void reorder(i, -1) } }),
          el('button', { class: 'ibtn', textContent: '↓', title: 'Move down', on: { click: () => void reorder(i, 1) } }),
        )
      }
      box.append(row)
    })
    return box
  }
  const newId = el('input', { placeholder: 'new-level-id', style: 'width:120px' })
  sidebar.replaceChildren(
    el('h2', {}, 'Circumgician'),
    list('Pack', manifest.levels, ''),
    list('Debug', manifest.debug, 'debug/'),
    el('h3', {}, 'Create'),
    el('div', { class: 'row' }, newId),
    el(
      'div',
      { class: 'row' },
      el('button', { class: 'ibtn', textContent: 'New', on: { click: () => void createLevel(newId.value.trim(), false) } }),
      el('button', { class: 'ibtn', textContent: 'Duplicate current', on: { click: () => void createLevel(newId.value.trim(), true) } }),
    ),
    el('div', { class: 'hint' }, 'New levels are appended to the pack.'),
  )
}

async function reorder(i: number, d: number): Promise<void> {
  const j = i + d
  if (j < 0 || j >= manifest.levels.length) return
  ;[manifest.levels[i], manifest.levels[j]] = [manifest.levels[j], manifest.levels[i]]
  await api.saveManifest(manifest)
  renderSidebar()
  flash('Pack order saved')
}

async function createLevel(id: string, duplicate: boolean): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(id)) return flash('Id must be a lowercase slug (a-z, 0-9, -)', true)
  if ([...manifest.levels, ...manifest.debug].includes(id)) return flash('That id already exists', true)
  const level: LevelData = duplicate && st.level
    ? { ...structuredClone(st.level), id, name: `${st.level.name} (copy)` }
    : {
        version: 1,
        id,
        name: id,
        field: { x: 30, y: 340, w: 340, h: 340 },
        blockers: [],
        motes: [],
        obstacles: [{ x: 200, y: 150, layers: [{ sides: 3, radius: 30, hp: 6 }] }],
        hand: [{ layers: [{ sides: 4, radius: 40, nodes: Array.from({ length: 4 }, () => ({ catch: 'red', release: 'red' })) }] }],
        goal: { type: 'clearAll' },
      }
  await api.saveLevel(id, level)
  manifest.levels.push(id)
  await api.saveManifest(manifest)
  pendingDiscard = null
  st.open(id, level)
  renderSidebar()
  flash(`Created ${id}`)
}

async function openLevel(path: string): Promise<void> {
  if (st.dirty && pendingDiscard !== path) {
    pendingDiscard = path
    return flash('Unsaved changes. Click the level again to discard them, or save first.', true)
  }
  pendingDiscard = null
  st.open(path, await api.level(path))
  renderSidebar()
}

// ---------------------------------------------------------------- toolbar
const TOOLS: [Tool, string, string][] = [
  ['select', 'Select', 'V: select / drag. Alt-click a ghost to remove it. Shift snaps to 10px.'],
  ['mote', 'Mote', 'M: click in the field to add a mote'],
  ['obstacle', 'Obstacle', 'O: click in the obstacle zone to add'],
  ['blocker', 'Blocker', 'B: drag a rectangle in the field'],
  ['ghost', 'Ghost', 'G: pin the selected hand rune (at the ghost layer) to preview its catch ring'],
]
const MOTE_COLORS: MoteColor[] = ['red', 'blue', 'gold', 'teal', 'violet', 'generic', 'null', 'void']
const randomOut = el('span', { class: 'hint' })

function renderToolbar(): void {
  const tools = TOOLS.map(([tool, label, title]) =>
    el('button', { class: `tool ${st.tool === tool ? 'on' : ''}`, textContent: label, title, on: { click: () => st.setTool(tool) } }),
  )
  const colors = MOTE_COLORS.map((c) =>
    el('button', {
      class: `chip ${st.moteColor === c ? 'on' : ''}`,
      title: c,
      style: `background:${swatch(c)}`,
      on: {
        click: () => {
          st.moteColor = c
          st.setTool('mote')
        },
      },
    }),
  )
  const ghostLayer = el('input', {
    type: 'number',
    min: '1',
    value: String(st.ghostLayer + 1),
    style: 'width:44px',
    title: 'Ghost layer (1 = outer)',
    on: { change: (e) => (st.ghostLayer = Math.max(0, Number((e.target as HTMLInputElement).value) - 1)) },
  })
  toolbar.replaceChildren(
    ...tools,
    el('span', { class: 'sep' }),
    ...colors,
    el('span', { class: 'sep' }),
    'ghost layer ',
    ghostLayer,
    el('button', { class: 'ibtn', textContent: 'Clear ghosts', on: { click: () => ((st.ghosts = []), st.emit()) } }),
    el('span', { class: 'sep' }),
    el('button', { class: 'ibtn', textContent: 'Undo', disabled: !st.canUndo, on: { click: () => st.undo() } }),
    el('button', { class: 'ibtn', textContent: 'Redo', disabled: !st.canRedo, on: { click: () => st.redo() } }),
    el('button', { class: `ibtn ${st.dirty ? 'dirty' : ''}`, textContent: st.dirty ? 'Save •' : 'Saved', on: { click: () => void save() } }),
    el('span', { class: 'sep' }),
    el('button', { class: 'ibtn primary', textContent: '▶ Playtest', on: { click: playtest } }),
    el('button', { class: 'ibtn', textContent: 'Random check', on: { click: randomCheck } }),
    randomOut,
  )
}

async function save(): Promise<void> {
  if (!st.level) return
  const errs = validateLevel(st.level)
  if (errs.length) return flash(`Not saved: ${errs.length} validation error(s)`, true)
  await api.saveLevel(st.path, st.level)
  st.markSaved()
  flash(`Saved ${st.path}.json`)
}

function randomCheck(): void {
  if (!st.level || validateLevel(st.level).length) return flash('Fix validation errors first', true)
  const level = structuredClone(st.level)
  const runs = 40
  let wins = 0
  let losses = 0
  let seed = 1
  randomOut.textContent = 'running…'
  const chunk = () => {
    for (let k = 0; k < 5 && seed <= runs; k++, seed++) {
      const r = runCareless(level, seed, 240)
      if (r.status === 'won') wins++
      else if (r.status === 'lost') losses++
    }
    randomOut.textContent = `careless: ${wins}/${seed - 1} won, ${losses} lost`
    if (seed <= runs) setTimeout(chunk, 0)
  }
  setTimeout(chunk, 0)
}

// ---------------------------------------------------------------- playtest
let playApp: Application | null = null
let scene: GameScene | null = null
let playOverlay: HTMLElement | null = null

async function playtest(): Promise<void> {
  if (!st.level || validateLevel(st.level).length) return flash('Fix validation errors first', true)
  if (!playApp) {
    playApp = new Application()
    await playApp.init({ resizeTo: window, backgroundAlpha: 1, background: 0x140a24, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true })
    playApp.canvas.classList.add('playtest-canvas')
    document.body.appendChild(playApp.canvas)
    playApp.ticker.add((t) => scene?.update(t.deltaMS / 1000))
  }
  playApp.canvas.style.display = 'block'
  root.style.display = 'none'
  const level = structuredClone(st.level)
  const end = (msg: string) => {
    playOverlay?.remove()
    playOverlay = el(
      'div',
      { class: 'play-overlay' },
      el('div', { class: 'play-msg' }, msg),
      el('button', { class: 'ibtn primary', textContent: 'Back to editor', on: { click: stopPlaytest } }),
      el('button', { class: 'ibtn', textContent: 'Play again', on: { click: () => void playtest() } }),
    )
    document.body.append(playOverlay)
  }
  scene?.destroy()
  playOverlay?.remove()
  scene = new GameScene()
  scene.mount(playApp, level, { onWon: () => end('Won'), onLost: () => end('Lost'), onMenu: stopPlaytest })
  playOverlay = el('div', { class: 'play-exit' }, el('button', { class: 'ibtn', textContent: '✕ Editor', on: { click: stopPlaytest } }))
  document.body.append(playOverlay)
}

function stopPlaytest(): void {
  scene?.destroy()
  scene = null
  playOverlay?.remove()
  playOverlay = null
  if (playApp) playApp.canvas.style.display = 'none'
  root.style.display = ''
  canvas.render()
}

// ---------------------------------------------------------------- misc
let flashTimer = 0
function flash(msg: string, bad = false): void {
  status.textContent = msg
  status.className = `status ${bad ? 'bad' : 'good'}`
  clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => (status.className = 'status'), 3500)
}

function renderErrors(): void {
  const errs = st.level ? validateLevel(st.level) : []
  errors.replaceChildren(errs.length ? el('div', { class: 'err-title' }, `${errs.length} problem(s)`) : el('div', { class: 'ok' }, 'Valid'), ...errs.map((e) => el('div', { class: 'err' }, e)))
}

window.addEventListener('keydown', (e) => {
  if (scene) return
  const t = e.target as HTMLElement
  if (t.tagName === 'INPUT' || t.tagName === 'SELECT') return
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) st.redo()
    else st.undo()
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    st.redo()
  } else if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void save()
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selection && st.selection.kind !== 'rune') {
    const s = st.selection
    st.change((l) => ({ mote: l.motes, obstacle: l.obstacles, blocker: l.blockers })[s.kind].splice(s.i, 1))
    st.select(null)
  } else if (!mod) {
    const key = { v: 'select', m: 'mote', o: 'obstacle', b: 'blocker', g: 'ghost' }[e.key.toLowerCase()] as Tool | undefined
    if (key) st.setTool(key)
  }
})
window.addEventListener('beforeunload', (e) => {
  if (st.dirty) e.preventDefault()
})

st.onChange(() => {
  // Swatches show the hues as the level's palette draws them.
  if (st.level) usePalette(st.level.palette)
  renderToolbar()
  renderInspector(inspector, st)
  renderErrors()
})

async function boot(): Promise<void> {
  try {
    manifest = await api.manifest()
  } catch {
    root.textContent = 'Level API unavailable. Run the editor with `npm run editor`.'
    return
  }
  await canvas.init()
  renderSidebar()
  const first = manifest.levels[0]
  if (first) await openLevel(first)
}
void boot()
