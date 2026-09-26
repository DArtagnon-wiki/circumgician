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
    outer: simpleLayer(4),
    middle: simpleLayer(3),
    centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(5)] } },
  },
  {
    outer: simpleLayer(5),
    middle: simpleLayer(4),
    centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(3)] } },
  },
  { outer: simpleLayer(6), middle: simpleLayer(5), centerGrowth: { type: 'none' } },
  { outer: simpleLayer(4), middle: simpleLayer(4), centerGrowth: { type: 'none' } },
]

export const level1: LevelConfig = {
  id: 'level1',
  name: 'First Threads',
  obstacles: [
    { shape: 3, hp: 3, position: { x: 0.22, y: 0.3 }, growth: { type: 'none' } },
    { shape: 4, hp: 4, position: { x: 0.5, y: 0.18 }, growth: { type: 'none' } },
    { shape: 5, hp: 5, position: { x: 0.78, y: 0.32 }, growth: { type: 'none' } },
  ],
  miasma: { ambientCount: 18 },
  inventoryCapacity: 5,
  supply: { type: 'fixedHand', params: { pool } },
  defaultInsightLevel: 'full',
}
