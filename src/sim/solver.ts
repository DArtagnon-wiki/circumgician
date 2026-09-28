import type { LevelData, MoteColor } from './types'

// Economy solver: plays out a level's arithmetic exhaustively, with geometry
// abstracted away. Kicks let a player herd motes almost anywhere, and where
// a rune is placed decides which matching obstacle it links to, so both are
// treated as free choices. What remains is exactly what rules.ts enforces:
//   - a detonation deals its outer layer's sides in damage to an obstacle
//     whose current layer has as many sides as the rune's middle layer;
//     with no such obstacle (or no middle) it is unlinked and deals none;
//   - damage never carries into the next layer: the excess is wasted;
//   - every caught mote is released recolored by its node, except at
//     'annihilating' nodes, which destroy theirs;
//   - generic motes fill any node.
// A move is one of
//   fill Rn      place rune n and fill its outer layer from the free motes
//   Rn->Om       detonate full rune n into obstacle m
//   Rn unlinked  detonate full rune n with nothing to hit
// Curated levels are small, so the search is exhaustive and memoized, and
// the profile below (plans, decisions, traps) is exact for this model.
// Whether the geometry allows a plan (room on the field, which motes a ring
// can reach) is checked in the real sim by the scripted lines in
// src/data/levels/solutions.test.ts.

export const ECONOMY_COLORS: readonly MoteColor[] = ['red', 'blue', 'gold', 'teal', 'violet', 'generic']
const GENERIC = ECONOMY_COLORS.indexOf('generic')

export interface Economy {
  pool: number[] // free motes per color, in ECONOMY_COLORS order
  runes: { index: number; full: boolean }[] // outer layer; full = placed and filled
  obstacles: { index: number; hp: number }[] // index past the last layer = cleared
}

export type Move = { kind: 'fill'; rune: number } | { kind: 'fire'; rune: number; target: number | null }

// One detonation, counted the way the result screen counts it.
export interface Blow {
  rune: number
  layer: number // rune layer that detonated
  target: number | null // obstacle hit, null when unlinked
  targetLayer: number // obstacle layer hit (-1 when unlinked)
  damage: number // HP removed
  wasted: number // damage past the layer's remaining HP
  unlinked: boolean // had a middle layer but nothing matched it: its damage went nowhere
}

export interface Transition {
  move: Move
  next: Economy
  blow?: Blow // fires only
}

export interface SolverOptions {
  maxPlaced?: number // at most this many runes on the field at once (room)
}

export function initialEconomy(level: LevelData): Economy {
  const pool = ECONOMY_COLORS.map(() => 0)
  for (const m of level.motes) pool[ECONOMY_COLORS.indexOf(m.color)]++
  return {
    pool,
    runes: level.hand.map(() => ({ index: 0, full: false })),
    obstacles: level.obstacles.map((o) => ({ index: 0, hp: o.layers[0]?.hp ?? 0 })),
  }
}

export function economyKey(s: Economy): string {
  return `${s.pool.join(',')}|${s.runes.map((r) => r.index + (r.full ? 'f' : '')).join(',')}|${s.obstacles.map((o) => `${o.index}:${o.hp}`).join(',')}`
}

export function economyWon(level: LevelData, s: Economy): boolean {
  return s.obstacles.every((o, i) => o.index >= level.obstacles[i].layers.length)
}

// The game's damage test for a certain loss (damageCanSuffice in
// progress.ts): per obstacle shape, can the rune layers not yet detonated
// still deal the HP left? The game shows the loss screen the moment this
// fails, so it is also when a player learns that damage was wasted.
export function damageShort(level: LevelData, s: Economy): boolean {
  const need = new Map<number, number>()
  s.obstacles.forEach((o, oi) => {
    const layers = level.obstacles[oi].layers
    for (let i = o.index; i < layers.length; i++) need.set(layers[i].sides, (need.get(layers[i].sides) ?? 0) + (i === o.index ? o.hp : layers[i].hp))
  })
  const can = new Map<number, number>()
  s.runes.forEach((r, ri) => {
    const layers = level.hand[ri].layers
    for (let i = r.index; i + 1 < layers.length; i++) can.set(layers[i + 1].sides, (can.get(layers[i + 1].sides) ?? 0) + layers[i].sides)
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

function fire(level: LevelData, s: Economy, ri: number, target: number | null): Transition {
  const r = s.runes[ri]
  const layers = level.hand[ri].layers
  const outer = layers[r.index]
  const pool = [...s.pool]
  for (const n of outer.nodes) if (n.release !== 'annihilating') pool[ECONOMY_COLORS.indexOf(n.release)]++
  const obstacles = s.obstacles.map((o) => ({ ...o }))
  const blow: Blow = { rune: ri, layer: r.index, target, targetLayer: -1, damage: 0, wasted: 0, unlinked: target === null && r.index + 1 < layers.length }
  if (target !== null) {
    const o = obstacles[target]
    blow.targetLayer = o.index
    blow.damage = Math.min(o.hp, outer.sides)
    blow.wasted = outer.sides - blow.damage
    o.hp -= blow.damage
    if (o.hp === 0) {
      o.index++
      o.hp = level.obstacles[target].layers[o.index]?.hp ?? 0
    }
  }
  const runes = s.runes.map((x, i) => (i === ri ? { index: x.index + 1, full: false } : x))
  return { move: { kind: 'fire', rune: ri, target }, next: { pool, runes, obstacles }, blow }
}

// Every legal move from s.
export function transitions(level: LevelData, s: Economy, opts: SolverOptions = {}): Transition[] {
  const out: Transition[] = []
  const placed = s.runes.filter((r) => r.full).length
  level.hand.forEach((spec, ri) => {
    const r = s.runes[ri]
    const outer = spec.layers[r.index]
    if (!outer) return // spent
    if (!r.full) {
      if (opts.maxPlaced !== undefined && placed >= opts.maxPlaced) return
      const pool = takeCatch(s.pool, outer.nodes.map((n) => n.catch))
      if (pool) out.push({ move: { kind: 'fill', rune: ri }, next: { pool, runes: s.runes.map((x, i) => (i === ri ? { ...x, full: true } : x)), obstacles: s.obstacles } })
      return
    }
    // A rune links to whichever matching obstacle is nearest, so any of
    // them can be chosen by placing it; none matching means unlinked.
    const middle = spec.layers[r.index + 1]
    const targets = middle ? s.obstacles.flatMap((o, oi) => (level.obstacles[oi].layers[o.index]?.sides === middle.sides ? [oi] : [])) : []
    for (const target of targets.length ? targets : [null]) out.push(fire(level, s, ri, target))
  })
  return out
}

export function moveLabel(m: Move): string {
  if (m.kind === 'fill') return `fill R${m.rune}`
  return m.target === null ? `R${m.rune} unlinked` : `R${m.rune}->O${m.target}`
}

function memo<T>(cache: Map<string, T>, s: Economy, compute: () => T): T {
  const k = economyKey(s)
  let v = cache.get(k)
  if (v === undefined) {
    v = compute()
    cache.set(k, v)
  }
  return v
}

// Memoized questions about one level's states. Every move either fills a
// rune or moves one a layer on, so the state graph has no cycles.
export class EconomySolver {
  readonly level: LevelData
  readonly opts: SolverOptions
  private readonly winMemo = new Map<string, boolean>()
  private readonly revealMemo = new Map<string, number>()
  private readonly luckMemo = new Map<string, number>()

  constructor(level: LevelData, opts: SolverOptions = {}) {
    this.level = level
    this.opts = opts
  }

  moves(s: Economy): Transition[] {
    return transitions(this.level, s, this.opts)
  }

  // Can some sequence of moves from s still clear every obstacle?
  canWin(s: Economy): boolean {
    if (economyWon(this.level, s)) return true
    if (damageShort(this.level, s)) return false
    return memo(this.winMemo, s, () => this.moves(s).some((t) => this.canWin(t.next)))
  }

  // For a state that can no longer win: the most moves a player can still
  // make before the game declares the loss (0 = at once). Wasted damage
  // shows the moment the damage test fails; a color dead end only once
  // nothing is left to do.
  revealDepth(s: Economy): number {
    if (economyWon(this.level, s) || damageShort(this.level, s)) return 0
    return memo(this.revealMemo, s, () => this.moves(s).reduce((d, t) => Math.max(d, 1 + this.revealDepth(t.next)), 0))
  }

  // Chance that a player picking uniformly among the legal moves wins.
  blindLuck(s: Economy): number {
    if (economyWon(this.level, s)) return 1
    if (damageShort(this.level, s)) return 0
    return memo(this.luckMemo, s, () => {
      const ms = this.moves(s)
      return ms.length ? ms.reduce((sum, t) => sum + this.blindLuck(t.next), 0) / ms.length : 0
    })
  }
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
  plans: Plan[] // distinct sets of blows that win; reorderings count once
  morePlans: boolean // the plan list was cut off
  decisions: number // states on a winning line where some move loses
  forced: number // ...of which exactly one move keeps the win
  traps: Trap[] // losing moves from those states, earliest first
  blindLuck: number
  states: number // states on winning lines
}

const PLAN_CAP = 24

const blowId = (b: Blow) => `${b.rune}.${b.layer}>${b.target === null ? '-' : `${b.target}.${b.targetLayer}`}`

// Walks every state on a winning line: the decisions met there, the moves
// that lose (traps) and how long each stays hidden, and the distinct plans.
export function profileLevel(level: LevelData, opts: SolverOptions = {}): LevelProfile {
  const solver = new EconomySolver(level, opts)
  const start = initialEconomy(level)
  const profile: LevelProfile = { winnable: solver.canWin(start), plans: [], morePlans: false, decisions: 0, forced: 0, traps: [], blindLuck: solver.blindLuck(start), states: 0 }
  if (!profile.winnable) return profile

  const seen = new Set<string>()
  const traps = new Map<string, Trap>()
  const walk = (s: Economy, after: string[]): void => {
    if (economyWon(level, s)) return
    const k = economyKey(s)
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
    return memo(planMemo, s, () => {
      const out = new Map<string, Blow[]>()
      for (const t of solver.moves(s)) {
        if (!solver.canWin(t.next)) continue
        for (const rest of plansFrom(t.next).values()) {
          const blows = t.blow ? [t.blow, ...rest] : rest
          const id = blows.map(blowId).sort().join(' ')
          if (!out.has(id)) out.set(id, blows)
          if (out.size > PLAN_CAP) return out
        }
      }
      return out
    })
  }
  const plans = [...plansFrom(start).values()]
  profile.morePlans = plans.length > PLAN_CAP
  profile.plans = plans
    .slice(0, PLAN_CAP)
    .map((blows) => ({ blows, wasted: blows.reduce((w, b) => w + b.wasted, 0), unlinked: blows.filter((b) => b.unlinked).length }))
    .sort((a, b) => a.wasted - b.wasted || a.blows.length - b.blows.length)
  return profile
}

// Applies moves in order from the start (a real run's fills and
// detonations, say). Returns the final state, or null at the first move
// the model says is impossible.
export function replay(level: LevelData, moves: Move[]): Economy | null {
  let s = initialEconomy(level)
  for (const m of moves) {
    const t = transitions(level, s).find((x) => moveLabel(x.move) === moveLabel(m))
    if (!t) return null
    s = t.next
  }
  return s
}
