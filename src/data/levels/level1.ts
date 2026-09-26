import type { ShapeSides } from '../../core/types'

export interface LevelObstacleConfig {
  shape: ShapeSides
  hp: number
  position: { x: number; y: number } // normalized 0..1 within the obstacle area
}

export interface LevelConfig {
  id: string
  name: string
  obstacles: LevelObstacleConfig[]
  miasma: { ambientCount: number }
  // Placeholder until the pluggable supply-strategy system lands (Day 7) —
  // for now every level just starts with a fixed hand.
  initialRunes: { inner: ShapeSides; outer: ShapeSides }[]
}

export const level1: LevelConfig = {
  id: 'level1',
  name: 'First Threads',
  obstacles: [
    { shape: 3, hp: 3, position: { x: 0.22, y: 0.3 } },
    { shape: 4, hp: 4, position: { x: 0.5, y: 0.18 } },
    { shape: 5, hp: 5, position: { x: 0.78, y: 0.32 } },
  ],
  miasma: { ambientCount: 18 },
  initialRunes: [
    { inner: 3, outer: 4 },
    { inner: 4, outer: 5 },
    { inner: 5, outer: 6 },
    { inner: 3, outer: 6 },
    { inner: 4, outer: 4 },
  ],
}
