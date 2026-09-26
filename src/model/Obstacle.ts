import type { Id, Vec2 } from '../core/types'
import type { PolygonSpec } from './Polygon'

export interface Obstacle {
  id: Id
  shape: PolygonSpec // the CURRENT active (innermost) layer's shape only
  position: Vec2 // normalized 0..1 within the obstacle area
  hp: number
  maxHp: number
  // How many layers have already appeared, including the current one (starts
  // at 0). Fed to the obstacle's growth strategy when this layer collapses —
  // deliberately not storing future layers here, so "what's next" only ever
  // lives inside the growth strategy, never on the model the renderer reads.
  layerIndex: number
}
