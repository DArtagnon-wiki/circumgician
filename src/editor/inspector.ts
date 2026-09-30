import type { Hue, LevelData, NodeSpec, PaletteName, RuneLayerSpec } from '../sim/types'
import { MAX_SIDES, MIN_SIDES } from '../sim/validate'
import { PALETTE_NAMES } from '../model/Color'
import { ANNIHILATING_COLOR, MIASMA_COLOR, PALETTES, hueColor } from '../render/Theme'
import type { EditorState } from './state'

const HUES = ['red', 'blue', 'gold', 'teal', 'violet'] as const
const MOTE_COLORS = [...HUES, 'generic'] as const
const RELEASES = [...MOTE_COLORS, 'annihilating'] as const

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0')
export const swatch = (c: string) =>
  c === 'generic' ? hex(MIASMA_COLOR) : c === 'annihilating' ? hex(ANNIHILATING_COLOR) : (HUES as readonly string[]).includes(c) ? hex(hueColor(c as Hue)) : '#2a2238'

type Props = Record<string, unknown> & { class?: string; style?: string; on?: Record<string, (e: Event) => void> }
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) e.addEventListener(ev, fn)
    else if (k === 'class') e.className = v as string
    else if (k === 'style') e.setAttribute('style', v as string)
    else (e as unknown as Record<string, unknown>)[k] = v
  }
  for (const c of children) if (c !== null) e.append(c)
  return e
}

function num(value: number, onSet: (v: number) => void, opts: { min?: number; max?: number; step?: number; width?: number } = {}) {
  return el('input', {
    type: 'number',
    value: String(value),
    min: opts.min !== undefined ? String(opts.min) : '',
    max: opts.max !== undefined ? String(opts.max) : '',
    step: String(opts.step ?? 1),
    style: `width:${opts.width ?? 56}px`,
    on: {
      change: (e) => {
        const v = Number((e.target as HTMLInputElement).value)
        if (Number.isFinite(v)) onSet(v)
      },
    },
  })
}

function colorSelect(options: readonly string[], value: string, onSet: (v: string) => void, compact = false) {
  const s = el('select', { class: compact ? 'color-select compact' : 'color-select', on: { change: (e) => onSet((e.target as HTMLSelectElement).value) } })
  for (const o of options) s.append(el('option', { value: o, textContent: compact ? o.slice(0, 3) : o, style: `background:${swatch(o)};color:#fff` }))
  s.value = value
  s.style.background = swatch(value)
  return s
}

// Each option names its palette and lists its five gems.
function paletteSelect(value: PaletteName, onSet: (v: PaletteName) => void) {
  const s = el('select', { on: { change: (e) => onSet((e.target as HTMLSelectElement).value as PaletteName) } })
  for (const p of PALETTE_NAMES) s.append(el('option', { value: p, textContent: `${p}: ${HUES.map((h) => PALETTES[p].names[h]).join(', ')}` }))
  s.value = value
  return s
}

const btn = (label: string, title: string, onClick: () => void, cls = '') => el('button', { class: `ibtn ${cls}`, textContent: label, title, on: { click: onClick } })

function move<T>(arr: T[], i: number, d: number): void {
  const j = i + d
  if (j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}

function resizeNodes(layer: RuneLayerSpec, sides: number): void {
  layer.sides = sides
  const last: NodeSpec = layer.nodes[layer.nodes.length - 1] ?? { catch: 'red', release: 'red' }
  while (layer.nodes.length < sides) layer.nodes.push({ ...last })
  layer.nodes.length = sides
}

export function newRuneLayer(sides = 4, radius = 36): RuneLayerSpec {
  return { sides, radius, nodes: Array.from({ length: sides }, () => ({ catch: 'red', release: 'red' })) }
}

// Rebuilt from state on every change (cheap at this size). Inputs commit on
// 'change' so typing is not interrupted by re-renders.
export function renderInspector(host: HTMLElement, st: EditorState): void {
  const active = document.activeElement
  if (active && host.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) return
  const scroll = host.scrollTop
  host.replaceChildren()
  const L = st.level
  if (!L) return
  const edit = (fn: (l: LevelData) => void) => st.change(fn)

  // Level
  host.append(
    el('h3', {}, 'Level'),
    el('div', { class: 'row' }, 'id ', el('code', {}, st.path)),
    el('div', { class: 'row' }, 'name ', el('input', { value: L.name, style: 'width:180px', on: { change: (e) => edit((l) => (l.name = (e.target as HTMLInputElement).value)) } })),
    el(
      'div',
      { class: 'row' },
      'field ',
      num(L.field.x, (v) => edit((l) => (l.field.x = v))),
      num(L.field.y, (v) => edit((l) => (l.field.y = v))),
      num(L.field.w, (v) => edit((l) => (l.field.w = v))),
      num(L.field.h, (v) => edit((l) => (l.field.h = v))),
    ),
    el('div', { class: 'row' }, 'palette ', paletteSelect(L.palette ?? 'jewel', (v) => edit((l) => (v === 'jewel' ? delete l.palette : (l.palette = v))))),
    el('div', { class: 'hint' }, `motes: ${L.motes.length} (${MOTE_COLORS.map((c) => `${c} ${L.motes.filter((m) => m.color === c).length}`).filter((s) => !s.endsWith(' 0')).join(', ')})`),
  )

  // Selection
  const sel = st.selection
  if (sel?.kind === 'mote' && L.motes[sel.i]) {
    const m = L.motes[sel.i]
    host.append(
      el('h3', {}, `Mote ${sel.i + 1}`),
      el('div', { class: 'row' }, 'color ', colorSelect(MOTE_COLORS, m.color, (v) => edit((l) => (l.motes[sel.i].color = v as never)))),
      el('div', { class: 'row' }, 'x/y ', num(m.x, (v) => edit((l) => (l.motes[sel.i].x = v))), num(m.y, (v) => edit((l) => (l.motes[sel.i].y = v)))),
      el('div', { class: 'row' }, 'tether ', num(m.tether ?? 8, (v) => edit((l) => (l.motes[sel.i].tether = Math.max(0, v))), { min: 0 })),
      btn('Delete mote', 'Delete', () => {
        edit((l) => l.motes.splice(sel.i, 1))
        st.select(null)
      }, 'danger'),
    )
  } else if (sel?.kind === 'blocker' && L.blockers[sel.i]) {
    const b = L.blockers[sel.i]
    host.append(
      el('h3', {}, `Blocker ${sel.i + 1}`),
      el(
        'div',
        { class: 'row' },
        num(b.x, (v) => edit((l) => (l.blockers[sel.i].x = v))),
        num(b.y, (v) => edit((l) => (l.blockers[sel.i].y = v))),
        num(b.w, (v) => edit((l) => (l.blockers[sel.i].w = v))),
        num(b.h, (v) => edit((l) => (l.blockers[sel.i].h = v))),
      ),
      btn('Delete blocker', 'Delete', () => {
        edit((l) => l.blockers.splice(sel.i, 1))
        st.select(null)
      }, 'danger'),
    )
  } else if (sel?.kind === 'obstacle' && L.obstacles[sel.i]) {
    const o = L.obstacles[sel.i]
    const box = el('div', { class: 'layers' })
    o.layers.forEach((layer, j) => {
      box.append(
        el(
          'div',
          { class: 'row' },
          el('span', { class: 'idx' }, String(j + 1)),
          'sides ',
          num(layer.sides, (v) => edit((l) => (l.obstacles[sel.i].layers[j].sides = v)), { min: MIN_SIDES, max: MAX_SIDES, width: 44 }),
          'r ',
          num(layer.radius, (v) => edit((l) => (l.obstacles[sel.i].layers[j].radius = v)), { min: 8, width: 48 }),
          'hp ',
          num(layer.hp, (v) => edit((l) => (l.obstacles[sel.i].layers[j].hp = v)), { min: 1, width: 48 }),
          btn('↑', 'Move up', () => edit((l) => move(l.obstacles[sel.i].layers, j, -1))),
          btn('↓', 'Move down', () => edit((l) => move(l.obstacles[sel.i].layers, j, 1))),
          btn('⧉', 'Duplicate', () => edit((l) => l.obstacles[sel.i].layers.splice(j + 1, 0, { ...layer }))),
          btn('✕', 'Remove', () => edit((l) => l.obstacles[sel.i].layers.splice(j, 1))),
        ),
      )
    })
    host.append(
      el('h3', {}, `Obstacle ${sel.i + 1}`),
      el('div', { class: 'row' }, 'x/y ', num(o.x, (v) => edit((l) => (l.obstacles[sel.i].x = v))), num(o.y, (v) => edit((l) => (l.obstacles[sel.i].y = v)))),
      el('div', { class: 'hint' }, 'Layers, current first:'),
      box,
      btn('+ layer', 'Add layer', () => edit((l) => l.obstacles[sel.i].layers.push({ ...(o.layers[o.layers.length - 1] ?? { sides: 3, radius: 30, hp: 6 }) }))),
      ' ',
      btn('Delete obstacle', 'Delete', () => {
        edit((l) => l.obstacles.splice(sel.i, 1))
        st.select(null)
      }, 'danger'),
    )
  }

  // Hand
  host.append(el('h3', {}, 'Hand'))
  L.hand.forEach((rune, i) => {
    const isSel = sel?.kind === 'rune' && sel.i === i
    const card = el('div', { class: `rune-card ${isSel ? 'selected' : ''}` })
    card.append(
      el(
        'div',
        { class: 'row head' },
        el('button', { class: 'ibtn', textContent: `Rune ${i + 1}`, title: 'Select (for ghost placement)', on: { click: () => st.select({ kind: 'rune', i }) } }),
        el('span', { class: 'hint' }, ` ${rune.layers.length} layers `),
        btn('↑', 'Move up', () => edit((l) => move(l.hand, i, -1))),
        btn('↓', 'Move down', () => edit((l) => move(l.hand, i, 1))),
        btn('⧉', 'Duplicate rune', () => edit((l) => l.hand.splice(i + 1, 0, structuredClone(rune)))),
        btn('✕', 'Remove rune', () => {
          edit((l) => l.hand.splice(i, 1))
          st.select(null)
        }),
      ),
    )
    rune.layers.forEach((layer, j) => {
      const nodes = el('div', { class: 'nodes' })
      layer.nodes.forEach((n, k) =>
        nodes.append(
          el(
            'div',
            { class: 'node' },
            colorSelect(HUES, n.catch, (v) => edit((l) => (l.hand[i].layers[j].nodes[k].catch = v as never)), true),
            colorSelect(RELEASES, n.release, (v) => edit((l) => (l.hand[i].layers[j].nodes[k].release = v as never)), true),
          ),
        ),
      )
      card.append(
        el(
          'div',
          { class: 'layer' },
          el(
            'div',
            { class: 'row' },
            el('span', { class: 'idx' }, j === 0 ? 'outer' : String(j + 1)),
            'sides ',
            num(layer.sides, (v) => edit((l) => resizeNodes(l.hand[i].layers[j], Math.max(MIN_SIDES, Math.min(MAX_SIDES, v)))), { min: MIN_SIDES, max: MAX_SIDES, width: 44 }),
            'r ',
            num(layer.radius, (v) => edit((l) => (l.hand[i].layers[j].radius = v)), { min: 8, width: 48 }),
            ' all: ',
            colorSelect(['–', ...HUES], '–', (v) => v !== '–' && edit((l) => l.hand[i].layers[j].nodes.forEach((n) => (n.catch = v as never))), true),
            colorSelect(['–', ...RELEASES], '–', (v) => v !== '–' && edit((l) => l.hand[i].layers[j].nodes.forEach((n) => (n.release = v as never))), true),
            btn('↑', 'Move up', () => edit((l) => move(l.hand[i].layers, j, -1))),
            btn('↓', 'Move down', () => edit((l) => move(l.hand[i].layers, j, 1))),
            btn('⧉', 'Duplicate layer', () => edit((l) => l.hand[i].layers.splice(j + 1, 0, structuredClone(layer)))),
            btn('✕', 'Remove layer', () => edit((l) => l.hand[i].layers.splice(j, 1))),
          ),
          nodes,
        ),
      )
    })
    card.append(btn('+ layer', 'Add layer', () => edit((l) => l.hand[i].layers.push(structuredClone(rune.layers[rune.layers.length - 1] ?? newRuneLayer())))))
    host.append(card)
  })
  host.append(btn('+ rune', 'Add rune', () => edit((l) => l.hand.push({ layers: [newRuneLayer(4, 40), newRuneLayer(3, 30)] }))))
  host.scrollTop = scroll
}
