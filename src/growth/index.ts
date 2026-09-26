import type { PolygonSpec } from '../model/Polygon'
import type { RuneLayer } from '../model/Rune'
import type { LayerGrowthStrategy } from './LayerGrowthStrategy'
import { RandomLayerGrowthStrategy, type RandomLayerGrowthParams } from './RandomLayerGrowthStrategy'
import { ScriptedLayerGrowthStrategy, type ScriptedLayerGrowthParams } from './ScriptedLayerGrowthStrategy'

// The two TLayer instantiations used across the game.
export interface ObstacleLayerSpec {
  shape: PolygonSpec
  hp: number
}
export type RuneLayerSpec = RuneLayer

export type GrowthConfig<TLayer> =
  | { type: 'none' }
  | { type: 'scripted'; params: ScriptedLayerGrowthParams<TLayer> }
  | { type: 'random'; params: RandomLayerGrowthParams<TLayer> }

export function createGrowthStrategy<TLayer>(config: GrowthConfig<TLayer>): LayerGrowthStrategy<TLayer> {
  switch (config.type) {
    case 'none':
      return { next: () => null }
    case 'scripted':
      return new ScriptedLayerGrowthStrategy(config.params)
    case 'random':
      return new RandomLayerGrowthStrategy(config.params)
  }
}

export type { LayerGrowthStrategy, GrowthContext } from './LayerGrowthStrategy'
