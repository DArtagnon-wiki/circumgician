import type { LevelConfig } from './level1'
import type { RuneTemplate } from '../../supply/RuneSupplyStrategy'
import { simpleLayer } from '../../model/nodeColors'

// Debug/test-only fixture for the SECOND, independent loss-condition bug:
// `EventTriggeredUnlockStrategy.canIntroduceRune` used to report "can
// introduce" forever merely because a slot was open, with no check that any
// unlock rule could actually still fire. Here the single `initial` rune can
// deal only a little real damage (its centerGrowth is 'none', so it depletes
// after one detonation) — nowhere near enough to clear the obstacle's HP —
// and the one unlock rule's trigger references a shape (3) that never
// exists in this level, so it can never fire. Once the initial rune
// depletes, no more supply ever arrives, HP stays positive, and the game
// should hit "No More Moves". Under the old buggy check this would have
// hung forever even with the first bug fixed. Kept out of the player-facing
// LEVELS array (see index.ts) — only reachable via Level Select's debug
// section.
const pool: RuneTemplate[] = [{ outer: simpleLayer(4, 'red'), middle: simpleLayer(6, 'blue'), centerGrowth: { type: 'none' } }]

export const failTestExhaustedUnlocks: LevelConfig = {
  id: 'failTestExhaustedUnlocks',
  name: 'Debug: Exhausted Unlocks',
  obstacles: [{ shape: 6, hp: 500, position: { x: 0.5, y: 0.3 }, growth: { type: 'none' } }],
  miasma: { ambientCount: 20 },
  inventoryCapacity: 3,
  supply: {
    type: 'eventUnlock',
    params: {
      initial: pool,
      rules: [{ trigger: { type: 'obstacleCleared', shape: 3 }, unlocks: pool }], // shape 3 never exists here
    },
  },
  defaultInsightLevel: 'full',
}
