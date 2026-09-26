import type { ShapeSides, Vec2 } from '../core/types'

export interface PolygonSpec {
  sides: ShapeSides
  radius: number
  rotation?: number
}

// Rune outer radius scales with side count so field packing actually costs
// more for bigger runes (a 7-gon takes up visibly more room than a triangle).
export function radiusForSides(sides: ShapeSides, base = 20, perSide = 4): number {
  return base + sides * perSide
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
