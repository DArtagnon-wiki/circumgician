import type { Id, ShapeSides, Vec2 } from '../core/types'
import type { Obstacle } from '../model/Obstacle'

// Shared by DragPlacementSystem (initial drop) and DetonationSystem (relink
// after a rune's middle shape changes on promotion) — nearest obstacle
// sharing the given shape, measured from a world-space point.
export function findNearestObstacleByShape(
  obstacles: Obstacle[],
  shapeSides: ShapeSides,
  fromPos: Vec2,
  getPosition: (id: Id) => Vec2 | undefined,
): Obstacle | null {
  const candidates = obstacles.filter((o) => o.shape.sides === shapeSides)
  if (candidates.length === 0) return null

  let nearest: Obstacle | null = null
  let nearestDistSq = Infinity
  for (const obstacle of candidates) {
    const pos = getPosition(obstacle.id)
    if (!pos) continue
    const dx = pos.x - fromPos.x
    const dy = pos.y - fromPos.y
    const distSq = dx * dx + dy * dy
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq
      nearest = obstacle
    }
  }
  return nearest
}
