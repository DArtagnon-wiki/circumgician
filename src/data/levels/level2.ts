import type { LevelConfig } from './level1'
import type { RuneTemplate } from '../../supply/RuneSupplyStrategy'
import { patternLayer, simpleLayer } from '../../model/nodeColors'

// Exercises TimeDripStrategy, scripted 2-layer obstacle growth, and
// introduces colored (non-generic) motes for the first time. Each template's
// outer starts simple (generic) so placement/detonation stays approachable
// on the first stage — the escalation into genuinely mixed per-node colors
// (no simple correspondence between what a node catches and what it
// releases, per the design brief's own 5-gon example) shows up once middle
// is promoted into the new outer.
const pool: RuneTemplate[] = [
  { outer: simpleLayer(4, 'red'), middle: simpleLayer(3, 'blue'), centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(5, 'gold')] } } },
  {
    outer: simpleLayer(5, 'teal'),
    // 4 nodes: 2 catch red, 1 catch blue, 1 catch violet; releases into 1 gold,
    // 1 teal, 2 generic — no 1:1 catch-to-release correspondence.
    middle: patternLayer(4, [
      { catch: 'red', release: 'gold' },
      { catch: 'blue', release: 'generic' },
      { catch: 'red', release: 'teal' },
      { catch: 'violet', release: 'generic' },
    ]),
    centerGrowth: { type: 'scripted', params: { sequence: [simpleLayer(6, 'violet')] } },
  },
  { outer: simpleLayer(6, 'gold'), middle: simpleLayer(5, 'blue'), centerGrowth: { type: 'none' } },
  {
    outer: simpleLayer(4, 'violet'),
    // 5 nodes: 3 catch gold, 1 catch red, 1 catch blue; releases into 1 teal,
    // 1 violet, 3 generic — matches the design brief's own worked example.
    middle: patternLayer(5, [
      { catch: 'gold', release: 'generic' },
      { catch: 'gold', release: 'generic' },
      { catch: 'gold', release: 'teal' },
      { catch: 'red', release: 'violet' },
      { catch: 'blue', release: 'generic' },
    ]),
    centerGrowth: { type: 'none' },
  },
]

export const level2: LevelConfig = {
  id: 'level2',
  name: 'Drifting Miasma',
  obstacles: [
    { shape: 3, hp: 18, position: { x: 0.15, y: 0.25 }, growth: { type: 'scripted', params: { sequence: [{ shape: { sides: 6, radius: 34 }, hp: 21 }] } } },
    { shape: 4, hp: 21, position: { x: 0.4, y: 0.5 }, growth: { type: 'scripted', params: { sequence: [{ shape: { sides: 5, radius: 34 }, hp: 25 }] } } },
    { shape: 5, hp: 25, position: { x: 0.65, y: 0.2 }, growth: { type: 'none' } },
    { shape: 6, hp: 28, position: { x: 0.88, y: 0.42 }, growth: { type: 'none' } },
  ],
  miasma: { ambientCount: 22, colorWeights: { generic: 3, red: 1, gold: 1, blue: 1 } },
  inventoryCapacity: 4,
  supply: { type: 'timeDrip', params: { pool, intervalSeconds: 5 } },
  defaultInsightLevel: 'shape',
}
