import mitt from 'mitt'
import type { Rune } from '../model/Rune'
import type { Obstacle } from '../model/Obstacle'

export type GameEvents = {
  'rune:activated': { rune: Rune; obstacle: Obstacle }
  'node:filled': { rune: Rune; nodeIndex: number }
  'rune:ready': { rune: Rune }
  'obstacle:damaged': { obstacle: Obstacle; damage: number }
  'obstacle:cleared': { obstacle: Obstacle }
  'rune:detonated': { rune: Rune }
  'rune:added': { rune: Rune }
  'game:won': undefined
  'game:lost': undefined
}

export type EventBus = ReturnType<typeof createEventBus>

export function createEventBus() {
  return mitt<GameEvents>()
}
