import type { Hue, LevelData, MoteColor, RuneLayerSpec } from './types'
import { holdsShield } from '../model/Color'

// Economy solver: plays out a level's arithmetic exhaustively, with geometry
// abstracted away. Kicks let a player herd motes almost anywhere, and where
// a piece is cast decides which matching obstacle it links to, so both are
// treated as free choices. What remains is exactly what rules.ts enforces:
//   - casting a rune's layer puts it on the field as a piece and brings the
//     next layer into hand; the stack's last entry is never cast, it is the
//     shape the layer above it strikes;
//   - a detonation deals the piece's power (the motes it holds that count)
//     in damage to an obstacle whose
//     current layer has as many sides as the piece's energy (the stack's
//     next entry); with no such obstacle it is unlinked and deals none;
//   - damage never carries into the next layer: the excess is wasted;
//   - every caught mote is released recolored by its node, except at
//     'annihilating' nodes, which destroy theirs;
//   - generic (opal) motes fill any node; so do nulls and voids, which add
//     nothing to the blow (a void is released as a void, whatever the
//     node's color; a null takes the node's color like any mote);
//   - prefilled nodes start full (a mote of their own color, a null or a
//     void) and release it like any other;
//   - ice (the level's blocks, and pieces frozen by frost) is struck like
//     an obstacle of one layer, by energy of its shape; broken, it frees
//     the motes locked inside. It never counts toward the win;
//   - a blow that leaves a frost layer standing still lands, but the piece
//     freezes into ice of its own shape (strength its sides) holding its
//     released motes; when that layer falls, all the ice it froze thaws;
//   - a two-shape layer is struck only by a pair: a full piece of each of
//     its shapes goes into stasis on it (one per shape), and the two burst
//     together as one blow of their combined power. A piece whose shape
//     matches only two-shape layers whose place for it is held goes
//     unlinked, as in the game;
//   - nothing strikes a layer while any of its shields is up: a piece of
//     its shape waits for them to fall. A piece with bowls of a shield's
//     color latches on as a puller (full, or cast with only its bowls of
//     the shields' colors filled, the rest to fill later); a shield is down
//     once its pullers hold its strength in its color. Ash cups don't pull.
//     Pullers can't burst until the layer falls, and then go free.
// A move is one of
//   fill Rn.k      fill layer k of rune n from the free motes (`fill Rn.k ..nv`
//                  when some of its bowls take a null or a void). If k is still
//                  in hand, it is cast first, and any layers above it are
//                  cast as empty pieces (digging down to it)
//   Rn.k->Om       detonate that full piece into obstacle m
//   Rn.k->Im       ...or into ice m (the level's first, then frozen pieces
//                  in the order they froze)
//   Rn.k unlinked  detonate it with nothing to hit
//   Rn.k=>Om       put that full piece in stasis on obstacle m's two-shape
//                  layer, holding its shape's place
//   Rn.k+Rp.q->Om  burst two pieces in stasis there as one blow
//   pull Rn.k=>Om  latch layer k of rune n onto obstacle m's shields: a full
//                  piece as it is, or else cast (digging as a fill does)
//                  with its bowls of the colors still up there filled
// Casting an empty piece only matters for what it uncovers, so it happens
// inside the fill that needs it. Room on the field is the one limit on
// digging: `maxPlaced` caps the pieces on the field at once. The default,
// DEFAULT_ROOM, is about what a field holds; without any cap a rune's stack
// is effectively an unordered bag of layers, and deep stacks explode.
// In a level with a fuse, pieces burn unless they are filled and burst in
// time, so digging burns the layers above (their strikes are lost, and they
// take no room); a stack is then a queue whose layers can be skipped. (A
// full piece left to burn is a mistake, like a stray catch; it is not a
// move.)
// Curated levels are small, so the search is exhaustive and memoized, and
// the profile below (plans, decisions, traps) is exact for this model.
// Whether the geometry allows a plan (room on the field, which motes a ring
// can reach) is checked in the real sim by the scripted lines in
// src/data/levels/solutions.test.ts.

export const ECONOMY_COLORS: readonly MoteColor[] = ['red', 'blue', 'gold', 'teal', 'violet', 'generic', 'null', 'void']
const GENERIC = ECONOMY_COLORS.indexOf('generic')
const NULL = ECONOMY_COLORS.indexOf('null')
const VOID = ECONOMY_COLORS.indexOf('void')

export interface EconomyPiece {
  rune: number
  layer: number
  full: boolean
  // Once full, what each bowl holds when not a mote that counts: 'n' a null,
  // 'v' a void, '.' otherwise. Omitted when every bowl counts.
  blanks?: string
  locked?: number // in stasis on this obstacle's two-shape layer
  pulling?: number // latched onto this obstacle's shields
  // Not full, but holding: per bowl '.' a mote that counts, 'n' a null,
  // 'v' a void, '_' nothing yet (a puller cast with only its shields'
  // colors). Omitted for an empty piece.
  hold?: string
}

// A block of ice, as the game creates them: the level's, then each piece a
// frost layer froze.
export interface EconomyIce {
  sides: number
  hp: number // 0 once broken or thawed
  motes: number[] // locked inside, per color
  by: [obstacle: number, layer: number] | null // the frost layer that froze it
}

export interface Economy {
  pool: number[] // free motes per color, in ECONOMY_COLORS order
  hand: number[] // per rune, the layer in hand (layers above it were cast)
  pieces: EconomyPiece[] // cast and not yet detonated, sorted by rune then layer
  obstacles: { index: number; hp: number }[] // index past the last layer = cleared
  ice: EconomyIce[]
  burned?: number // layers burned by digging (levels with a fuse)
}

// A fire's target indexes the obstacles, or the ice when `ice` is set; a
// pair's fire names its second piece in `with`. A fill's `blanks` says which
// bowls took a null or a void (see EconomyPiece).
export type Move =
  | { kind: 'fill'; rune: number; layer: number; blanks?: string }
  | { kind: 'lock'; rune: number; layer: number; target: number }
  | { kind: 'pull'; rune: number; layer: number; target: number }
  | { kind: 'fire'; rune: number; layer: number; target: number | null; ice?: boolean; with?: { rune: number; layer: number } }

// One detonation (a pair's counts once), counted the way the result screen
// counts it.
export interface Blow {
  rune: number
  layer: number // stack layer that detonated
  with?: { rune: number; layer: number } // a pair's second piece
  target: number | null // obstacle (or ice) hit, null when unlinked
  ice?: boolean // the target is ice
  targetLayer: number // obstacle layer hit (-1 when unlinked)
  damage: number // HP removed
  wasted: number // damage past the layer's remaining HP
  unlinked: boolean // nothing matched its energy: its damage went nowhere
}

export interface Transition {
  move: Move
  next: Economy
  blow?: Blow // fires only
}

export interface SolverOptions {
  maxPlaced?: number // at most this many pieces on the field at once (room); Infinity for no limit
  maxStates?: number // give up (throw) past this many distinct states
  blocked?: ReadonlySet<string> // layers ("rune.layer") that cannot be filled or pulled: to ask whether a level needs one
}

export const DEFAULT_ROOM = 5
const DEFAULT_MAX_STATES = 2_000_000
const room = (opts: SolverOptions) => opts.maxPlaced ?? DEFAULT_ROOM

// Layers a rune can cast: every stack entry but the last.
const castable = (level: LevelData, rune: number) => level.hand[rune].layers.length - 1

const tally = (colors: MoteColor[]) => {
  const n = ECONOMY_COLORS.map(() => 0)
  for (const c of colors) n[ECONOMY_COLORS.indexOf(c)]++
  return n
}
const plus = (a: number[], b: number[]) => a.map((v, i) => v + b[i])

export function initialEconomy(level: LevelData): Economy {
  return {
    pool: tally(level.motes.map((m) => m.color)),
    hand: level.hand.map(() => 0),
    pieces: [],
    obstacles: level.obstacles.map((o) => ({ index: 0, hp: o.layers[0]?.hp ?? 0 })),
    ice: (level.ice ?? []).map((b) => ({ sides: b.sides, hp: b.hp ?? b.sides, motes: tally(b.motes ?? []), by: null })),
  }
}

// Every layer not yet detonated is 'open' (in hand, or an empty piece),
// 'full', or 'fired'.
function status(s: Economy, rune: number, layer: number): 'open' | 'full' | 'fired' {
  if (layer >= s.hand[rune]) return 'open'
  const p = s.pieces.find((x) => x.rune === rune && x.layer === layer)
  return !p ? 'fired' : p.full ? 'full' : 'open'
}

// With room for everything, a layer in hand and an empty piece on the field
// are interchangeable (either can be filled next, and nothing else
// distinguishes them), so the key names each layer's status alone. With a
// cap, which layers are already on the field matters too.
export function economyKey(level: LevelData, s: Economy, opts: SolverOptions = {}): string {
  const ice = s.ice.map((b) => (b.hp ? `${b.sides}:${b.hp}:${b.motes.join('.')}${b.by ? `<${b.by.join('.')}` : ''}` : 'x')).join(',')
  const obs = `${s.obstacles.map((o) => `${o.index}:${o.hp}`).join(',')}|${ice}${s.burned ? `|b${s.burned}` : ''}`
  if (room(opts) === Infinity) {
    const mark = (r: number, k: number) => {
      const st = status(s, r, k)
      if (st === 'fired') return 'x'
      const p = s.pieces.find((q) => q.rune === r && q.layer === k)
      if (st === 'open' && !p?.hold) return 'o'
      return `${p!.full ? `F${p!.blanks ?? ''}` : `H${p!.hold}`}${latch(p!)};`
    }
    const layers = level.hand.map((_, r) => Array.from({ length: castable(level, r) }, (_, k) => mark(r, k)).join('')).join(',')
    return `${s.pool.join(',')}|${layers}|${obs}`
  }
  const piece = (p: EconomyPiece) => `${p.rune}.${p.layer}${p.full ? `f${p.blanks ?? ''}` : p.hold ? `h${p.hold}` : ''}${latch(p)}`
  return `${s.pool.join(',')}|${s.hand.join(',')}|${s.pieces.map(piece).join(',')}|${obs}`
}

const latch = (p: EconomyPiece) => `${p.locked === undefined ? '' : `@${p.locked}`}${p.pulling === undefined ? '' : `^${p.pulling}`}`

export function economyWon(level: LevelData, s: Economy): boolean {
  return s.obstacles.every((o, i) => o.index >= level.obstacles[i].layers.length)
}

// Per obstacle shape, can the layers not yet detonated still deal the HP
// left? When not, no win remains (the solver prunes there), though the
// game plays on until nothing can move. A two-shape layer takes its HP from
// both its shapes, which must also cover their own layers.
export function damageShort(level: LevelData, s: Economy): boolean {
  const need = new Map<number, number>()
  const pairs = new Map<string, number>() // two-shape layers' HP, by 'a+b'
  s.obstacles.forEach((o, oi) => {
    const layers = level.obstacles[oi].layers
    for (let i = o.index; i < layers.length; i++) {
      const { sides, pair } = layers[i]
      const hp = i === o.index ? o.hp : layers[i].hp
      if (pair === undefined) need.set(sides, (need.get(sides) ?? 0) + hp)
      else {
        const key = `${Math.min(sides, pair)}+${Math.max(sides, pair)}`
        pairs.set(key, (pairs.get(key) ?? 0) + hp)
      }
    }
  })
  const can = new Map<number, number>()
  const add = (rune: number, layer: number) => {
    const layers = level.hand[rune].layers
    can.set(layers[layer + 1].sides, (can.get(layers[layer + 1].sides) ?? 0) + mostPower(layers[layer]))
  }
  for (const p of s.pieces) add(p.rune, p.layer)
  s.hand.forEach((index, r) => {
    for (let k = index; k < castable(level, r); k++) add(r, k)
  })
  for (const [sides, hp] of need) if ((can.get(sides) ?? 0) < hp) return true
  for (const [key, hp] of pairs) {
    const [a, b] = key.split('+').map(Number)
    if ((can.get(a) ?? 0) + (can.get(b) ?? 0) < (need.get(a) ?? 0) + (need.get(b) ?? 0) + hp) return true
  }
  return false
}

// The most a layer can strike for: every bowl but those prefilled with a
// null or a void.
const mostPower = (spec: RuneLayerSpec) => spec.nodes.filter((n) => n.prefilled !== 'null' && n.prefilled !== 'void').length

// What each bowl holds before a filling ('.', 'n' or 'v'; null when it is
// empty): a prefilled bowl its mote, and a partly held piece's bowls what
// they hold.
function heldMarks(spec: RuneLayerSpec, hold?: string): (string | null)[] {
  return spec.nodes.map((n, i) => {
    if (hold) return hold[i] === '_' ? null : hold[i]
    return n.prefilled === 'null' ? 'n' : n.prefilled === 'void' ? 'v' : n.prefilled ? '.' : null
  })
}

// Empty bowls that are interchangeable in the economy: same catch, same
// release. Blanks are written canonically within each group (motes that
// count first, then nulls, then voids, in node order), so the same filling
// always reads the same.
function bowlGroups(spec: RuneLayerSpec, marks: (string | null)[]): number[][] {
  const groups = new Map<string, number[]>()
  spec.nodes.forEach((n, i) => {
    if (marks[i] !== null) return
    const key = `${n.catch}|${n.release}`
    groups.set(key, [...(groups.get(key) ?? []), i])
  })
  return [...groups.values()]
}

// The blanks string for a filling, from each group's null and void counts.
function writeBlanks(marks: (string | null)[], groups: number[][], counts: [number, number][]): string {
  const out = marks.map((m) => m ?? '.')
  groups.forEach((g, gi) => {
    const [u, v] = counts[gi]
    g.forEach((node, k) => (out[node] = k < g.length - u - v ? '.' : k < g.length - v ? 'n' : 'v'))
  })
  return out.join('')
}

// The same canonical form for bowls a real run filled one way or another
// (per node: '.', 'n' or 'v'), so its moves read like the solver's.
export function canonicalBlanks(spec: RuneLayerSpec, perNode: string): string {
  const marks = heldMarks(spec)
  const groups = bowlGroups(spec, marks)
  return writeBlanks(
    marks,
    groups,
    groups.map((g) => [g.filter((i) => perNode[i] === 'n').length, g.filter((i) => perNode[i] === 'v').length]),
  )
}

// Every way to fill a layer's empty bowls from the pool: each group of
// alike bowls takes some nulls and voids, and the rest take their own
// color, opal covering the shortfall. (Opal before the own color is never
// better: a release takes its bowl's color, not the mote's.) Prefilled
// bowls, and those a partly held piece holds, take nothing. Without nulls
// or voids in the pool there is exactly one way, or none.
function fillings(spec: RuneLayerSpec, pool: number[], hold?: string): { pool: number[]; blanks: string }[] {
  const marks = heldMarks(spec, hold)
  const groups = bowlGroups(spec, marks)
  const out: { pool: number[]; blanks: string }[] = []
  const counts: [number, number][] = []
  const walk = (gi: number, nulls: number, voids: number) => {
    if (gi === groups.length) {
      const next = [...pool]
      next[NULL] -= nulls
      next[VOID] -= voids
      const need = new Map<number, number>()
      groups.forEach((g, i) => {
        const real = g.length - counts[i][0] - counts[i][1]
        const c = ECONOMY_COLORS.indexOf(spec.nodes[g[0]].catch)
        need.set(c, (need.get(c) ?? 0) + real)
      })
      for (const [c, n] of need) {
        const exact = Math.min(n, next[c])
        next[c] -= exact
        next[GENERIC] -= n - exact
      }
      if (next[GENERIC] < 0) return
      out.push({ pool: next, blanks: writeBlanks(marks, groups, counts) })
      return
    }
    const size = groups[gi].length
    for (let u = 0; u <= Math.min(size, pool[NULL] - nulls); u++)
      for (let v = 0; v <= Math.min(size - u, pool[VOID] - voids); v++) {
        counts[gi] = [u, v]
        walk(gi + 1, nulls + u, voids + v)
      }
  }
  walk(0, 0, 0)
  return out
}

const byRuneLayer = (a: EconomyPiece, b: EconomyPiece) => a.rune - b.rune || a.layer - b.layer

// Where a layer's piece goes: in place of its piece on the field, or cast
// from hand, digging down to it (the layers above go down as empty pieces
// or, in a level with a fuse, burn away). Null if it can't.
function placeFor(level: LevelData, s: Economy, rune: number, layer: number, opts: SolverOptions): { hand: number[]; burned: number; put: (piece: EconomyPiece) => EconomyPiece[] } | null {
  const onField = s.pieces.findIndex((p) => p.rune === rune && p.layer === layer)
  const hand = [...s.hand]
  let burned = s.burned ?? 0
  if (onField >= 0) return { hand, burned, put: (piece) => s.pieces.map((p, i) => (i === onField ? piece : p)) }
  if (layer < s.hand[rune] || layer >= castable(level, rune)) return null
  const cast = layer - s.hand[rune] + 1
  const burns = level.fuse !== undefined
  if (s.pieces.length + (burns ? 1 : cast) > room(opts)) return null
  const dug = burns ? [] : Array.from({ length: cast - 1 }, (_, i) => ({ rune, layer: s.hand[rune] + i, full: false }))
  hand[rune] = layer + 1
  if (burns) burned += cast - 1
  return { hand, burned, put: (piece) => [...s.pieces, ...dug, piece].sort(byRuneLayer) }
}

function fill(level: LevelData, s: Economy, rune: number, layer: number, opts: SolverOptions): Transition[] {
  const spec = level.hand[rune].layers[layer]
  const current = s.pieces.find((p) => p.rune === rune && p.layer === layer)
  if (current?.full) return []
  const ways = fillings(spec, s.pool, current?.hold)
  const at = ways.length ? placeFor(level, s, rune, layer, opts) : null
  if (!at) return []
  // A puller stays latched on.
  const piece = (blanks: string): EconomyPiece => ({ rune, layer, full: true, ...(/[nv]/.test(blanks) ? { blanks } : {}), ...(current?.pulling === undefined ? {} : { pulling: current.pulling }) })
  return ways.map(({ pool, blanks }) => ({
    move: { kind: 'fill', rune, layer, ...(/[nv]/.test(blanks) ? { blanks } : {}) },
    next: { pool, hand: at.hand, pieces: at.put(piece(blanks)), obstacles: s.obstacles, ice: s.ice, ...(at.burned ? { burned: at.burned } : {}) },
  }))
}

// A piece's pull on a shield of this color: its bowls of that color (ash
// cups aside) that hold a mote that counts.
function pullOf(level: LevelData, p: EconomyPiece, color: Hue): number {
  const marks = p.full ? (p.blanks ?? '') : (p.hold ?? '')
  return level.hand[p.rune].layers[p.layer].nodes.filter((n, i) => holdsShield(n, color) && (marks[i] ?? (p.full ? '.' : '_')) === '.').length
}

// The colors of obstacle oi's shields still up: short of their strength in
// what its pullers hold.
function upColors(level: LevelData, s: Economy, oi: number): Hue[] {
  const shields = level.obstacles[oi].layers[s.obstacles[oi].index]?.shields ?? []
  return shields.filter((sh) => s.pieces.reduce((n, p) => (p.pulling === oi ? n + pullOf(level, p, sh.color) : n), 0) < sh.strength).map((sh) => sh.color)
}

// Latches layer k of rune n onto obstacle `target`'s shields: a full piece
// as it is; otherwise cast (or an empty piece on the field) with only its
// bowls of the colors still up there filled, their own color first, opal
// covering the shortfall.
function pull(level: LevelData, s: Economy, rune: number, layer: number, target: number, opts: SolverOptions): Transition[] {
  const move: Move = { kind: 'pull', rune, layer, target }
  const current = s.pieces.find((p) => p.rune === rune && p.layer === layer)
  if (current?.full) return [{ move, next: { ...s, pieces: s.pieces.map((p) => (p === current ? { ...p, pulling: target } : p)) } }]
  if (current?.hold) return []
  const spec = level.hand[rune].layers[layer]
  const up = new Set<string>(upColors(level, s, target))
  const marks = heldMarks(spec)
  const pool = [...s.pool]
  const hold = spec.nodes.map((n, i) => {
    if (marks[i] !== null) return marks[i]
    if (!up.has(n.catch) || !holdsShield(n, n.catch)) return '_'
    const c = ECONOMY_COLORS.indexOf(n.catch)
    if (pool[c] > 0) pool[c]--
    else pool[GENERIC]--
    return '.'
  })
  if (pool[GENERIC] < 0) return []
  const at = placeFor(level, s, rune, layer, opts)
  if (!at) return []
  const held = hold.join('')
  const full = !held.includes('_')
  const piece: EconomyPiece = { rune, layer, full, pulling: target, ...(full ? (/[nv]/.test(held) ? { blanks: held } : {}) : { hold: held }) }
  return [{ move, next: { pool, hand: at.hand, pieces: at.put(piece), obstacles: s.obstacles, ice: s.ice, ...(at.burned ? { burned: at.burned } : {}) } }]
}

// Bursts a full piece, or a pair in stasis as one blow of their combined
// power.
function fire(level: LevelData, s: Economy, pieces: EconomyPiece[], target: number | null, ice = false): Transition {
  const [first, second] = pieces
  const { rune, layer } = first
  const outer = level.hand[rune].layers[layer]
  let power = 0
  let released = ECONOMY_COLORS.map(() => 0)
  for (const p of pieces) {
    const spec = level.hand[p.rune].layers[p.layer]
    const blanks = p.blanks ?? ''
    power += spec.sides - (blanks.match(/[nv]/g)?.length ?? 0)
    // Ash takes whatever it holds; a void comes out a void; the rest take
    // their bowl's color.
    released = plus(released, tally(spec.nodes.flatMap((n, i) => (n.release === 'annihilating' ? [] : [blanks[i] === 'v' ? 'void' : n.release]))))
  }
  const partner = second ? { with: { rune: second.rune, layer: second.layer } } : {}
  let pool = s.pool
  let blocks = s.ice
  const obstacles = s.obstacles.map((o) => ({ ...o }))
  const blow: Blow = { rune, layer, ...partner, target, ...(ice ? { ice } : {}), targetLayer: -1, damage: 0, wasted: 0, unlinked: target === null }
  let frozen = false
  let broke = false
  const strike = (hp: number) => {
    blow.damage = Math.min(hp, power)
    blow.wasted = power - blow.damage
    return hp - blow.damage
  }
  if (target !== null && ice) {
    const b = { ...s.ice[target] }
    blow.targetLayer = 0
    b.hp = strike(b.hp)
    if (b.hp === 0) {
      pool = plus(pool, b.motes)
      b.motes = b.motes.map(() => 0)
    }
    blocks = s.ice.map((x, i) => (i === target ? b : x))
  } else if (target !== null) {
    const o = obstacles[target]
    const spec = level.obstacles[target].layers[o.index]
    blow.targetLayer = o.index
    if (spec.frost && !second && power < o.hp) {
      // Frostbitten: the piece freezes, holding what it released.
      frozen = true
      blocks = [...blocks, { sides: outer.sides, hp: outer.sides, motes: released, by: [target, o.index] }]
    }
    o.hp = strike(o.hp)
    if (o.hp === 0) {
      if (spec.frost) {
        // The frost layer falls: everything it froze thaws.
        blocks = blocks.map((b) => {
          if (!b.hp || b.by?.[0] !== target || b.by[1] !== o.index) return b
          pool = plus(pool, b.motes)
          return { ...b, hp: 0, motes: b.motes.map(() => 0) }
        })
      }
      o.index++
      o.hp = level.obstacles[target].layers[o.index]?.hp ?? 0
      broke = true
    }
  }
  if (!frozen) pool = plus(pool, released)
  // The layer's pullers go free when it falls.
  const left = s.pieces.filter((p) => !pieces.includes(p)).map((p) => (broke && p.pulling === target ? unlatched(p) : p))
  return { move: { kind: 'fire', rune, layer, target, ...(ice ? { ice } : {}), ...partner }, next: { pool, hand: s.hand, pieces: left, obstacles, ice: blocks, ...(s.burned ? { burned: s.burned } : {}) }, blow }
}

function unlatched(p: EconomyPiece): EconomyPiece {
  const free = { ...p }
  delete free.pulling
  return free
}

// A full piece takes up stasis on obstacle `target`'s two-shape layer.
function lock(s: Economy, piece: EconomyPiece, target: number): Transition {
  return { move: { kind: 'lock', rune: piece.rune, layer: piece.layer, target }, next: { ...s, pieces: s.pieces.map((p) => (p === piece ? { ...p, locked: target } : p)) } }
}

// Every legal move from s.
export function transitions(level: LevelData, s: Economy, opts: SolverOptions = {}): Transition[] {
  const out: Transition[] = []
  // A layer can pull where a shield it has a bowl for (not an ash cup) is
  // still up.
  const up = s.obstacles.map((_, oi) => upColors(level, s, oi))
  const pullsAt = (spec: RuneLayerSpec) => up.flatMap((colors, oi) => (colors.some((c) => spec.nodes.some((n) => holdsShield(n, c))) ? [oi] : []))
  level.hand.forEach((hand, r) => {
    for (let k = 0; k < castable(level, r); k++) {
      if (status(s, r, k) !== 'open' || opts.blocked?.has(`${r}.${k}`)) continue
      out.push(...fill(level, s, r, k, opts))
      for (const oi of pullsAt(hand.layers[k])) out.push(...pull(level, s, r, k, oi, opts))
    }
  })
  const shapeOf = (p: EconomyPiece) => level.hand[p.rune].layers[p.layer + 1].sides
  const current = (oi: number) => level.obstacles[oi].layers[s.obstacles[oi].index]
  for (const p of s.pieces) {
    // A puller can't burst until its layer falls.
    if (!p.full || p.pulling !== undefined) continue
    const sides = shapeOf(p)
    if (p.locked !== undefined) {
      // In stasis it bursts only with its partner (each pair once, from its
      // earlier piece).
      for (const q of s.pieces) if (q.locked === p.locked && byRuneLayer(p, q) < 0 && shapeOf(q) !== sides) out.push(fire(level, s, [p, q], p.locked))
      continue
    }
    // A piece links to whichever match is nearest, so any of them can be
    // chosen by where it is cast; none means unlinked. A two-shape layer
    // matches while its place for this shape is free.
    const matches = s.obstacles.flatMap((_, oi) => (current(oi)?.pair === undefined && current(oi)?.sides === sides ? [oi] : []))
    // A layer behind shields holds its strikers until the shields fall.
    const targets = matches.filter((oi) => !up[oi].length)
    const blocks = s.ice.flatMap((b, bi) => (b.hp > 0 && b.sides === sides ? [bi] : []))
    const stases = s.obstacles.flatMap((_, oi) => {
      const spec = current(oi)
      if (spec?.pair === undefined || (spec.sides !== sides && spec.pair !== sides)) return []
      return s.pieces.some((q) => q.locked === oi && shapeOf(q) === sides) ? [] : [oi]
    })
    const latches = pullsAt(level.hand[p.rune].layers[p.layer])
    for (const target of targets) out.push(fire(level, s, [p], target))
    for (const target of blocks) out.push(fire(level, s, [p], target, true))
    for (const target of stases) out.push(lock(s, p, target))
    for (const target of latches) out.push(...pull(level, s, p.rune, p.layer, target, opts))
    if (!matches.length && !blocks.length && !stases.length && !latches.length) out.push(fire(level, s, [p], null))
  }
  return out
}

// The game's loss test (progress.ts), as far as the model can see it:
// nothing to do. (A full piece can always burst, unless it waits in stasis
// for a partner.)
export function economyLost(level: LevelData, s: Economy, opts: SolverOptions = {}): boolean {
  if (economyWon(level, s)) return false
  return !transitions(level, s, opts).length
}

export function moveLabel(m: Move): string {
  if (m.kind === 'fill') return `fill R${m.rune}.${m.layer}${m.blanks ? ` ${m.blanks}` : ''}`
  if (m.kind === 'lock') return `R${m.rune}.${m.layer}=>O${m.target}`
  if (m.kind === 'pull') return `pull R${m.rune}.${m.layer}=>O${m.target}`
  const who = `R${m.rune}.${m.layer}${m.with ? `+R${m.with.rune}.${m.with.layer}` : ''}`
  return m.target === null ? `${who} unlinked` : `${who}->${m.ice ? 'I' : 'O'}${m.target}`
}

// Memoized questions about one level's states. Every move fills a layer or
// detonates one, so the state graph has no cycles.
export class EconomySolver {
  readonly level: LevelData
  readonly opts: SolverOptions
  private readonly winMemo = new Map<string, boolean>()
  private readonly revealMemo = new Map<string, number>()
  private readonly luckMemo = new Map<string, number>()
  private readonly wasteMemo = new Map<string, number>()

  constructor(level: LevelData, opts: SolverOptions = {}) {
    this.level = level
    this.opts = opts
  }

  key(s: Economy): string {
    return economyKey(this.level, s, this.opts)
  }

  moves(s: Economy): Transition[] {
    return transitions(this.level, s, this.opts)
  }

  private memo<T>(cache: Map<string, T>, s: Economy, compute: () => T): T {
    const k = this.key(s)
    let v = cache.get(k)
    if (v === undefined) {
      if (cache.size >= (this.opts.maxStates ?? DEFAULT_MAX_STATES)) throw new Error(`${this.level.id}: more than ${cache.size} states; analyze with less room (maxPlaced)`)
      v = compute()
      cache.set(k, v)
    }
    return v
  }

  // Can some sequence of moves from s still clear every obstacle?
  canWin(s: Economy): boolean {
    if (economyWon(this.level, s)) return true
    if (damageShort(this.level, s)) return false
    return this.memo(this.winMemo, s, () => this.moves(s).some((t) => this.canWin(t.next)))
  }

  // For a state that can no longer win: the most moves a player can still
  // make before the loss is plain to see (0 = at once): too little damage
  // left for what stands, or nothing left to do. (The game itself plays on
  // until nothing can move; this is when an attentive player could tell.)
  revealDepth(s: Economy): number {
    if (economyLost(this.level, s, this.opts) || economyWon(this.level, s) || damageShort(this.level, s)) return 0
    return this.memo(this.revealMemo, s, () => this.moves(s).reduce((d, t) => Math.max(d, 1 + this.revealDepth(t.next)), 0))
  }

  // The fewest blows any win from s must waste (Infinity if none can win).
  minWaste(s: Economy): number {
    if (economyWon(this.level, s)) return 0
    if (!this.canWin(s)) return Infinity
    return this.memo(this.wasteMemo, s, () => this.moves(s).reduce((w, t) => Math.min(w, (t.blow?.wasted ?? 0) + this.minWaste(t.next)), Infinity))
  }

  // Chance that a player picking uniformly among the legal moves wins.
  blindLuck(s: Economy): number {
    if (economyWon(this.level, s)) return 1
    if (damageShort(this.level, s)) return 0
    return this.memo(this.luckMemo, s, () => {
      const ms = this.moves(s)
      return ms.length ? ms.reduce((sum, t) => sum + this.blindLuck(t.next), 0) / ms.length : 0
    })
  }

  // How tense a winnable state is (see Tension).
  tension(s: Economy): Tension {
    const all = this.moves(s)
    // With a fuse, digging burns the layers above: a slow, deliberate
    // sacrifice rather than a choice among the moves at hand, so peril
    // counts the others. With nothing else to do, the burns are the choice.
    const others = this.level.fuse === undefined ? all : all.filter((t) => !((t.move.kind === 'fill' || t.move.kind === 'pull') && t.move.layer > s.hand[t.move.rune]))
    const ms = others.length ? others : all
    const losing = ms.filter((t) => !this.canWin(t.next)).length
    let margin = Infinity
    let tight: MoteColor | null = null
    s.pool.forEach((n, c) => {
      let spare = 0
      while (spare < n && this.canWin(without(s, c, spare + 1))) spare++
      // A color a win can do without entirely doesn't count.
      if (spare < n && spare < margin) {
        margin = spare
        tight = ECONOMY_COLORS[c]
      }
    })
    const peril = ms.length ? losing / ms.length : 0
    const scarcity = 1 / (1 + margin)
    return { tension: 1 - (1 - peril) * (1 - scarcity), peril, losing, moves: ms.length, scarcity, margin, tight, luck: this.blindLuck(s) }
  }
}

const without = (s: Economy, color: number, n: number): Economy => ({ ...s, pool: s.pool.map((v, i) => (i === color ? v - n : v)) })

// Tension, for pacing a level: what a player feels at a state on a winning
// line, from two pressures, each 0..1.
//   peril     the share of the legal moves here that lose (the win is gone
//             after them, whether or not the game says so yet);
//   scarcity  how little can be spared: 1 / (1 + margin), where margin is
//             the most free motes of the tightest color that could go
//             missing (a stray catch, an annihilation) with a win still
//             possible. Exactly enough of a color is 1; colors a win can do
//             without don't count; nothing tight is 0.
// tension = 1 - (1 - peril)(1 - scarcity): either pressure alone can max it.
// Levels should ebb and flow: build toward a crunch, release, build again.
export interface Tension {
  tension: number
  peril: number
  losing: number
  moves: number
  scarcity: number
  margin: number // Infinity when no color is tight
  tight: MoteColor | null // the color with the least to spare
  luck: number // blindLuck from here, for reference
}

export interface TensionPoint {
  after: Move | null // the move that led here (null: the start)
  tension: Tension
}

// Tension along a line of moves (a real run's, say): at the start and after
// each detonation, the beats of a level. (Right after a fill, the motes it
// needed are locked in the piece and nothing is at risk for a moment; that
// says little about the level's arc.) Null if a move is impossible in the
// model; the line need not win, but tension only means something while a
// win is possible.
export function tensionAlong(level: LevelData, moves: Move[], opts: SolverOptions = {}): TensionPoint[] | null {
  const solver = new EconomySolver(level, opts)
  let s = initialEconomy(level)
  const out: TensionPoint[] = [{ after: null, tension: solver.tension(s) }]
  for (const m of moves) {
    const t = solver.moves(s).find((x) => moveLabel(x.move) === moveLabel(m))
    if (!t) return null
    s = t.next
    if (m.kind === 'fire') out.push({ after: m, tension: solver.tension(s) })
  }
  return out
}

// Tension across every winning line at once, to check that a moment is
// tense whatever path led to it. States are banded by depth, the moves made
// so far (a fill or a detonation is one move each). With a fuse, a full
// piece can only wait a moment, so only the settled states between blows
// (nothing full on the field) are banded.
export interface TensionBand {
  depth: number
  states: number // winning-line states at this depth
  min: number // the calmest of them
  mean: number
  max: number
  minPeril: number
}

export interface TensionBands {
  bands: TensionBand[]
  fewestMoves: number // the shortest win
  mostMoves: number // the longest win
}

// Moves made so far: two per detonation, one per piece waiting full or
// partly held (a dig that burned layers is one move, however many it
// burned).
export function economyDepth(s: Economy): number {
  const fired = s.hand.reduce((a, b) => a + b, 0) - s.pieces.length - (s.burned ?? 0)
  return 2 * fired + s.pieces.filter((p) => p.full || p.hold).length
}

export function tensionBands(level: LevelData, opts: SolverOptions = {}): TensionBands {
  const solver = new EconomySolver(level, opts)
  const start = initialEconomy(level)
  const bands = new Map<number, TensionBand>()
  const fewest = new Map<string, number>()
  const most = new Map<string, number>()
  // Returns [fewest, most] moves to a win from s; s is on a winning line.
  const walk = (s: Economy): [number, number] => {
    if (economyWon(level, s)) return [0, 0]
    const k = solver.key(s)
    const known = fewest.get(k)
    if (known !== undefined) return [known, most.get(k)!]
    if (level.fuse === undefined || !s.pieces.some((p) => p.full && p.locked === undefined && p.pulling === undefined)) {
      const t = solver.tension(s)
      const d = economyDepth(s)
      const b = bands.get(d) ?? { depth: d, states: 0, min: 1, mean: 0, max: 0, minPeril: 1 }
      b.mean = (b.mean * b.states + t.tension) / (b.states + 1)
      b.states++
      b.min = Math.min(b.min, t.tension)
      b.max = Math.max(b.max, t.tension)
      b.minPeril = Math.min(b.minPeril, t.peril)
      bands.set(d, b)
    }
    let lo = Infinity
    let hi = 0
    for (const m of solver.moves(s)) {
      if (!solver.canWin(m.next)) continue
      const [a, z] = walk(m.next)
      lo = Math.min(lo, a + 1)
      hi = Math.max(hi, z + 1)
    }
    fewest.set(k, lo)
    most.set(k, hi)
    return [lo, hi]
  }
  if (!solver.canWin(start)) return { bands: [], fewestMoves: Infinity, mostMoves: 0 }
  const [fewestMoves, mostMoves] = walk(start)
  return { bands: [...bands.values()].sort((a, b) => a.depth - b.depth), fewestMoves, mostMoves }
}

export interface Plan {
  blows: Blow[] // one winning order
  wasted: number
  unlinked: number
}

export interface Trap {
  after: string[] // the detonations that lead to it (fills left out)
  move: string
  revealedAfter: number // moves the game still allows before declaring the loss
}

export interface LevelProfile {
  winnable: boolean
  plans: Plan[] // distinct minimal sets of blows that win; reorderings count once
  morePlans: boolean // the plan list was cut off (it is then a sample)
  cleanest: number // fewest blows any win wastes, over every winning line
  decisions: number // states on a winning line where some move loses
  forced: number // ...of which exactly one move keeps the win
  traps: Trap[] // losing moves from those states, earliest first
  blindLuck: number
  states: number // states on winning lines
}

const PLAN_CAP = 24

const blowId = (b: Blow) => `${b.rune}.${b.layer}${b.with ? `+${b.with.rune}.${b.with.layer}` : ''}>${b.target === null ? '-' : `${b.ice ? 'I' : ''}${b.target}.${b.targetLayer}`}`

// Walks every state on a winning line: the decisions met there, the moves
// that lose (traps) and how long each stays hidden, and the distinct plans.
export function profileLevel(level: LevelData, opts: SolverOptions = {}): LevelProfile {
  const solver = new EconomySolver(level, opts)
  const start = initialEconomy(level)
  const winnable = solver.canWin(start)
  const profile: LevelProfile = { winnable, plans: [], morePlans: false, cleanest: solver.minWaste(start), decisions: 0, forced: 0, traps: [], blindLuck: solver.blindLuck(start), states: 0 }
  if (!profile.winnable) return profile

  const seen = new Set<string>()
  const traps = new Map<string, Trap>()
  const walk = (s: Economy, after: string[]): void => {
    if (economyWon(level, s)) return
    const k = solver.key(s)
    if (seen.has(k)) return
    seen.add(k)
    profile.states++
    const ms = solver.moves(s)
    const good = ms.filter((t) => solver.canWin(t.next))
    const bad = ms.filter((t) => !solver.canWin(t.next))
    if (bad.length) {
      profile.decisions++
      if (good.length === 1) profile.forced++
    }
    for (const t of bad) {
      const move = moveLabel(t.move)
      const id = `${after.join(' ')}|${move}`
      const revealedAfter = solver.revealDepth(t.next)
      const known = traps.get(id)
      if (!known || revealedAfter > known.revealedAfter) traps.set(id, { after, move, revealedAfter })
    }
    for (const t of good) walk(t.next, t.blow ? [...after, moveLabel(t.move)] : after)
  }
  walk(start, [])
  profile.traps = [...traps.values()].sort((a, b) => a.after.length - b.after.length || b.revealedAfter - a.revealedAfter)

  const planMemo = new Map<string, Map<string, Blow[]>>()
  const plansFrom = (s: Economy): Map<string, Blow[]> => {
    if (economyWon(level, s)) return new Map([['', []]])
    const key = solver.key(s)
    const known = planMemo.get(key)
    if (known) return known
    const out = new Map<string, Blow[]>()
    for (const t of solver.moves(s)) {
      if (!solver.canWin(t.next)) continue
      for (const rest of plansFrom(t.next).values()) {
        const blows = t.blow ? [t.blow, ...rest] : rest
        const id = blows.map(blowId).sort().join(' ')
        if (!out.has(id)) out.set(id, blows)
        if (out.size > PLAN_CAP) break
      }
      if (out.size > PLAN_CAP) break
    }
    planMemo.set(key, out)
    return out
  }
  const found = [...plansFrom(start).values()]
  profile.morePlans = found.length > PLAN_CAP
  // A plan that is another plan plus extra detonations is not a different
  // way to win.
  const ids = found.map((blows) => new Set(blows.map(blowId)))
  const minimal = found.filter((_, i) => !ids.some((other, j) => j !== i && other.size < ids[i].size && [...other].every((id) => ids[i].has(id))))
  profile.plans = minimal
    .slice(0, PLAN_CAP)
    .map((blows) => ({ blows, wasted: blows.reduce((w, b) => w + b.wasted, 0), unlinked: blows.filter((b) => b.unlinked).length }))
    .sort((a, b) => a.wasted - b.wasted || a.blows.length - b.blows.length)
  return profile
}

// Applies moves in order from the start (a real run's fills and
// detonations, say). Returns the final state, or null at the first move
// the model says is impossible.
export function replay(level: LevelData, moves: Move[], opts: SolverOptions = {}): Economy | null {
  let s = initialEconomy(level)
  for (const m of moves) {
    const t = transitions(level, s, opts).find((x) => moveLabel(x.move) === moveLabel(m))
    if (!t) return null
    s = t.next
  }
  return s
}
