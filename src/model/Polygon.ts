import type { ShapeSides, Vec2 } from '../core/types'

export interface PolygonSpec {
  sides: ShapeSides
  radius: number
  rotation?: number
}

export function verticesOf(spec: PolygonSpec, center: Vec2): Vec2[] {
  const { sides, radius, rotation = -Math.PI / 2 } = spec
  const verts: Vec2[] = []
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * 2 * Math.PI) / sides
    verts.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    })
  }
  return verts
}
