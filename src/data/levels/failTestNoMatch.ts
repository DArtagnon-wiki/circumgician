import type { LevelConfig } from './level1'
import type { RuneTemplate } from '../../supply/RuneSupplyStrategy'
import { simpleLayer } from '../../model/nodeColors'

// Debug/test-only fixture — deliberately unwinnable from the moment the
// level loads. Every pool template's `middle` shape is something other than
// the lone obstacle's, and no growth chain ever produces a matching middle
// either, so `availablePool` (src/supply/pool.ts) is empty from t=0: the
// inventory never receives a single rune (0 idle, 0 active), and
// `canIntroduceRune()` is false forever. Exercises the exact bug fixed in
// `DragPlacementSystem.hasRoomForSomeIdleRune` — should hit "No More Moves"
// almost immediately after load. Kept out of the player-facing LEVELS array
// (see index.ts) — only reachable via Level Select's debug section.
const pool: RuneTemplate[] = [
  { outer: simpleLayer(4, 'red'), middle: simpleLayer(3, 'blue'), centerGrowth: { type: 'none' } },
  { outer: simpleLayer(5, 'gold'), middle: simpleLayer(4, 'teal'), centerGrowth: { type: 'none' } },
]

export const failTestNoMatch: LevelConfig = {
  id: 'failTestNoMatch',
  name: 'Debug: No Matching Supply',
  obstacles: [{ shape: 8, hp: 10, position: { x: 0.5, y: 0.3 }, growth: { type: 'none' } }],
  miasma: { ambientCount: 10 },
  inventoryCapacity: 3,
  supply: { type: 'fixedHand', params: { pool } },
  defaultInsightLevel: 'full',
}
