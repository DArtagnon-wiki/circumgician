import type { ShapeSides } from '../../core/types'
import type { LevelConfig } from './level1'
import type { RuneTemplate } from '../../supply/RuneSupplyStrategy'
import type { ObstacleLayerSpec } from '../../growth'
import { patternLayer, simpleLayer } from '../../model/nodeColors'

// Finale: FixedHandRefillStrategy again, mixed scripted ("boss") and random
// ("chaos") obstacle growth, and a rune pool spanning the full insight
// spectrum (full/shape/none) plus an annihilating template, all at once.
// NOTE: numeric balance here is a first pass — M6 revisits with real
// playtesting once rendering makes the mechanics visible.
const CHAOS_SHAPES: ShapeSides[] = [3, 4, 5, 6, 7]

const chaosGrowth = {
  type: 'random' as const,
  params: {
    continueChance: 0.4,
    maxLayers: 2,
    generate: (ctx: { layerIndex: number; rng: () => number }): ObstacleLayerSpec => {
      const sides = CHAOS_SHAPES[Math.floor(ctx.rng() * CHAOS_SHAPES.length)]
      return { shape: { sides, radius: 34 }, hp: 6 + ctx.layerIndex * 3 }
    },
  },
}

const pool: RuneTemplate[] = [
  { outer: simpleLayer(4), middle: simpleLayer(3), centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(5)] } }, insightLevel: 'full' },
  { outer: simpleLayer(5), middle: simpleLayer(4), centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(6)] } }, insightLevel: 'shape' },
  { outer: simpleLayer(6), middle: simpleLayer(5), centerGrowth: { type: 'none' }, insightLevel: 'none' },
  {
    outer: simpleLayer(7),
    middle: simpleLayer(6),
    centerGrowth: { type: 'scripted', params: { sequence: [patternLayer(7, [{ catch: 'generic', release: 'annihilating' }])] } },
    insightLevel: 'none',
  },
  { outer: simpleLayer(4), middle: simpleLayer(7), centerGrowth: { type: 'none' }, insightLevel: 'shape' },
]

export const level5: LevelConfig = {
  id: 'level5',
  name: 'The Reckoning',
  obstacles: [
    { shape: 3, hp: 6, position: { x: 0.1, y: 0.3 }, growth: { type: 'scripted', params: { sequence: [{ shape: { sides: 6, radius: 34 }, hp: 8 }] } } },
    { shape: 4, hp: 8, position: { x: 0.3, y: 0.12 }, growth: chaosGrowth },
    { shape: 5, hp: 10, position: { x: 0.5, y: 0.42 }, growth: { type: 'none' } },
    { shape: 6, hp: 12, position: { x: 0.7, y: 0.18 }, growth: chaosGrowth },
    { shape: 7, hp: 14, position: { x: 0.9, y: 0.45 }, growth: { type: 'none' } },
  ],
  miasma: { ambientCount: 26, colorWeights: { generic: 2, red: 1, blue: 1 } },
  inventoryCapacity: 5,
  supply: { type: 'fixedHand', params: { pool } },
  defaultInsightLevel: 'shape',
}
