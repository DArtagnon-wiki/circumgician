import type { GameState } from '../core/GameState'
import type { RuneShapePair } from './RuneSupplyStrategy'

// Filters a strategy's configured pool down to shapes an obstacle still
// needs. Without this, a strategy could hand out a rune for a shape that no
// longer exists on the level — that rune would permanently occupy a slot
// with nothing to link to, and falsely trip the field/inventory fail check.
export function availablePool(pool: RuneShapePair[], state: GameState): RuneShapePair[] {
  const presentShapes = new Set(state.obstacles.map((o) => o.shape.sides))
  return pool.filter((pair) => presentShapes.has(pair.inner))
}

export function pickRandom<T>(items: T[], rng: () => number): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(rng() * items.length)]
}
