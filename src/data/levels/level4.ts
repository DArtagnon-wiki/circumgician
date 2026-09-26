import type { ShapeSides } from '../../core/types'
import type { LevelConfig } from './level1'
import type { RuneTemplate } from '../../supply/RuneSupplyStrategy'
import type { ObstacleLayerSpec, RuneLayerSpec } from '../../growth'
import { simpleLayer } from '../../model/nodeColors'

// Exercises EventTriggeredUnlockStrategy's runeDetonated trigger, RANDOM
// obstacle-layer growth (a genuine coin-flip each collapse, capped), and a
// mix of scripted/random rune-center growth — full mystery (insight 'none').
const RANDOM_OBSTACLE_SHAPES: ShapeSides[] = [3, 4, 5, 6]

const randomObstacleGrowth = {
  type: 'random' as const,
  params: {
    continueChance: 0.5,
    maxLayers: 3,
    generate: (ctx: { layerIndex: number; rng: () => number }): ObstacleLayerSpec => {
      const sides = RANDOM_OBSTACLE_SHAPES[Math.floor(ctx.rng() * RANDOM_OBSTACLE_SHAPES.length)]
      return { shape: { sides, radius: 34 }, hp: 4 + ctx.layerIndex * 2 }
    },
  },
}

const randomCenterGrowth = {
  type: 'random' as const,
  params: {
    continueChance: 0.5,
    maxLayers: 2,
    generate: (ctx: { layerIndex: number; rng: () => number }): RuneLayerSpec => {
      const sides = RANDOM_OBSTACLE_SHAPES[Math.floor(ctx.rng() * RANDOM_OBSTACLE_SHAPES.length)]
      return simpleLayer(sides)
    },
  },
}

export const level4: LevelConfig = {
  id: 'level4',
  name: 'Unstable Echoes',
  obstacles: [
    { shape: 3, hp: 4, position: { x: 0.15, y: 0.25 }, growth: randomObstacleGrowth },
    { shape: 4, hp: 5, position: { x: 0.4, y: 0.5 }, growth: randomObstacleGrowth },
    { shape: 5, hp: 6, position: { x: 0.62, y: 0.22 }, growth: { type: 'none' } },
    { shape: 6, hp: 10, position: { x: 0.85, y: 0.42 }, growth: { type: 'none' } },
  ],
  miasma: { ambientCount: 20 },
  inventoryCapacity: 5,
  supply: {
    type: 'eventUnlock',
    params: {
      initial: [
        { outer: simpleLayer(4), middle: simpleLayer(3), centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(4)] } } },
        { outer: simpleLayer(5), middle: simpleLayer(4), centerGrowth: randomCenterGrowth },
      ] as RuneTemplate[],
      rules: [
        {
          trigger: { type: 'obstacleCleared', shape: 3 },
          unlocks: [{ outer: simpleLayer(6), middle: simpleLayer(5), centerGrowth: { type: 'none' } }],
        },
        {
          trigger: { type: 'runeDetonated', middle: 4, outer: 5 },
          unlocks: [{ outer: simpleLayer(7), middle: simpleLayer(6), centerGrowth: randomCenterGrowth }],
        },
      ],
    },
  },
  defaultInsightLevel: 'none',
}
