import type { Id, Vec2 } from '../core/types'

export type PuffState = 'free' | 'traveling' | 'consumed'

export interface MiasmaPuff {
  id: Id
  position: Vec2
  velocity: Vec2
  state: PuffState
  targetRuneId?: Id
  targetNodeIndex?: number
}
