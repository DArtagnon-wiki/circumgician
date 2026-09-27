import type { ShapeSides } from '../../core/types'
import type { SupplyConfig } from '../../supply'
import type { RuneTemplate } from '../../supply/RuneSupplyStrategy'
import type { InsightLevel } from '../../model/Rune'
import type { MoteColor } from '../../model/Color'
import type { GrowthConfig, ObstacleLayerSpec } from '../../growth'
import { simpleLayer } from '../../model/nodeColors'

export interface LevelObstacleConfig {
  shape: ShapeSides
  hp: number
  position: { x: number; y: number } // normalized 0..1 within the obstacle area
  growth: GrowthConfig<ObstacleLayerSpec> // what (if anything) forms after this layer collapses
}

export interface LevelConfig {
  id: string
  name: string
  obstacles: LevelObstacleConfig[]
  miasma: { ambientCount: number; colorWeights?: Partial<Record<MoteColor, number>> } // default: all generic
  inventoryCapacity: number
  supply: SupplyConfig
  defaultInsightLevel: InsightLevel
}

// Tutorial level: single-layer obstacles (growth 'none'), short scripted
// rune-center chains, full insight — nothing hidden yet.
const pool: RuneTemplate[] = [
  {
    outer: simpleLayer(4, 'red'),
    middle: simpleLayer(3, 'blue'),
    centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(5, 'gold')] } },
  },
  {
    outer: simpleLayer(5, 'teal'),
    middle: simpleLayer(4, 'violet'),
    centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(3, 'red')] } },
  },
  { outer: simpleLayer(6, 'gold'), middle: simpleLayer(5, 'blue'), centerGrowth: { type: 'none' } },
  { outer: simpleLayer(4, 'violet'), middle: simpleLayer(4, 'teal'), centerGrowth: { type: 'none' } },
]

export const level1: LevelConfig = {
  id: 'level1',
  name: 'First Threads',
  obstacles: [
    { shape: 3, hp: 9, position: { x: 0.22, y: 0.3 }, growth: { type: 'none' } },
    { shape: 4, hp: 12, position: { x: 0.5, y: 0.18 }, growth: { type: 'none' } },
    { shape: 5, hp: 15, position: { x: 0.78, y: 0.32 }, growth: { type: 'none' } },
  ],
  miasma: { ambientCount: 18 },
  inventoryCapacity: 5,
  supply: { type: 'fixedHand', params: { pool } },
  defaultInsightLevel: 'full',
}
