import type { Id } from '../core/types'
import { createGrowthStrategy, type GrowthConfig, type LayerGrowthStrategy, type RuneLayerSpec } from '../growth'

// One growth-strategy instance per rune (each needs its own sequence
// position / RNG draws), consulted by DetonationSystem whenever a
// promotion needs a fresh center rolled.
export class RuneGrowthSystem {
  private strategies = new Map<Id, LayerGrowthStrategy<RuneLayerSpec>>()
  private rng: () => number

  constructor(rng: () => number = Math.random) {
    this.rng = rng
  }

  register(runeId: Id, config: GrowthConfig<RuneLayerSpec>): void {
    this.strategies.set(runeId, createGrowthStrategy(config))
  }

  nextCenter(runeId: Id, layerIndex: number): RuneLayerSpec | null {
    const strategy = this.strategies.get(runeId)
    if (!strategy) return null
    return strategy.next({ ownerId: runeId, layerIndex, rng: this.rng })
  }

  unregister(runeId: Id): void {
    this.strategies.delete(runeId)
  }
}
