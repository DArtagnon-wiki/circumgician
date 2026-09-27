import type { Id, Vec2 } from '../core/types'
import type { MoteColor } from './Color'

export type PuffState = 'free' | 'ejecting' | 'traveling' | 'consumed'

export interface MiasmaPuff {
  id: Id
  position: Vec2
  velocity: Vec2
  state: PuffState
  color: MoteColor
  targetRuneId?: Id
  targetNodeIndex?: number
  // Position at the moment this puff was reserved, and elapsed travel time —
  // used to ease-in interpolate toward the target deterministically (see
  // AttractionFillSystem) rather than a velocity/acceleration pursuit, which
  // can orbit a stationary target indefinitely without ever converging.
  travelStartPos?: Vec2
  travelElapsed?: number
  // Set when a detonation releases this puff — tracks how long it's been
  // flying outward from the rune at speed (see MiasmaFieldSystem's
  // 'ejecting' branch) before decaying back to normal ambient drift.
  ejectElapsed?: number
}
