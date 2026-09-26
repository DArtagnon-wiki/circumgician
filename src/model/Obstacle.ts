import type { Id, Vec2 } from '../core/types'
import type { PolygonSpec } from './Polygon'

export interface Obstacle {
  id: Id
  shape: PolygonSpec
  position: Vec2 // normalized 0..1 within the obstacle area
  hp: number
  maxHp: number
}
