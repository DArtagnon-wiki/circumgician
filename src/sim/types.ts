import type { Hue, MoteColor, ReleaseColor } from '../model/Color'
import type { Vec2 } from '../core/types'

export type { Hue, MoteColor, ReleaseColor, Vec2 }

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
}

export interface RuneLayerSpec {
  sides: number // 3+
  radius: number // body radius, authored independently of sides
  nodes: NodeSpec[] // length === sides, index-aligned with vertices
}

export interface ObstacleLayerSpec {
  sides: number
  radius: number
  hp: number
  boss?: boolean // endless: breaking it raises run insight
}

export type Insight = 'none' | 'shape' | 'full'

export interface RuneSpec {
  layers: RuneLayerSpec[] // outermost first
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
  hand: RuneSpec[]
  goal: GoalSpec
  // Endless only: rune/obstacle stacks extend forever via generators.
  endless?: { seed: number }
}

// ---------------------------------------------------------------------------
// Runtime state — also plain data so structuredClone gives exact undo
// snapshots. Nothing here holds functions, class instances or Pixi objects.
// ---------------------------------------------------------------------------

export type MoteStateKind = 'free' | 'traveling' | 'held' | 'ejecting'

export interface Mote {
  id: string
  color: MoteColor
  home: Vec2
  tether: number
  pos: Vec2
  wander: Vec2 // current drift target inside the tether
  vel?: Vec2 // free motes only: coasting after a kick or a rune's push
  state: MoteStateKind
  // traveling / held
  runeId?: string
  node?: number
  travelFrom?: Vec2
  // traveling / ejecting progress 0..1
  t?: number
  // ejecting
  ejectFrom?: Vec2
}

export type RuneStateKind = 'idle' | 'charging' | 'full' | 'spent'

export interface Rune {
  id: string
  layers: RuneLayerSpec[]
  index: number // current outer = layers[index]
  insight: Insight
  state: RuneStateKind
  slot: number
  pos?: Vec2
  placedAt?: number // sim time of placement; drives rotation
  held: (string | null)[] // mote id per outer node (traveling or held)
  linkedObstacleId: string | null
  endlessSeed?: number
}

export interface Obstacle {
  id: string
  pos: Vec2
  layers: ObstacleLayerSpec[]
  index: number
  hp: number
  cleared: boolean
  endlessSeed?: number
}

export type SimStatus = 'playing' | 'won' | 'lost'

// Why the game called a loss: too little damage left for the HP standing,
// or nothing left to do (no rune can fill from the motes that remain).
export type LossReason = 'damage' | 'stuck'

// What the line played so far has done, for the result screen. Part of the
// board, so an undo takes back the stats of what it undoes.
export interface BoardStats {
  detonations: number
  landed: number // blows that took strength (HP removed)
  wasted: number // blows past a layer's last HP: damage never carries over
  unlinked: number // detonations whose middle matched nothing, so struck nothing
  destroyed: number // motes annihilated
}

export interface SimState {
  levelId: string
  field: Rect
  blockers: Rect[]
  motes: Mote[]
  runes: Rune[]
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
