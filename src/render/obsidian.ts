import { FillGradient, type Graphics } from 'pixi.js'
import type { Vec2 } from '../sim/types'
import { mix } from './Theme'

// Faceted obsidian shared by obstacles and blockers: a bevel of facets
// between the outline and an inset "table", each shaded by how squarely
// its outward normal faces the light (top-left), alternating slightly so
// neighbours never merge; then a sharp rim with glints on lit edges.

export const OBSIDIAN = {
  deep: 0x040208,
  lit: 0x4b3a7c,
  rim: 0x9a86d8,
  glint: 0xf1e9ff,
}

// One shared gradient in each shape's local bounds: lit top-left to black.
let tableFill: FillGradient | null = null
function tableGradient(): FillGradient {
  return (tableFill ??= new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: '#241a40' },
      { offset: 0.55, color: '#0e0a1a' },
      { offset: 1, color: '#050309' },
    ],
  }))
}

// Sutherland-Hodgman against the half-plane n.p <= d (convex input).
export function clipHalfPlane(poly: Vec2[], nx: number, ny: number, d: number): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const da = a.x * nx + a.y * ny - d
    const db = b.x * nx + b.y * ny - d
    if (da <= 0) out.push(a)
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

// A glossy reflection band across a convex polygon, perpendicular to the
// light, centered at offset `at` (px along the light axis from the
// centroid) with half-width `half`.
export function sheenBand(poly: Vec2[], at: number, half: number): Vec2[] {
  const c = centroid(poly)
  const nx = -LIGHT.x
  const ny = -LIGHT.y
  const base = c.x * nx + c.y * ny + at
  return clipHalfPlane(clipHalfPlane(poly, nx, ny, base + half), -nx, -ny, -(base - half))
}

export const LIGHT = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }

export interface ObsidianStyle {
  inset: number // bevel width (px); the table is the outline pulled in by this
  alpha?: number
  rimAlpha?: number
  fractures?: number // seeded hairline cracks across the table
  seed?: number
}

// A faceted stone's colors: facets shade from `deep` (turned from the
// light) to `lit` (facing it); `rim` and `glint` light its edges, `table`
// fills the flat top, `edge` separates it from what is behind, and
// `sheen` sets how glossy the table's static streak is.
export interface FacetColors {
  deep: number
  lit: number
  rim: number
  glint: number
  table: FillGradient | number
  edge: number
  sheen: number
}

// Lit top-left to dark, in each shape's local bounds.
export function diagonalGradient(stops: string[]): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    textureSpace: 'local',
    colorStops: stops.map((color, i) => ({ offset: i / (stops.length - 1), color })),
  })
}

export function centroid(pts: Vec2[]): Vec2 {
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  return { x: x / pts.length, y: y / pts.length }
}

// Offsets every edge of a convex, clockwise-or-not polygon inward by d and
// intersects neighbours. Falls back toward the centroid if d is too large.
export function insetPolygon(pts: Vec2[], d: number): Vec2[] {
  const n = pts.length
  const c = centroid(pts)
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n]
    let nx = -(b.y - a.y)
    let ny = b.x - a.x
    const len = Math.hypot(nx, ny) || 1
    nx /= len
    ny /= len
    // Point the normal inward (toward the centroid).
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    if ((c.x - mx) * nx + (c.y - my) * ny < 0) {
      nx = -nx
      ny = -ny
    }
    return { px: a.x + nx * d, py: a.y + ny * d, dx: b.x - a.x, dy: b.y - a.y }
  })
  return pts.map((p, i) => {
    const l1 = lines[(i + n - 1) % n]
    const l2 = lines[i]
    const den = l1.dx * l2.dy - l1.dy * l2.dx
    if (Math.abs(den) < 1e-6) return { x: p.x + (c.x - p.x) * 0.3, y: p.y + (c.y - p.y) * 0.3 }
    const t = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / den
    return { x: l1.px + l1.dx * t, y: l1.py + l1.dy * t }
  })
}

export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9
    s ^= s >>> 13
    return (s >>> 0) / 4294967296
  }
}

// Draws into g in its local space. Returns the table polygon for callers
// that layer more detail (black holes, glints) on top.
export function drawObsidian(g: Graphics, outline: Vec2[], style: ObsidianStyle): Vec2[] {
  return drawFaceted(g, outline, style, { ...OBSIDIAN, table: tableGradient(), edge: 0x000000, sheen: 0.07 })
}

// Any faceted stone, obsidian's structure in other colors.
export function drawFaceted(g: Graphics, outline: Vec2[], style: ObsidianStyle, colors: FacetColors): Vec2[] {
  const alpha = style.alpha ?? 1
  const n = outline.length
  const table = insetPolygon(outline, style.inset)
  const c = centroid(outline)

  for (let i = 0; i < n; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % n]
    const ta = table[i]
    const tb = table[(i + 1) % n]
    // Outward normal of this edge (flipped if it points at the centroid).
    let nx = b.y - a.y
    let ny = -(b.x - a.x)
    const len = Math.hypot(nx, ny) || 1
    nx /= len
    ny /= len
    if (((a.x + b.x) / 2 - c.x) * nx + ((a.y + b.y) / 2 - c.y) * ny < 0) {
      nx = -nx
      ny = -ny
    }
    const lit = Math.max(0, nx * LIGHT.x + ny * LIGHT.y)
    const shade = Math.min(1, lit * 0.85 + (i % 2 ? 0.04 : 0.12))
    g.poly([a.x, a.y, b.x, b.y, tb.x, tb.y, ta.x, ta.y]).fill({ color: mix(colors.deep, colors.lit, shade), alpha })
  }
  const tableFill = typeof colors.table === 'number' ? { color: colors.table, alpha } : { fill: colors.table, alpha }
  g.poly(table.flatMap((p) => [p.x, p.y])).fill(tableFill)
  // A static glossy streak on the table; obstacles add a moving glint.
  const span = Math.max(...table.map((p) => Math.abs((p.x - c.x) * LIGHT.x + (p.y - c.y) * LIGHT.y)))
  const band = sheenBand(table, -span * 0.35, span * 0.16)
  if (band.length > 2) g.poly(band.flatMap((p) => [p.x, p.y])).fill({ color: colors.glint, alpha: colors.sheen * alpha })

  // Facet seams: faint light where planes meet.
  for (let i = 0; i < n; i++) g.moveTo(outline[i].x, outline[i].y).lineTo(table[i].x, table[i].y)
  g.stroke({ color: colors.rim, width: 0.6, alpha: 0.22 * alpha })
  g.poly(table.flatMap((p) => [p.x, p.y])).stroke({ color: colors.rim, width: 0.7, alpha: 0.28 * alpha })

  if (style.fractures) {
    const r = seeded(style.seed ?? 1)
    for (let k = 0; k < style.fractures; k++) {
      const i = Math.floor(r() * n)
      const a = table[i]
      const b = table[(i + 1) % n]
      const t = 0.2 + r() * 0.6
      let x = a.x + (b.x - a.x) * t
      let y = a.y + (b.y - a.y) * t
      g.moveTo(x, y)
      const steps = 3 + Math.floor(r() * 3)
      for (let s = 0; s < steps; s++) {
        x += (c.x - x) * (0.25 + r() * 0.2) + (r() - 0.5) * 6
        y += (c.y - y) * (0.25 + r() * 0.2) + (r() - 0.5) * 6
        g.lineTo(x, y)
      }
    }
    g.stroke({ color: colors.rim, width: 0.6, alpha: 0.2 * alpha })
  }

  // Rim: a dark outer line for separation, then the lit edge on top,
  // brightest where the edge faces the light.
  g.poly(outline.flatMap((p) => [p.x, p.y])).stroke({ color: colors.edge, width: 2.2, alpha: 0.5 * alpha })
  const rimAlpha = style.rimAlpha ?? 0.7
  for (let i = 0; i < n; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % n]
    const mx = (a.x + b.x) / 2 - c.x
    const my = (a.y + b.y) / 2 - c.y
    const ml = Math.hypot(mx, my) || 1
    const lit = Math.max(0, (mx / ml) * LIGHT.x + (my / ml) * LIGHT.y)
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: lit > 0.5 ? colors.glint : colors.rim, width: 1.1, alpha: (0.3 + lit * 0.7) * rimAlpha * alpha })
  }
  return table
}
