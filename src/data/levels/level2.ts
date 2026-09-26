import type { LevelConfig } from './level1'

// Exercises TimeDripStrategy: a small hand with no refill-on-detonation,
// forcing the player to wait on the drip timer between placements.
export const level2: LevelConfig = {
  id: 'level2',
  name: 'Drifting Miasma',
  obstacles: [
    { shape: 3, hp: 5, position: { x: 0.15, y: 0.25 } },
    { shape: 4, hp: 6, position: { x: 0.4, y: 0.5 } },
    { shape: 5, hp: 7, position: { x: 0.65, y: 0.2 } },
    { shape: 6, hp: 8, position: { x: 0.88, y: 0.42 } },
  ],
  miasma: { ambientCount: 22 },
  inventoryCapacity: 4,
  supply: {
    type: 'timeDrip',
    params: {
      pool: [
        { inner: 3, outer: 4 },
        { inner: 4, outer: 5 },
        { inner: 5, outer: 6 },
        { inner: 6, outer: 7 },
        { inner: 3, outer: 5 },
      ],
      intervalSeconds: 5,
    },
  },
}
