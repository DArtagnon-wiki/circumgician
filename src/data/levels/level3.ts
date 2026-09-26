import type { LevelConfig } from './level1'

// Exercises EventTriggeredUnlockStrategy's obstacleCleared trigger: only
// triangle/square runes start available, so the pentagon and hexagon
// obstacles are genuinely unreachable until their gating obstacle clears —
// order of play is not just optimal here, it's required.
export const level3: LevelConfig = {
  id: 'level3',
  name: 'Chain Reaction',
  obstacles: [
    { shape: 3, hp: 3, position: { x: 0.15, y: 0.3 } },
    { shape: 4, hp: 4, position: { x: 0.4, y: 0.55 } },
    { shape: 5, hp: 6, position: { x: 0.62, y: 0.2 } },
    { shape: 6, hp: 8, position: { x: 0.85, y: 0.45 } },
  ],
  miasma: { ambientCount: 20 },
  inventoryCapacity: 5,
  supply: {
    type: 'eventUnlock',
    params: {
      initial: [
        { inner: 3, outer: 4 },
        { inner: 4, outer: 4 },
      ],
      rules: [
        { trigger: { type: 'obstacleCleared', shape: 3 }, unlocks: [{ inner: 5, outer: 6 }] },
        { trigger: { type: 'obstacleCleared', shape: 4 }, unlocks: [{ inner: 6, outer: 7 }] },
      ],
    },
  },
}
