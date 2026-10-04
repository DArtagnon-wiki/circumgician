import type { LevelData } from './types'
import { EconomySolver, economyWon, initialEconomy, type Move, type SolverOptions } from './solver'

export interface LayerRef {
  rune: number
  layer: number
}

// The layers a move puts to use: what it fires, latches on or holds.
const used = (m: Move): LayerRef[] => {
  if (m.kind === 'fire') return m.target === null ? [] : [{ rune: m.rune, layer: m.layer }, ...(m.with ? [{ rune: m.with.rune, layer: m.with.layer }] : [])]
  if (m.kind === 'pull' || m.kind === 'lock') return [{ rune: m.rune, layer: m.layer }]
  return []
}

// Rune layers a player can never get anything from. A layer is alive when,
// from some state a win still passes through, it can be filled and then
// fired at an obstacle (or the ice), cast as a puller or held in stasis; or
// when the level cannot be won without it (a rune fired at nothing is how
// some levels ask for a color to be turned into another). A layer neither
// hits anything nor is needed is just a rune to puzzle over for nothing: its
// color is never on hand when its shape is on top, or its shape is never on
// top at all. A decoy has to be able to hit something and cost the level a
// little; this finds the ones that cannot.
export function deadLayers(level: LevelData, opts: SolverOptions = {}): LayerRef[] {
  const solver = new EconomySolver(level, opts)
  const start = initialEconomy(level)
  const seen = new Set([solver.key(start)])
  const queue = [start]
  const alive = new Set<string>()
  const id = (r: LayerRef) => `${r.rune}.${r.layer}`
  const note = (ms: Move[]) => {
    for (const m of ms) for (const r of used(m)) alive.add(id(r))
  }
  for (let i = 0; i < queue.length; i++) {
    const s = queue[i]
    if (economyWon(level, s)) continue
    const tried = new Set<string>()
    const moves = solver.moves(s)
    note(moves.map((t) => t.move))
    for (const t of moves) {
      if (solver.canWin(t.next)) {
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
      if (alive.has(key) || tried.has(key)) continue
      tried.add(key)
      note(solver.moves(t.next).map((u) => u.move))
    }
  }
  const needed = (r: LayerRef) => !new EconomySolver(level, { ...opts, blocked: new Set([id(r)]) }).canWin(start)
  const dead: LayerRef[] = []
  level.hand.forEach((h, rune) => {
    for (let layer = 0; layer < h.layers.length - 1; layer++) if (!alive.has(`${rune}.${layer}`) && !needed({ rune, layer })) dead.push({ rune, layer })
  })
  return dead
}
