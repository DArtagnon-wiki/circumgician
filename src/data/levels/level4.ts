import type { LevelConfig } from './level1'

// Exercises EventTriggeredUnlockStrategy's runeDetonated trigger (mixed with
// an obstacleCleared rule, to confirm the one class genuinely handles both
// at once): detonating a specific {4,5} rune — not clearing anything in
// particular — is what unlocks the rune needed for the tough heptagon.
export const level4: LevelConfig = {
  id: 'level4',
  name: 'Unstable Echoes',
  obstacles: [
    { shape: 3, hp: 4, position: { x: 0.15, y: 0.25 } },
    { shape: 4, hp: 5, position: { x: 0.4, y: 0.5 } },
    { shape: 5, hp: 6, position: { x: 0.62, y: 0.22 } },
    { shape: 7, hp: 10, position: { x: 0.85, y: 0.42 } },
  ],
  miasma: { ambientCount: 20 },
  inventoryCapacity: 5,
  supply: {
    type: 'eventUnlock',
    params: {
      initial: [
        { inner: 3, outer: 4 },
        { inner: 4, outer: 5 },
      ],
      rules: [
        { trigger: { type: 'obstacleCleared', shape: 3 }, unlocks: [{ inner: 5, outer: 6 }] },
        { trigger: { type: 'runeDetonated', inner: 4, outer: 5 }, unlocks: [{ inner: 7, outer: 8 }] },
      ],
    },
  },
}
