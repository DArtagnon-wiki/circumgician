import mitt from 'mitt'
import type { Mote, Obstacle, ObstacleLayerSpec, Rune, RuneLayerSpec, Vec2 } from './types'

// Snapshot of a rune as it was the instant it detonated, so views can
// animate the outer shattering and the middle flying home.
export interface DetonationInfo {
  pos: Vec2
  outer: RuneLayerSpec
  middle?: RuneLayerSpec
  outerAngle: number
  middleAngle: number
  damage: number
  obstacleId: string | null
  released: string[]
  annihilated: string[]
}

export type SimEvents = {
  'rune:placed': { rune: Rune }
  'rune:linked': { rune: Rune } // link target changed (possibly to null)
  'mote:claimed': { mote: Mote; rune: Rune; node: number }
  'mote:held': { mote: Mote; rune: Rune; node: number }
  'rune:full': { rune: Rune }
  'rune:detonated': { rune: Rune; info: DetonationInfo }
  'rune:spent': { rune: Rune }
  'obstacle:damaged': { obstacle: Obstacle; damage: number }
  'obstacle:collapsed': { obstacle: Obstacle; previous: ObstacleLayerSpec; cleared: boolean }
  'sim:won': undefined
  'sim:lost': undefined
  'sim:restored': undefined // undo/restart replaced the whole state
}

export type SimBus = ReturnType<typeof createSimBus>
export const createSimBus = () => mitt<SimEvents>()
