import type { GameState } from '../core/GameState'
import type { EventBus } from '../core/EventBus'
import type { LevelConfig } from '../data/levels/level1'
import type { Rune, RuneLayer, InsightLevel } from '../model/Rune'
import type { Obstacle } from '../model/Obstacle'
import type { GrowthConfig, RuneLayerSpec } from '../growth'

// Authored (or generated) blueprint for a brand-new 3-layer rune. Only
// outer/middle are given directly — center is rolled from `centerGrowth`
// the moment the rune is created (and again at every later promotion).
export interface RuneTemplate {
  outer: RuneLayer
  middle: RuneLayer
  centerGrowth: GrowthConfig<RuneLayerSpec>
  insightLevel?: InsightLevel // overrides the level's default when set
}

export interface SupplyContext {
  state: GameState
  level: LevelConfig
  bus: EventBus
  rng: () => number
  // Single write path for strategies: builds the rune, places it, and emits
  // 'rune:added' on success — strategies never touch Inventory directly.
  addRune: (template: RuneTemplate) => Rune | null
}

export interface RuneSupplyStrategy {
  initialize(ctx: SupplyContext): void
  // Fires only when a rune's slot truly vacates (its final promotion had no
  // center to become a new middle) — this is "refill an empty slot," the
  // spirit of what detonation-refill always meant, just correctly re-scoped
  // now that most detonations promote in place instead of vacating.
  onRuneDepleted?(rune: Rune, ctx: SupplyContext): void
  // Fires on every detonation cycle (rune still in its pre-promotion state)
  // — for strategies whose triggers care about *what* detonated, not
  // whether the rune survived it.
  onRuneStepDetonated?(rune: Rune, ctx: SupplyContext): void
  onObstacleCleared?(obstacle: Obstacle, ctx: SupplyContext): void
  update?(dt: number, ctx: SupplyContext): void
  canIntroduceRune(ctx: SupplyContext): boolean
}
