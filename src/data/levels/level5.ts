import type { ShapeSides } from '../../core/types'
import type { LevelConfig } from './level1'
import type { RuneTemplate } from '../../supply/RuneSupplyStrategy'
import type { ObstacleLayerSpec } from '../../growth'
import { patternLayer, simpleLayer } from '../../model/nodeColors'

// Finale: FixedHandRefillStrategy again, mixed scripted ("boss") and random
// ("chaos") obstacle growth, and a rune pool spanning the full insight
// spectrum (full/shape/none) plus an annihilating template, all at once.
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
  { outer: simpleLayer(4, 'red'), middle: simpleLayer(3, 'blue'), centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(5, 'gold')] } }, insightLevel: 'full' },
  {
    outer: simpleLayer(5, 'teal'),
    // Transmuting rune: catches red/blue and swaps their releases, gold/violet
    // nodes pass through unchanged — a genuinely mixed catch/release layer
    // for the finale rather than a uniform color pair.
    middle: patternLayer(4, [
      { catch: 'red', release: 'blue' },
      { catch: 'gold', release: 'generic' },
      { catch: 'blue', release: 'red' },
      { catch: 'violet', release: 'generic' },
    ]),
    centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(6, 'violet')] } },
    insightLevel: 'shape',
  },
  { outer: simpleLayer(6, 'gold'), middle: simpleLayer(5, 'blue'), centerGrowth: { type: 'none' }, insightLevel: 'none' },
  {
    outer: simpleLayer(7, 'violet'),
    middle: simpleLayer(6, 'red'),
    centerGrowth: { type: 'scripted', params: { sequence: [patternLayer(7, [{ catch: 'violet', release: 'annihilating' }])] } },
    insightLevel: 'none',
  },
  { outer: simpleLayer(4, 'blue'), middle: simpleLayer(7, 'gold'), centerGrowth: { type: 'none' }, insightLevel: 'shape' },
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
