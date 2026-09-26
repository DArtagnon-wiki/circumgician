import type { ShapeSides } from '../core/types'
import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { LevelConfig } from '../data/levels/level1'
import type { Rune } from '../model/Rune'
import type { Obstacle } from '../model/Obstacle'

export interface RuneShapePair {
  inner: ShapeSides
  outer: ShapeSides
}

export interface SupplyContext {
  state: GameState
  level: LevelConfig
  bus: EventBus
  rng: () => number
  // Single write path for strategies: builds the rune, places it, and emits
  // 'rune:added' on success — strategies never touch Inventory directly.
  addRune: (pair: RuneShapePair) => Rune | null
}

export interface RuneSupplyStrategy {
  initialize(ctx: SupplyContext): void
  onRuneDetonated?(rune: Rune, ctx: SupplyContext): void
  onObstacleCleared?(obstacle: Obstacle, ctx: SupplyContext): void
  update?(dt: number, ctx: SupplyContext): void
  canIntroduceRune(ctx: SupplyContext): boolean
}
