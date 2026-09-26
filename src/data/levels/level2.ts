import type { LevelConfig } from './level1'
import type { RuneTemplate } from '../../supply/RuneSupplyStrategy'
import { simpleLayer } from '../../model/nodeColors'

// Exercises TimeDripStrategy, scripted 2-layer obstacle growth, and
// introduces colored (non-generic) motes for the first time.
// NOTE: numeric balance here is a first pass — M6 revisits with real
// playtesting once rendering makes the mechanics visible.
const pool: RuneTemplate[] = [
  { outer: simpleLayer(4), middle: simpleLayer(3), centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(5)] } } },
  {
    outer: simpleLayer(5),
    middle: simpleLayer(4, { catch: 'red', release: 'generic' }),
    centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(6)] } },
  },
  { outer: simpleLayer(6), middle: simpleLayer(5), centerGrowth: { type: 'none' } },
  { outer: simpleLayer(4), middle: simpleLayer(6), centerGrowth: { type: 'none' } },
]

export const level2: LevelConfig = {
  id: 'level2',
  name: 'Drifting Miasma',
  obstacles: [
    { shape: 3, hp: 5, position: { x: 0.15, y: 0.25 }, growth: { type: 'scripted', params: { sequence: [{ shape: { sides: 6, radius: 34 }, hp: 6 }] } } },
    { shape: 4, hp: 6, position: { x: 0.4, y: 0.5 }, growth: { type: 'scripted', params: { sequence: [{ shape: { sides: 5, radius: 34 }, hp: 7 }] } } },
    { shape: 5, hp: 7, position: { x: 0.65, y: 0.2 }, growth: { type: 'none' } },
    { shape: 6, hp: 8, position: { x: 0.88, y: 0.42 }, growth: { type: 'none' } },
  ],
  miasma: { ambientCount: 22, colorWeights: { generic: 3, red: 1 } },
  inventoryCapacity: 4,
  supply: { type: 'timeDrip', params: { pool, intervalSeconds: 5 } },
  defaultInsightLevel: 'shape',
}
