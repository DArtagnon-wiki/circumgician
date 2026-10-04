import type { LevelData } from './types'
import { EconomySolver, economyWon, initialEconomy, type Move, type SolverOptions } from './solver'

export interface LayerRef {
  rune: number
  layer: number
}

// How a rune layer figures in a level.
//   route   some winning line fires it at an obstacle (or the ice), casts it as a puller or
//           holds it in stasis
//   needed  no line does, but the level cannot be won without it: a rune fired at nothing is
//           how some levels ask for a color to be turned into another
//   trap    it can strike something, but only in lines that lose: a decoy
//   dead    it can strike nothing at all, and the level can be won without it
export type LayerUse = 'route' | 'needed' | 'trap' | 'dead'

// The layers a move puts to use: what it fires, latches on or holds.
const used = (m: Move): LayerRef[] => {
  if (m.kind === 'fire') return m.target === null ? [] : [{ rune: m.rune, layer: m.layer }, ...(m.with ? [{ rune: m.with.rune, layer: m.with.layer }] : [])]
  if (m.kind === 'pull' || m.kind === 'lock') return [{ rune: m.rune, layer: m.layer }]
  return []
}

// What every rune layer is good for, judged over the states a win still passes through (the
// "winning region"). A layer whose color is never on hand when its shape is on top, or whose
// shape is never on top at all, is dead: a rune to puzzle over for nothing. A trap is a decoy;
// a level is better off without them (the tempting wrong move should be in the order of the
// real runes, see runes.test.ts). A blow into nothing doesn't count as a use: it is a way to
// throw motes away, not something a player is tempted to try.
export function layerUses(level: LevelData, opts: SolverOptions = {}): Map<string, LayerUse> {
  const solver = new EconomySolver(level, opts)
  const start = initialEconomy(level)
  const seen = new Set([solver.key(start)])
  const queue = [start]
  const route = new Set<string>()
  const strikes = new Set<string>()
  const id = (r: LayerRef) => `${r.rune}.${r.layer}`
  const note = (into: Set<string>, ms: Move[]) => {
    for (const m of ms) for (const r of used(m)) into.add(id(r))
  }
  for (let i = 0; i < queue.length; i++) {
    const s = queue[i]
    if (economyWon(level, s)) continue
    const tried = new Set<string>()
    const moves = solver.moves(s)
    note(strikes, moves.map((t) => t.move))
    for (const t of moves) {
      if (solver.canWin(t.next)) {
        note(route, [t.move])
        const k = solver.key(t.next)
        if (!seen.has(k)) {
          seen.add(k)
          queue.push(t.next)
        }
      }
      const m = t.move
      if (m.kind !== 'fill') continue
      // What a layer can do right after it is filled, here.
      const key = id(m)
      if (route.has(key) || tried.has(key)) continue
      tried.add(key)
      note(strikes, solver.moves(t.next).map((u) => u.move))
    }
  }
  const needed = (r: LayerRef) => !new EconomySolver(level, { ...opts, blocked: new Set([id(r)]) }).canWin(start)
  const out = new Map<string, LayerUse>()
  level.hand.forEach((h, rune) => {
    for (let layer = 0; layer < h.layers.length - 1; layer++) {
      const key = id({ rune, layer })
      out.set(key, route.has(key) ? 'route' : needed({ rune, layer }) ? 'needed' : strikes.has(key) ? 'trap' : 'dead')
    }
  })
  return out
}

const withUse = (level: LevelData, opts: SolverOptions, ...uses: LayerUse[]): LayerRef[] =>
  [...layerUses(level, opts)].filter(([, use]) => uses.includes(use)).map(([key]) => ({ rune: +key.split('.')[0], layer: +key.split('.')[1] }))

// Layers that can never strike anything and that the level doesn't need.
export const deadLayers = (level: LevelData, opts: SolverOptions = {}): LayerRef[] => withUse(level, opts, 'dead')

// Layers no winning line uses: the dead ones, and the traps.
export const decoyLayers = (level: LevelData, opts: SolverOptions = {}): LayerRef[] => withUse(level, opts, 'dead', 'trap')
