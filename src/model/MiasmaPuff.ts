import type { Id, Vec2 } from '../core/types'
import type { MoteColor } from './Color'

export type PuffState = 'free' | 'traveling' | 'consumed'

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
}
