import type { Id } from '../core/types'
import { createGrowthStrategy, type GrowthConfig, type LayerGrowthStrategy, type ObstacleLayerSpec } from '../growth'

// One growth-strategy instance per obstacle (each needs its own sequence
// position / RNG draws), consulted by ObstacleHealthSystem whenever the
// current layer collapses.
export class ObstacleGrowthSystem {
  private strategies = new Map<Id, LayerGrowthStrategy<ObstacleLayerSpec>>()
  private rng: () => number

  constructor(rng: () => number = Math.random) {
    this.rng = rng
  }

  register(obstacleId: Id, config: GrowthConfig<ObstacleLayerSpec>): void {
    this.strategies.set(obstacleId, createGrowthStrategy(config))
  }

  nextLayer(obstacleId: Id, layerIndex: number): ObstacleLayerSpec | null {
    const strategy = this.strategies.get(obstacleId)
    if (!strategy) return null
    return strategy.next({ ownerId: obstacleId, layerIndex, rng: this.rng })
  }

  unregister(obstacleId: Id): void {
    this.strategies.delete(obstacleId)
  }
}
