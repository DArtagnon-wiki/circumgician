import mitt from 'mitt'
import type { Hue, Mote, Obstacle, ObstacleLayerSpec, Piece, Rune, RuneLayerSpec, Vec2 } from './types'

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
  frozeInto?: string // frostbitten: the ice it froze into, holding its motes
  // Burst with this piece as one blow of their combined power (a two-shape
  // layer's pair); `damage` is the pair's.
  partner?: string
}

export type SimEvents = {
  'piece:cast': { piece: Piece; rune: Rune } // rune: already holding its next layer
  'rune:spent': { rune: Rune } // nothing left to cast
  'piece:linked': { piece: Piece } // link target changed (possibly to null)
  'mote:claimed': { mote: Mote; piece: Piece; node: number }
  'mote:held': { mote: Mote; piece: Piece; node: number }
  'piece:full': { piece: Piece }
  'piece:stasis': { piece: Piece } // full and holding its shape's place on a two-shape layer
  'piece:released': { piece: Piece } // out of stasis or done pulling (the layer fell), with a fresh fuse
  'piece:pulling': { piece: Piece } // latched onto a shielded layer, to pull its shields down
  'shield:down': { obstacle: Obstacle; index: number } // its pullers hold enough of its color
  'piece:detonated': { piece: Piece; info: DetonationInfo }
  'piece:frozen': { piece: Piece; obstacle: Obstacle } // its fuse ran out (endless)
  'piece:burned': { piece: Piece; motes: Mote[] } // its fuse ran out before it burst; the motes it held burned with it
  'hue:discovered': { hue: Hue; mote: Mote } // a detonation made the first mote of this hue
  'obstacle:damaged': { obstacle: Obstacle; damage: number }
  'obstacle:collapsed': { obstacle: Obstacle; previous: ObstacleLayerSpec; cleared: boolean }
  'ice:thawed': { ice: Obstacle; by: Obstacle } // its frost layer fell: the motes it held go free
  'sim:won': undefined
  'sim:lost': undefined
  'sim:restored': undefined // undo/restart replaced the whole state
}

export type SimBus = ReturnType<typeof createSimBus>
export const createSimBus = () => mitt<SimEvents>()
