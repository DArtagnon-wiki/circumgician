import type { LevelConfig } from './level1'
import type { RuneTemplate } from '../../supply/RuneSupplyStrategy'
import { patternLayer, simpleLayer } from '../../model/nodeColors'

// Exercises EventTriggeredUnlockStrategy's obstacleCleared trigger (only
// triangle/square runes start available — pentagon/hexagon are genuinely
// unreachable until their gating obstacle clears), scripted obstacle growth,
// and one annihilating rune center (escalating attrition, fitting the name).
export const level3: LevelConfig = {
  id: 'level3',
  name: 'Chain Reaction',
  obstacles: [
    {
      shape: 3,
      hp: 3,
      position: { x: 0.15, y: 0.3 },
      growth: { type: 'scripted', params: { sequence: [{ shape: { sides: 3, radius: 34 }, hp: 4 }] } },
    },
    { shape: 4, hp: 4, position: { x: 0.4, y: 0.55 }, growth: { type: 'none' } },
    { shape: 5, hp: 6, position: { x: 0.62, y: 0.2 }, growth: { type: 'none' } },
    { shape: 6, hp: 8, position: { x: 0.85, y: 0.45 }, growth: { type: 'none' } },
  ],
  miasma: { ambientCount: 20 },
  inventoryCapacity: 5,
  supply: {
    type: 'eventUnlock',
    params: {
      initial: [
        { outer: simpleLayer(4), middle: simpleLayer(3), centerGrowth: { type: 'none' } },
        { outer: simpleLayer(4), middle: simpleLayer(4), centerGrowth: { type: 'none' } },
      ] as RuneTemplate[],
      rules: [
        {
          trigger: { type: 'obstacleCleared', shape: 3 },
          unlocks: [{ outer: simpleLayer(6), middle: simpleLayer(5), centerGrowth: { type: 'none' } }],
        },
        {
          trigger: { type: 'obstacleCleared', shape: 4 },
          unlocks: [
            {
              outer: simpleLayer(6),
              middle: simpleLayer(6),
              centerGrowth: {
                type: 'scripted',
                params: { sequence: [patternLayer(6, [{ catch: 'generic', release: 'annihilating' }])] },
              },
            },
          ],
        },
      ],
    },
  },
  defaultInsightLevel: 'shape',
}
