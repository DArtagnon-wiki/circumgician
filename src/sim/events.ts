import mitt from 'mitt'
import type { Mote, Obstacle, ObstacleLayerSpec, Piece, Rune, RuneLayerSpec, Vec2 } from './types'

// Snapshot of a piece as it was the instant it detonated, so views can
// animate its glass shattering and its energy striking.
export interface DetonationInfo {
  pos: Vec2
  outer: RuneLayerSpec // the piece's glass
  energy: RuneLayerSpec // the shape it strikes
  outerAngle: number
  energyAngle: number
  damage: number
  obstacleId: string | null
  released: string[]
  annihilated: string[]
}

export type SimEvents = {
  'piece:cast': { piece: Piece; rune: Rune } // rune: already holding its next layer
  'rune:spent': { rune: Rune } // nothing left to cast
  'piece:linked': { piece: Piece } // link target changed (possibly to null)
  'mote:claimed': { mote: Mote; piece: Piece; node: number }
  'mote:held': { mote: Mote; piece: Piece; node: number }
  'piece:full': { piece: Piece }
  'piece:detonated': { piece: Piece; info: DetonationInfo }
  'obstacle:damaged': { obstacle: Obstacle; damage: number }
  'obstacle:collapsed': { obstacle: Obstacle; previous: ObstacleLayerSpec; cleared: boolean }
  'sim:won': undefined
  'sim:lost': undefined
  'sim:restored': undefined // undo/restart replaced the whole state
}

export type SimBus = ReturnType<typeof createSimBus>
export const createSimBus = () => mitt<SimEvents>()
