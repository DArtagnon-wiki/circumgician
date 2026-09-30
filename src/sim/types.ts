import type { Hue, MoteColor, PaletteName, ReleaseColor } from '../model/Color'
import type { ObstacleLook } from '../model/Look'
import type { Vec2 } from '../core/types'

export type { Hue, MoteColor, PaletteName, ReleaseColor, Vec2 }

// ---------------------------------------------------------------------------
// Level data — the JSON file format. Plain data only: every level file under
// src/data/levels/ must validate against these shapes (see validate.ts).
// All coordinates are virtual-canvas pixels (400 x 860).
// ---------------------------------------------------------------------------

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface NodeSpec {
  catch: Hue
  release: ReleaseColor
  // A cup that starts full: a mote of its own color ('real', which counts
  // toward the blow), a null or a void. The mote appears when the layer is
  // cast and leaves at the burst like any other.
  prefilled?: Prefill
}

export type Prefill = 'real' | 'null' | 'void'

export interface RuneLayerSpec {
  sides: number // 3+
  radius: number // body radius, authored independently of sides
  nodes: NodeSpec[] // length === sides, index-aligned with vertices
  fuse?: number // seconds it burns in once cast, instead of the level's fuse
}

export interface ObstacleLayerSpec {
  sides: number
  radius: number
  hp: number
  boss?: boolean // endless: breaking it raises run insight
  // A frost layer freezes a piece that strikes it without breaking it: the
  // piece turns to ice where it stood, holding its (transformed) motes until
  // the ice is broken or this layer falls (see rules.ts).
  frost?: boolean
  // A two-shape layer: only two pieces fired as one blow strike it, one
  // whose energy has `sides` and one whose energy has `pair` sides (another
  // shape). Each waits in stasis once full until the other is (see rules.ts).
  pair?: number
}

export type Insight = 'none' | 'shape' | 'full'

export interface RuneSpec {
  // Outermost first. Every layer but the last can be cast; the last is
  // only ever the shape the layer before it strikes (its nodes are unused).
  layers: RuneLayerSpec[]
  insight?: Insight // center visibility; default 'full'
}

export interface MoteSpec {
  color: MoteColor
  x: number
  y: number
  tether?: number
}

export interface ObstacleSpec {
  x: number
  y: number
  layers: ObstacleLayerSpec[] // current first
  look?: ObstacleLook // how it is drawn; the sim never reads it
}

// A block of ice placed on the field: nothing can be cast over it and motes
// are pushed off it. A blow whose energy has its shape breaks it, freeing
// the motes locked inside. Ice is never needed to win.
export interface IceSpec {
  x: number
  y: number
  sides: number
  radius?: number // default ICE_RADIUS
  hp?: number // strength; default its sides
  motes?: MoteColor[] // locked inside, at most one per vertex
}

export type GoalSpec = { type: 'clearAll' }

export interface LevelData {
  version: 1
  id: string
  name: string
  field: Rect
  blockers: Rect[]
  motes: MoteSpec[]
  obstacles: ObstacleSpec[]
  ice?: IceSpec[]
  hand: RuneSpec[]
  goal: GoalSpec
  // How the level looks (default 'jewel'); the sim never reads it.
  palette?: PaletteName
  // Seconds a cast piece has to be filled and burst before it burns, taking
  // the motes it holds with it (a layer's own fuse overrides this).
  fuse?: number
  // Endless only: rune/obstacle stacks extend forever via generators.
  endless?: { seed: number }
}

// ---------------------------------------------------------------------------
// Runtime state — also plain data so structuredClone gives exact undo
// snapshots. Nothing here holds functions, class instances or Pixi objects.
// ---------------------------------------------------------------------------

export type MoteStateKind = 'free' | 'traveling' | 'held' | 'ejecting' | 'frozen'

export interface Mote {
  id: string
  color: MoteColor
  home: Vec2
  tether: number
  pos: Vec2
  wander: Vec2 // current drift target inside the tether
  vel?: Vec2 // free motes only: coasting after a kick or a rune's push
  kicked?: boolean // coasting from the player's kick: a rune it flies into draws it to a node
  state: MoteStateKind
  // traveling / held
  pieceId?: string
  node?: number
  // frozen: locked in a frozen piece (an obstacle) until it is broken
  frozenIn?: string
  travelFrom?: Vec2
  // traveling / ejecting progress 0..1
  t?: number
  // ejecting
  ejectFrom?: Vec2
}

export type RuneStateKind = 'idle' | 'spent'

// A rune in hand: its stack, dug from the outside in. Casting the layer in
// hand onto the field brings the next layer into hand at once; the stack's
// last entry is never cast (it is the shape the layer before it strikes),
// so casting the layer above it leaves the rune spent.
export interface Rune {
  id: string
  layers: RuneLayerSpec[]
  index: number // layer in hand = layers[index]
  insight: Insight
  state: RuneStateKind
  slot: number
  endlessSeed?: number
}

export type PieceStateKind = 'charging' | 'full'

// A layer cast onto the field. Its nodes catch motes; tapped when full, it
// strikes the nearest obstacle shaped like its energy (the stack's next
// entry when it was cast) and releases what it caught. Then it is gone.
export interface Piece {
  id: string
  runeId: string // the rune it was cast from
  slot: number
  depth: number // its index in that rune's stack
  layer: RuneLayerSpec
  energy: RuneLayerSpec
  pos: Vec2
  placedAt: number // sim time of casting; drives rotation
  state: PieceStateKind
  held: (string | null)[] // mote id per node (traveling or held)
  linkedObstacleId: string | null
  freezeAt?: number // sim time its fuse runs out (endless)
  burnAt?: number // sim time it burns unless burst first (levels with a fuse)
  freezeFor?: number // each fuse's length, for a fresh one after stasis
  burnFor?: number
  // Stasis (sim time it began): full and linked to a two-shape layer, it
  // holds that shape's place there and waits for the other shape's piece.
  // Its fuse is off, its spin stopped, and it only bursts with its partner.
  stasis?: number
  stillFor?: number // seconds its spin stood still in earlier stasis
}

export interface Obstacle {
  id: string
  pos: Vec2
  layers: ObstacleLayerSpec[]
  index: number
  hp: number
  cleared: boolean
  look?: ObstacleLook
  endlessSeed?: number
  // Ice: placed in the level, a piece whose fuse ran out (endless), or one a
  // frost layer froze (`by`: that obstacle and layer). Holds its motes until
  // broken, or until that frost layer falls. Never needed to win.
  frozen?: { motes: string[]; by?: { obstacle: string; layer: number } }
}

export type SimStatus = 'playing' | 'won' | 'lost'

// Why the game called a loss. Only one reason now: nothing left to do (no
// piece to burst, none that can fill, no rune worth casting). A board that
// can no longer be won plays on while moves remain.
export type LossReason = 'stuck'

// What the line played so far has done, for the result screen. Part of the
// board, so an undo takes back the stats of what it undoes.
export interface BoardStats {
  detonations: number
  landed: number // blows that took strength (HP removed)
  wasted: number // blows past a layer's last HP: damage never carries over
  unlinked: number // detonations whose energy matched nothing, so struck nothing
  destroyed: number // motes annihilated or burned
  burned: number // pieces that burned before they were burst
}

export interface SimState {
  levelId: string
  field: Rect
  blockers: Rect[]
  motes: Mote[]
  runes: Rune[]
  pieces: Piece[]
  obstacles: Obstacle[]
  time: number
  rng: number
  nextId: number
  status: SimStatus
  lostBecause?: LossReason
  score: number // endless: sum of broken layers' HP
  broken: number // obstacle layers broken
  stats: BoardStats
  seenHues: Hue[] // hues that have existed in the pool; endless catches only these
}
