import type { LevelData, MoteColor } from './types'

// Economy solver: plays out a level's arithmetic exhaustively, with geometry
// abstracted away. Kicks let a player herd motes almost anywhere, and where
// a piece is cast decides which matching obstacle it links to, so both are
// treated as free choices. What remains is exactly what rules.ts enforces:
//   - casting a rune's layer puts it on the field as a piece and brings the
//     next layer into hand; the stack's last entry is never cast, it is the
//     shape the layer above it strikes;
//   - a detonation deals the piece's sides in damage to an obstacle whose
//     current layer has as many sides as the piece's energy (the stack's
//     next entry); with no such obstacle it is unlinked and deals none;
//   - damage never carries into the next layer: the excess is wasted;
//   - every caught mote is released recolored by its node, except at
//     'annihilating' nodes, which destroy theirs;
//   - generic motes fill any node;
//   - ice (the level's blocks, and pieces frozen by frost) is struck like
//     an obstacle of one layer, by energy of its shape; broken, it frees
//     the motes locked inside. It never counts toward the win;
//   - a blow that leaves a frost layer standing still lands, but the piece
//     freezes into ice of its own shape (strength its sides) holding its
//     released motes; when that layer falls, all the ice it froze thaws.
// A move is one of
//   fill Rn.k      fill layer k of rune n from the free motes. If k is still
//                  in hand, it is cast first, and any layers above it are
//                  cast as empty pieces (digging down to it)
//   Rn.k->Om       detonate that full piece into obstacle m
//   Rn.k->Im       ...or into ice m (the level's first, then frozen pieces
//                  in the order they froze)
//   Rn.k unlinked  detonate it with nothing to hit
// Casting an empty piece only matters for what it uncovers, so it happens
// inside the fill that needs it. Room on the field is the one limit on
// digging: `maxPlaced` caps the pieces on the field at once. The default,
// DEFAULT_ROOM, is about what a field holds; without any cap a rune's stack
// is effectively an unordered bag of layers, and deep stacks explode.
// Curated levels are small, so the search is exhaustive and memoized, and
// the profile below (plans, decisions, traps) is exact for this model.
// Whether the geometry allows a plan (room on the field, which motes a ring
// can reach) is checked in the real sim by the scripted lines in
// src/data/levels/solutions.test.ts.

export const ECONOMY_COLORS: readonly MoteColor[] = ['red', 'blue', 'gold', 'teal', 'violet', 'generic']
const GENERIC = ECONOMY_COLORS.indexOf('generic')

export interface EconomyPiece {
  rune: number
  layer: number
  full: boolean
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
}

// A fire's target indexes the obstacles, or the ice when `ice` is set.
export type Move = { kind: 'fill'; rune: number; layer: number } | { kind: 'fire'; rune: number; layer: number; target: number | null; ice?: boolean }

// One detonation, counted the way the result screen counts it.
export interface Blow {
  rune: number
  layer: number // stack layer that detonated
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
  const obs = `${s.obstacles.map((o) => `${o.index}:${o.hp}`).join(',')}|${ice}`
  if (room(opts) === Infinity) {
    const mark = { open: 'o', full: 'F', fired: 'x' }
    const layers = level.hand.map((_, r) => Array.from({ length: castable(level, r) }, (_, k) => mark[status(s, r, k)]).join('')).join(',')
    return `${s.pool.join(',')}|${layers}|${obs}`
  }
  return `${s.pool.join(',')}|${s.hand.join(',')}|${s.pieces.map((p) => `${p.rune}.${p.layer}${p.full ? 'f' : ''}`).join(',')}|${obs}`
}

export function economyWon(level: LevelData, s: Economy): boolean {
  return s.obstacles.every((o, i) => o.index >= level.obstacles[i].layers.length)
}

// The game's damage test for a certain loss (damageCanSuffice in
// progress.ts): per obstacle shape, can the layers not yet detonated still
// deal the HP left? The game shows the loss screen the moment this fails,
// so it is also when a player learns that damage was wasted.
export function damageShort(level: LevelData, s: Economy): boolean {
  const need = new Map<number, number>()
  s.obstacles.forEach((o, oi) => {
    const layers = level.obstacles[oi].layers
    for (let i = o.index; i < layers.length; i++) need.set(layers[i].sides, (need.get(layers[i].sides) ?? 0) + (i === o.index ? o.hp : layers[i].hp))
  })
  const can = new Map<number, number>()
  const add = (rune: number, layer: number) => {
    const layers = level.hand[rune].layers
    can.set(layers[layer + 1].sides, (can.get(layers[layer + 1].sides) ?? 0) + layers[layer].sides)
  }
  for (const p of s.pieces) add(p.rune, p.layer)
  s.hand.forEach((index, r) => {
    for (let k = index; k < castable(level, r); k++) add(r, k)
  })
  for (const [sides, hp] of need) if ((can.get(sides) ?? 0) < hp) return true
  return false
}

// Exact colors first; generics cover the shortfall. Keeping a generic is
// never worse than keeping the hued mote it could replace, because a
// release takes its node's color, not the mote's.
function takeCatch(pool: number[], catches: MoteColor[]): number[] | null {
  const next = [...pool]
  for (const c of catches) {
    const i = ECONOMY_COLORS.indexOf(c)
    if (next[i] > 0) next[i]--
    else if (next[GENERIC] > 0) next[GENERIC]--
    else return null
  }
  return next
}

const byRuneLayer = (a: EconomyPiece, b: EconomyPiece) => a.rune - b.rune || a.layer - b.layer

function fill(level: LevelData, s: Economy, rune: number, layer: number, opts: SolverOptions): Transition | null {
  const spec = level.hand[rune].layers[layer]
  const pool = takeCatch(s.pool, spec.nodes.map((n) => n.catch))
  if (!pool) return null
  const onField = s.pieces.findIndex((p) => p.rune === rune && p.layer === layer)
  let pieces: EconomyPiece[]
  const hand = [...s.hand]
  if (onField >= 0) {
    if (s.pieces[onField].full) return null
    pieces = s.pieces.map((p, i) => (i === onField ? { ...p, full: true } : p))
  } else {
    if (layer < s.hand[rune] || layer >= castable(level, rune)) return null
    // Dig: the layers above it go down as empty pieces.
    const cast = layer - s.hand[rune] + 1
    if (s.pieces.length + cast > room(opts)) return null
    const dug = Array.from({ length: cast - 1 }, (_, i) => ({ rune, layer: s.hand[rune] + i, full: false }))
    pieces = [...s.pieces, ...dug, { rune, layer, full: true }].sort(byRuneLayer)
    hand[rune] = layer + 1
  }
  return { move: { kind: 'fill', rune, layer }, next: { pool, hand, pieces, obstacles: s.obstacles, ice: s.ice } }
}

function fire(level: LevelData, s: Economy, rune: number, layer: number, target: number | null, ice = false): Transition {
  const layers = level.hand[rune].layers
  const outer = layers[layer]
  const released = tally(outer.nodes.flatMap((n) => (n.release === 'annihilating' ? [] : [n.release])))
  let pool = s.pool
  let blocks = s.ice
  const obstacles = s.obstacles.map((o) => ({ ...o }))
  const blow: Blow = { rune, layer, target, ...(ice ? { ice } : {}), targetLayer: -1, damage: 0, wasted: 0, unlinked: target === null }
  let frozen = false
  const strike = (hp: number) => {
    blow.damage = Math.min(hp, outer.sides)
    blow.wasted = outer.sides - blow.damage
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
    if (spec.frost && outer.sides < o.hp) {
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
    }
  }
  if (!frozen) pool = plus(pool, released)
  const pieces = s.pieces.filter((p) => !(p.rune === rune && p.layer === layer))
  return { move: { kind: 'fire', rune, layer, target, ...(ice ? { ice } : {}) }, next: { pool, hand: s.hand, pieces, obstacles, ice: blocks }, blow }
}

// Every legal move from s.
export function transitions(level: LevelData, s: Economy, opts: SolverOptions = {}): Transition[] {
  const out: Transition[] = []
  level.hand.forEach((_, r) => {
    for (let k = 0; k < castable(level, r); k++) {
      const t = status(s, r, k) === 'open' ? fill(level, s, r, k, opts) : null
      if (t) out.push(t)
    }
  })
  for (const p of s.pieces) {
    if (!p.full) continue
    // A piece links to whichever matching obstacle (or ice) is nearest, so
    // any of them can be chosen by where it is cast; none means unlinked.
    const energy = level.hand[p.rune].layers[p.layer + 1]
    const targets = s.obstacles.flatMap((o, oi) => (level.obstacles[oi].layers[o.index]?.sides === energy.sides ? [oi] : []))
    const blocks = s.ice.flatMap((b, bi) => (b.hp > 0 && b.sides === energy.sides ? [bi] : []))
    for (const target of targets) out.push(fire(level, s, p.rune, p.layer, target))
    for (const target of blocks) out.push(fire(level, s, p.rune, p.layer, target, true))
    if (!targets.length && !blocks.length) out.push(fire(level, s, p.rune, p.layer, null))
  }
  return out
}

// The game's certain-loss test (progress.ts), as far as the model can see
// it: damage short, or nothing full and nothing left that could fill.
export function economyLost(level: LevelData, s: Economy, opts: SolverOptions = {}): boolean {
  if (economyWon(level, s)) return false
  if (damageShort(level, s)) return true
  if (s.pieces.some((p) => p.full)) return false
  return !transitions(level, s, opts).length
}

export function moveLabel(m: Move): string {
  if (m.kind === 'fill') return `fill R${m.rune}.${m.layer}`
  return m.target === null ? `R${m.rune}.${m.layer} unlinked` : `R${m.rune}.${m.layer}->${m.ice ? 'I' : 'O'}${m.target}`
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
  // make before the game declares the loss (0 = at once). Wasted damage
  // shows the moment the damage test fails; a color dead end only once
  // nothing is left to do.
  revealDepth(s: Economy): number {
    if (economyLost(this.level, s, this.opts) || economyWon(this.level, s)) return 0
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
    const ms = this.moves(s)
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
// so far (a fill or a detonation is one move each).
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

export function economyDepth(s: Economy): number {
  const fired = s.hand.reduce((a, b) => a + b, 0) - s.pieces.length
  return 2 * fired + s.pieces.filter((p) => p.full).length
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
    const t = solver.tension(s)
    const d = economyDepth(s)
    const b = bands.get(d) ?? { depth: d, states: 0, min: 1, mean: 0, max: 0, minPeril: 1 }
    b.mean = (b.mean * b.states + t.tension) / (b.states + 1)
    b.states++
    b.min = Math.min(b.min, t.tension)
    b.max = Math.max(b.max, t.tension)
    b.minPeril = Math.min(b.minPeril, t.peril)
    bands.set(d, b)
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

const blowId = (b: Blow) => `${b.rune}.${b.layer}>${b.target === null ? '-' : `${b.ice ? 'I' : ''}${b.target}.${b.targetLayer}`}`

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
