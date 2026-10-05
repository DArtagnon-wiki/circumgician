import type { LevelData } from './types'
import { EconomySolver, economyDepth, economyWon, initialEconomy, moveLabel, type Economy, type Move, type SolverOptions, type Transition } from './solver'

// The graph a player lives in. Its nodes are the states a win still passes through (the "winning
// region"), its edges the moves that keep a win possible; a move that loses is a wrong move, and
// one more step out of the region. A good level opens out into many states, some of whose moves
// lose, collapses into a crux (every line goes through one place), opens out again, and so on to
// the win. A boring one has few choices at each state and one way through.
//
// Everything is counted per depth (moves made so far: a fill and a burst are one each). A blow into
// nothing is never counted: it isn't a decision anyone makes.

export interface Pinch {
  from: number
  to: number
  // wrong moves lost the game in the few steps before it
  earned: boolean
}

export interface Shape {
  states: number
  depth: number
  width: number[] // winning states
  shape: number[] // of them, how many have different futures
  losers: number[] // losing states one wrong move off
  wrongHit: number[] // winning states where some rune can strike a layer now and lose
  holdOff: number[] // of those, where the rune that strikes it on the winning lines is not ready yet
  corridor: number // the longest run of depths with a single state
  realForks: number // states with two winning moves that do not simply commute
  forks: number
  pinches: Pinch[]
}

interface Node {
  key: string
  s: Economy
  depth: number
  win: boolean
  moves: Transition[]
  out: { to: Node; move: Move }[]
  bad: number
  wrong: Set<string>
  hitters: Map<string, Set<string>>
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

export const totalHoldOff = (shape: Shape) => sum(shape.holdOff)
export const totalWrongHits = (shape: Shape) => sum(shape.wrongHit)

// Stretches (depth 3..final-2) where at most `futures` different futures remain.
export function pinchesOf(width: number[], shape: number[], losers: number[], futures = 2): Pinch[] {
  const final = shape.length - 1
  const runs: { from: number; to: number }[] = []
  for (let d = 3; d <= final - 2; d++) {
    if (shape[d] > futures) continue
    const last = runs[runs.length - 1]
    if (last && d - last.to <= 1) last.to = d
    else runs.push({ from: d, to: d })
  }
  void width
  return runs.map((r) => {
    let lost = 0
    for (let d = Math.max(0, r.from - 5); d < r.from; d++) lost += losers[d] ?? 0
    return { ...r, earned: lost >= 2 }
  })
}

// Null when the level cannot be won.
export function levelShape(level: LevelData, opts: SolverOptions = {}): Shape | null {
  const solver = new EconomySolver(level, opts)
  const start = initialEconomy(level)
  if (!solver.canWin(start)) return null
  const make = (s: Economy): Node => ({ key: solver.key(s), s, depth: economyDepth(s), win: economyWon(level, s), moves: [], out: [], bad: 0, wrong: new Set(), hitters: new Map() })
  const root = make(start)
  const nodes = new Map<string, Node>([[root.key, root]])
  const queue = [root]
  const losers = new Map<string, number>()
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i]
    if (n.win) continue
    n.moves = solver.moves(n.s)
    for (const t of n.moves) {
      if (t.move.kind === 'fire' && t.move.target === null) continue
      const key = solver.key(t.next)
      if (!solver.canWin(t.next)) {
        n.bad++
        // a fill into the same cup with a different pattern of nulls is the same wrong choice
        const label = moveLabel(t.move).replace(/ [.nv]+$/, '')
        if (n.wrong.has(label)) continue
        n.wrong.add(label)
        if (!losers.has(key)) losers.set(key, economyDepth(t.next))
        continue
      }
      let m = nodes.get(key)
      if (!m) {
        m = make(t.next)
        nodes.set(key, m)
        queue.push(m)
      }
      n.out.push({ to: m, move: t.move })
    }
  }
  const all = [...nodes.values()]
  const final = Math.max(...all.map((n) => n.depth))
  const width = Array.from({ length: final + 1 }, () => 0)
  const lose = Array.from({ length: final + 1 }, () => 0)
  for (const n of all) width[n.depth]++
  for (const d of losers.values()) lose[Math.min(d, final)]++

  // States with the same wrong moves and winning moves to the same futures are one future.
  const ids = new Map<string, number>()
  const cls = new Map<string, number>()
  const classOf = (n: Node): number => {
    const known = cls.get(n.key)
    if (known !== undefined) return known
    let id = 0
    if (!n.win) {
      const sig = n.bad + '|' + n.out.map((e) => classOf(e.to)).sort((a, b) => a - b).join(',')
      if (!ids.has(sig)) ids.set(sig, ids.size + 1)
      id = ids.get(sig)!
    }
    cls.set(n.key, id)
    return id
  }
  const futures = Array.from({ length: final + 1 }, () => new Set<number>())
  for (const n of all) futures[n.depth].add(classOf(n))
  const shape = futures.map((x) => x.size)

  // Who strikes each layer on the winning lines from a state, deepest states first.
  const layerKey = (s: Economy, target: number) => `${target}:${s.obstacles[target].index}`
  for (const n of [...all].sort((a, b) => b.depth - a.depth)) {
    if (n.win) continue
    for (const e of n.out) {
      const m = e.move
      if (m.kind === 'fire' && m.target !== null && !m.ice) {
        const k = layerKey(n.s, m.target)
        if (!n.hitters.has(k)) n.hitters.set(k, new Set())
        n.hitters.get(k)!.add(`${m.rune}.${m.layer}`)
        if (m.with) n.hitters.get(k)!.add(`${m.with.rune}.${m.with.layer}`)
      }
      for (const [k, set] of e.to.hitters) {
        if (!n.hitters.has(k)) n.hitters.set(k, new Set())
        for (const x of set) n.hitters.get(k)!.add(x)
      }
    }
  }
  const wrongHit = Array.from({ length: final + 1 }, () => 0)
  const holdOff = Array.from({ length: final + 1 }, () => 0)
  let realForks = 0
  let forks = 0
  for (const n of all) {
    if (n.win) continue
    const ready = new Set<string>()
    for (const t of n.moves) if (t.move.kind === 'fill' || t.move.kind === 'pull') ready.add(`${t.move.rune}.${t.move.layer}`)
    for (const p of n.s.pieces) if (p.full) ready.add(`${p.rune}.${p.layer}`)
    let wrong = false
    let hold = false
    for (const t of n.moves) {
      const m = t.move
      if (m.kind !== 'fire' || m.target === null || m.ice || solver.canWin(t.next)) continue
      wrong = true
      const H = n.hitters.get(layerKey(n.s, m.target))
      if (H && H.size && ![...H].some((x) => ready.has(x))) hold = true
    }
    if (wrong) wrongHit[n.depth]++
    if (hold) holdOff[n.depth]++
    if (n.out.length >= 2) {
      forks++
      let real = false
      for (let i = 0; i < n.out.length && !real; i++) {
        for (let j = i + 1; j < n.out.length && !real; j++) {
          const a = n.out[i].to
          const b = n.out[j].to
          const after = new Set(a.out.map((e) => e.to.key))
          const meet = b.out.some((e) => after.has(e.to.key)) || a.out.some((e) => e.to === b) || b.out.some((e) => e.to === a)
          if (!meet) real = true
        }
      }
      if (real) realForks++
    }
  }
  let corridor = 0
  let run = 0
  for (let d = 1; d < final; d++) {
    run = width[d] === 1 ? run + 1 : 0
    corridor = Math.max(corridor, run)
  }
  return { states: all.length, depth: final, width, shape, losers: lose, wrongHit, holdOff, corridor, realForks, forks, pinches: pinchesOf(width, shape, lose) }
}
