import { Graphics } from 'pixi.js'
import type { Vec2 } from '../core/types'
import type { PolygonSpec } from '../model/Polygon'
import { verticesOf } from '../model/Polygon'

export interface PolygonStyle {
  fillColor?: number
  fillAlpha?: number
  strokeColor?: number
  strokeWidth?: number
}

export function drawPolygon(g: Graphics, spec: PolygonSpec, center: Vec2, style: PolygonStyle = {}): void {
  const verts = verticesOf(spec, center)
  const points = verts.flatMap((v) => [v.x, v.y])
  g.poly(points)
  if (style.fillColor !== undefined) {
    g.fill({ color: style.fillColor, alpha: style.fillAlpha ?? 1 })
  }
  if (style.strokeColor !== undefined) {
    g.stroke({ color: style.strokeColor, width: style.strokeWidth ?? 2 })
  }
}
