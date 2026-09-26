import type { LevelConfig } from './level1'

// Back to FixedHandRefillStrategy, but the hardest level: full shape range,
// high HP obstacles that need multiple hits, and enough simultaneous demand
// on field space that overcommitting a big rune to an easy target really
// does strand you (the scenario the field-lockout fail condition exists for).
export const level5: LevelConfig = {
  id: 'level5',
  name: 'The Reckoning',
  obstacles: [
    { shape: 3, hp: 6, position: { x: 0.1, y: 0.3 } },
    { shape: 4, hp: 8, position: { x: 0.3, y: 0.12 } },
    { shape: 5, hp: 10, position: { x: 0.5, y: 0.42 } },
    { shape: 6, hp: 12, position: { x: 0.7, y: 0.18 } },
    { shape: 7, hp: 14, position: { x: 0.9, y: 0.45 } },
  ],
  miasma: { ambientCount: 26 },
  inventoryCapacity: 5,
  supply: {
    type: 'fixedHand',
    params: {
      pool: [
        { inner: 3, outer: 4 },
        { inner: 4, outer: 5 },
        { inner: 5, outer: 6 },
        { inner: 6, outer: 7 },
        { inner: 7, outer: 8 },
        { inner: 3, outer: 6 },
        { inner: 4, outer: 7 },
      ],
    },
  },
}
