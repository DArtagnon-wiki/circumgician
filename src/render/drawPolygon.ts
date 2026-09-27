import type { Graphics } from 'pixi.js'
import { polygonPoints } from '../sim/geometry'

export interface PolygonStyle {
  fillColor?: number
  fillAlpha?: number
  strokeColor?: number
  strokeWidth?: number
  strokeAlpha?: number
}

// Drawn around the local origin with a vertex pointing up (rotation 0);
// callers rotate the owning Graphics to spin it.
export function drawPolygon(g: Graphics, sides: number, radius: number, style: PolygonStyle = {}): void {
  const pts = polygonPoints({ x: 0, y: 0 }, sides, radius, -Math.PI / 2)
  g.poly(pts.flatMap((p) => [p.x, p.y]))
  if (style.fillColor !== undefined) g.fill({ color: style.fillColor, alpha: style.fillAlpha ?? 1 })
  if (style.strokeColor !== undefined) g.stroke({ color: style.strokeColor, width: style.strokeWidth ?? 2, alpha: style.strokeAlpha ?? 1 })
}

export function localVertices(sides: number, radius: number) {
  return polygonPoints({ x: 0, y: 0 }, sides, radius, -Math.PI / 2)
}
