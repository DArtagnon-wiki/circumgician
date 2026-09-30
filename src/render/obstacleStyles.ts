import { Container, Graphics, Sprite, type FillGradient } from 'pixi.js'
import type { ObstacleMotion, ObstacleStyle } from '../model/Look'
import type { Vec2 } from '../sim/types'
import { centroid, diagonalGradient, drawFaceted, drawObsidian, insetPolygon, OBSIDIAN, seeded, sheenBand, type FacetColors } from './obsidian'
import { textures } from './textures'

// An obstacle's material: what its layers are made of and how that moves.
// Every material keeps the three things play reads off an obstacle clear:
// its shape (the silhouette), its strength (the black holes, drawn by the
// view on top of `art`) and its next layer (the view's ghost outline, in
// this material's `ghost` and `trim`).
export interface Material {
  readonly art: Container // the layer's body, under the black holes (body space)
  readonly swirl: number // accretion swirls round the holes (additive)
  readonly lens: number // the thin ring of bent light round each hole (additive)
  readonly ghost: number // the next layer's smoky outline
  readonly trim: number // its bright edge, pips and moons' rims
  readonly moon: number // satellites' fill
  readonly motion: ObstacleMotion // idle motion unless the level says otherwise
  build(outline: Vec2[], R: number): Vec2[] // draw a layer; returns its table
  update(time: number): void
}

export function makeMaterial(style: ObstacleStyle, seed: number): Material {
  switch (style) {
    case 'marble':
      return new Marble(seed)
    case 'magma':
      return new Magma(seed)
    case 'void':
      return new Void(seed)
    case 'astrolabe':
      return new Astrolabe()
    case 'monolith':
      return new Monolith(seed)
    case 'geode':
      return new Geode(seed)
    default:
      return new Obsidian(seed)
  }
}

const inradius = (R: number, sides: number) => R * Math.cos(Math.PI / sides)
const flat = (pts: Vec2[]) => pts.flatMap((p) => [p.x, p.y])
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

// Gradients are built once, on first use (after the renderer exists).
const gradients = new Map<string, FillGradient>()
const gradient = (stops: string[]) => {
  const key = stops.join()
  let g = gradients.get(key)
  if (!g) gradients.set(key, (g = diagonalGradient(stops)))
  return g
}

function sprite(tex: keyof ReturnType<typeof textures>, parent: Container, tint = 0xffffff): Sprite {
  const t = textures()[tex]
  const s = new Sprite(Array.isArray(t) ? t[0] : t)
  s.anchor.set(0.5)
  s.tint = tint
  parent.addChild(s)
  return s
}

// Points strictly inside a convex polygon, seeded.
function scatter(poly: Vec2[], n: number, r: () => number): Vec2[] {
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const inside = (p: Vec2) =>
    poly.every((a, i) => {
      const b = poly[(i + 1) % poly.length]
      return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0
    }) ||
    poly.every((a, i) => {
      const b = poly[(i + 1) % poly.length]
      return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) <= 0
    })
  const out: Vec2[] = []
  for (let k = 0; out.length < n && k < n * 30; k++) {
    const p = { x: x0 + r() * (x1 - x0), y: y0 + r() * (y1 - y0) }
    if (inside(p)) out.push(p)
  }
  return out
}

// ---------------------------------------------------------------------------
// Obsidian: faceted volcanic glass; now and then a band of light sweeps
// across the table.
// ---------------------------------------------------------------------------

const GLINT_EVERY = 4.2 // seconds between specular sweeps
const GLINT_TIME = 0.9

class Obsidian implements Material {
  readonly art = new Container()
  readonly swirl = 0xffb46e
  readonly lens = 0xe6dcff
  readonly ghost = OBSIDIAN.deep
  readonly trim = 0xb9a2ff
  readonly moon = 0x1c1430
  readonly motion = 'sway'
  private g = new Graphics()
  private glint = new Graphics()
  private table: Vec2[] = []
  private offset: number

  constructor(seed: number) {
    this.offset = seed % GLINT_EVERY
    this.glint.blendMode = 'add'
    this.art.addChild(this.g, this.glint)
  }

  build(outline: Vec2[], R: number): Vec2[] {
    this.g.clear()
    return (this.table = drawObsidian(this.g, outline, { inset: R * 0.34, rimAlpha: 0.9 }))
  }

  update(time: number): void {
    const g = this.glint
    g.clear()
    const u = ((time + this.offset) % GLINT_EVERY) / GLINT_TIME
    if (u >= 1 || this.table.length < 3) return
    const span = Math.max(...this.table.map((p) => Math.hypot(p.x, p.y)))
    const band = sheenBand(this.table, span * (1.2 - 2.4 * u), span * 0.12)
    if (band.length > 2) g.poly(flat(band)).fill({ color: OBSIDIAN.glint, alpha: 0.22 * Math.sin(u * Math.PI) })
  }
}

// ---------------------------------------------------------------------------
// Marble: pale veined stone, the one light obstacle. Its holes read as
// plain black sockets.
// ---------------------------------------------------------------------------

class Marble implements Material {
  readonly art = new Container()
  readonly swirl = 0x3a2a70
  readonly lens = 0x000000
  readonly ghost = 0xcfc7ba
  readonly trim = 0xf6f1e8
  readonly moon = 0xe4ddd1
  readonly motion = 'bob'
  private g = new Graphics()

  private seed: number

  constructor(seed: number) {
    this.seed = seed
    this.art.addChild(this.g)
  }

  build(outline: Vec2[], R: number): Vec2[] {
    const g = this.g
    g.clear()
    const colors: FacetColors = {
      deep: 0x7d766c,
      lit: 0xf6f1e8,
      rim: 0xb9b0a3,
      glint: 0xffffff,
      table: gradient(['#f4efe7', '#d9d1c4', '#b7ad9d']),
      edge: 0x1d1915,
      sheen: 0.2,
    }
    const table = drawFaceted(g, outline, { inset: R * 0.3, rimAlpha: 0.8 }, colors)
    // Veins: wandering hairlines across the stone, dark with a pale twin.
    const r = seeded(this.seed + R)
    const n = outline.length
    for (let k = 0; k < 3; k++) {
      const i = Math.floor(r() * n)
      let p = lerp(outline[i], outline[(i + 1) % n], 0.2 + r() * 0.6)
      const j = (i + 1 + Math.floor(r() * (n - 1))) % n
      const end = lerp(outline[j], outline[(j + 1) % n], 0.2 + r() * 0.6)
      const pts = [p]
      for (let s = 1; s <= 6; s++) {
        const q = lerp(p, end, 1 / (7 - s))
        p = { x: q.x + (r() - 0.5) * R * 0.18, y: q.y + (r() - 0.5) * R * 0.18 }
        pts.push(p)
      }
      g.poly(flat(pts), false).stroke({ color: 0x5e564c, width: 1, alpha: 0.6, join: 'round' })
      g.poly(flat(pts.map((q) => ({ x: q.x + 0.7, y: q.y + 0.5 }))), false).stroke({ color: 0xffffff, width: 0.5, alpha: 0.35, join: 'round' })
    }
    return table
  }

  update(): void {}
}

// ---------------------------------------------------------------------------
// Magma: basalt plates over a molten heart. Its seams flicker, the heart
// glows through, and embers drift up from it.
// ---------------------------------------------------------------------------

const EMBERS = 5

class Magma implements Material {
  readonly art = new Container()
  readonly swirl = 0xffc27a
  readonly lens = 0xffd9c0
  readonly ghost = 0x1a0906
  readonly trim = 0xffd2b0
  readonly moon = 0x2a120b
  readonly motion = 'pulse'
  private g = new Graphics()
  private heart: Sprite
  private seams = new Graphics()
  private embers: { s: Sprite; x: number; y: number; phase: number; speed: number }[] = []
  private R = 30

  private seed: number

  constructor(seed: number) {
    this.seed = seed
    const glow = new Container()
    glow.blendMode = 'add'
    this.heart = sprite('glow', glow, 0xff5a1f)
    glow.addChild(this.seams)
    this.art.addChild(this.g, glow)
    const r = seeded(seed)
    for (let k = 0; k < EMBERS; k++) this.embers.push({ s: sprite('starDot', glow, 0xffb060), x: 0, y: 0, phase: r(), speed: 0.25 + r() * 0.2 })
  }

  build(outline: Vec2[], R: number): Vec2[] {
    this.R = R
    const g = this.g
    g.clear()
    const colors: FacetColors = {
      deep: 0x0a0504,
      lit: 0x4d2a1d,
      rim: 0x8a5a44,
      glint: 0xffc49a,
      table: gradient(['#3a150a', '#1a0805', '#0a0302']),
      edge: 0x000000,
      sheen: 0.05,
    }
    const table = drawFaceted(g, outline, { inset: R * 0.3, rimAlpha: 0.7 }, colors)
    // Seams: from each table corner out to the rim, and a few across the
    // table, as a wide glow under a hot core line.
    const r = seeded(this.seed + R)
    const cracks: Vec2[][] = []
    table.forEach((a, i) => {
      const b = outline[i]
      const kink = { x: (a.x + b.x) / 2 + (r() - 0.5) * 3, y: (a.y + b.y) / 2 + (r() - 0.5) * 3 }
      cracks.push([a, kink, b])
    })
    const c = centroid(table)
    for (let k = 0; k < 3; k++) {
      const i = Math.floor(r() * table.length)
      const from = lerp(table[i], table[(i + 1) % table.length], 0.3 + r() * 0.4)
      const mid = lerp(from, c, 0.45 + r() * 0.2)
      cracks.push([from, { x: mid.x + (r() - 0.5) * R * 0.2, y: mid.y + (r() - 0.5) * R * 0.2 }, lerp(from, c, 0.85)])
    }
    const s = this.seams
    s.clear()
    for (const [w, color, alpha] of [
      [6, 0xff3a0a, 0.32],
      [2.2, 0xff7a1f, 0.7],
      [1, 0xffd08a, 0.95],
    ] as const)
      for (const crack of cracks) s.poly(flat(crack), false).stroke({ color, width: w, alpha, join: 'round', cap: 'round' })
    this.heart.scale.set((inradius(R, outline.length) * 3) / this.heart.texture.width)
    // Embers start along the table's upper edges.
    const top = table.filter((p) => p.y <= c.y + 1)
    const pick = seeded(this.seed + 7)
    for (const e of this.embers) {
      const p = top.length > 1 ? lerp(top[Math.floor(pick() * (top.length - 1))], top[Math.floor(pick() * (top.length - 1)) + 1], pick()) : c
      e.x = p.x
      e.y = p.y
    }
    return table
  }

  update(time: number): void {
    const flicker = 0.5 + 0.5 * Math.sin(time * 5.3 + this.seed) * Math.sin(time * 2.1 + 1)
    this.seams.alpha = 0.72 + 0.28 * flicker
    this.heart.alpha = 0.36 + 0.14 * Math.sin(time * 1.7 + this.seed)
    for (const e of this.embers) {
      const t = (time * e.speed + e.phase) % 1
      e.s.position.set(e.x + Math.sin(time * 3 + e.phase * 9) * 2, e.y - t * this.R * 1.5)
      e.s.alpha = Math.sin(t * Math.PI) * 0.9
      e.s.scale.set((1.6 - t) * 0.18)
    }
  }
}

// ---------------------------------------------------------------------------
// Void: a window cut into the sky, onto a deeper starfield. A bright rim,
// twinkling stars, drifting nebula; it turns slowly.
// ---------------------------------------------------------------------------

class Void implements Material {
  readonly art = new Container()
  readonly swirl = 0xb89cff
  readonly lens = 0xe6dcff
  readonly ghost = 0x05030f
  readonly trim = 0xd9ccff
  readonly moon = 0x0b0720
  readonly motion = 'spin'
  private g = new Graphics()
  private halo: Sprite
  private sky = new Container()
  private rim = new Graphics()
  private stars: { s: Sprite; base: number; speed: number; phase: number }[] = []
  private clouds: Sprite[] = []

  private seed: number

  constructor(seed: number) {
    this.seed = seed
    this.sky.blendMode = 'add'
    this.rim.blendMode = 'add'
    const glow = new Container()
    glow.blendMode = 'add'
    this.halo = sprite('glow', glow, 0x6a4cff)
    this.art.addChild(glow, this.g, this.sky, this.rim)
  }

  build(outline: Vec2[], R: number): Vec2[] {
    const g = this.g
    g.clear()
    g.poly(flat(outline)).fill({ color: 0x04020c })
    const table = insetPolygon(outline, R * 0.14)
    g.poly(flat(table)).stroke({ color: 0x8f7bff, width: 0.8, alpha: 0.2 })
    this.sky.removeChildren().forEach((c) => c.destroy())
    const r = seeded(this.seed + R)
    const ir = inradius(R, outline.length)
    this.halo.scale.set((R * 3.2) / this.halo.texture.width)
    this.halo.alpha = 0.35
    this.clouds = [
      [0x6a4cff, 0.6, 1.7],
      [0xd46cff, 0.35, 1.2],
    ].map(([tint, alpha, size]) => {
      const s = sprite('smoke', this.sky, tint)
      s.alpha = alpha
      s.scale.set((ir * size) / s.texture.width)
      s.position.set((r() - 0.5) * ir * 0.3, (r() - 0.5) * ir * 0.3)
      return s
    })
    this.stars = scatter(insetPolygon(outline, R * 0.18), Math.round(10 + R * 0.4), r).map((p) => {
      const s = sprite('starDot', this.sky, [0xffffff, 0xd9ccff, 0xcfe4ff][Math.floor(r() * 3)])
      s.position.set(p.x, p.y)
      s.scale.set(0.16 + r() * 0.22)
      return { s, base: 0.5 + r() * 0.5, speed: 1 + r() * 2.5, phase: r() * 6.3 }
    })
    const m = this.rim
    m.clear()
    m.poly(flat(outline)).stroke({ color: 0x8f7bff, width: 6, alpha: 0.22 })
    m.poly(flat(outline)).stroke({ color: 0xb9a8ff, width: 2.4, alpha: 0.35 })
    g.poly(flat(outline)).stroke({ color: 0xefe9ff, width: 1.2, alpha: 0.95 })
    return table
  }

  update(time: number): void {
    for (const st of this.stars) st.s.alpha = st.base * (0.45 + 0.55 * Math.abs(Math.sin(time * st.speed + st.phase)))
    this.clouds.forEach((c, i) => (c.rotation = time * (i ? -0.12 : 0.08)))
  }
}

// ---------------------------------------------------------------------------
// Astrolabe: a bronze instrument with an enamel face. Graduated rings turn
// on it; the body itself holds still.
// ---------------------------------------------------------------------------

const GILT = 0xe6c170

class Astrolabe implements Material {
  readonly art = new Container()
  readonly swirl = 0xffd27a
  readonly lens = 0xfff0cc
  readonly ghost = 0x1c1309
  readonly trim = 0xd9c49a
  readonly moon = 0x6b5128
  readonly motion = 'still'
  private g = new Graphics()
  private ring = new Graphics()
  private inner = new Graphics()

  constructor() {
    this.art.addChild(this.g, this.ring, this.inner)
  }

  build(outline: Vec2[], R: number): Vec2[] {
    const g = this.g
    g.clear()
    const colors: FacetColors = {
      deep: 0x1c1309,
      lit: 0x9a7a44,
      rim: 0xc9a25e,
      glint: 0xffe2a6,
      table: gradient(['#241c3e', '#130e24', '#08060f']),
      edge: 0x000000,
      sheen: 0.06,
    }
    const table = drawFaceted(g, outline, { inset: R * 0.24, rimAlpha: 0.9 }, colors)
    g.poly(flat(outline)).stroke({ color: GILT, width: 1.2, alpha: 0.8 })
    g.poly(flat(table)).stroke({ color: GILT, width: 0.8, alpha: 0.5 })
    // Graduations just inside the face's edge.
    const c = centroid(table)
    table.forEach((a, i) => {
      const b = table[(i + 1) % table.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      const ticks = Math.max(2, Math.floor(len / 5))
      for (let k = 1; k < ticks; k++) {
        const p = lerp(a, b, k / ticks)
        const d = Math.hypot(c.x - p.x, c.y - p.y) || 1
        const l = k % 4 === 0 ? 3.5 : 2
        g.moveTo(p.x, p.y).lineTo(p.x + ((c.x - p.x) / d) * l, p.y + ((c.y - p.y) / d) * l)
      }
    })
    g.stroke({ color: GILT, width: 0.7, alpha: 0.45 })
    // The armillary ring: just clear of the corners, graduated, turning.
    const rr = R * 1.1
    const ring = this.ring
    ring.clear()
    ring.circle(0, 0, rr).stroke({ color: 0x1c1309, width: 3, alpha: 0.6 })
    ring.circle(0, 0, rr).stroke({ color: GILT, width: 0.9, alpha: 0.75 })
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2
      const l = k % 9 === 0 ? 4 : 2
      ring.moveTo(Math.cos(a) * rr, Math.sin(a) * rr).lineTo(Math.cos(a) * (rr + l), Math.sin(a) * (rr + l))
    }
    ring.stroke({ color: GILT, width: 0.8, alpha: 0.6 })
    for (const a of [0.3, 2.4, 4.3]) ring.circle(Math.cos(a) * rr, Math.sin(a) * rr, 1.6).fill({ color: GILT, alpha: 0.9 })
    // An echo of the shape on the face, turning the other way.
    const inner = this.inner
    inner.clear()
    const n = outline.length
    const ir = (inradius(R, n) - R * 0.24) * 0.85
    const pts = Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2
      return { x: Math.cos(a) * ir, y: Math.sin(a) * ir }
    })
    inner.poly(flat(pts)).stroke({ color: GILT, width: 0.8, alpha: 0.4 })
    return table
  }

  update(time: number): void {
    this.ring.rotation = time * 0.18
    this.inner.rotation = -time * 0.3
  }
}

// ---------------------------------------------------------------------------
// Monolith: slate carved with a glyph on every face; a light runs round
// them in turn.
// ---------------------------------------------------------------------------

// Glyphs in a unit box, as strokes.
const GLYPHS: [number, number][][][] = [
  [[[0, -1], [0, 1]], [[0, -0.2], [0.7, -0.9]], [[0, 0.4], [0.7, -0.3]]],
  [[[-0.7, 1], [0, -1], [0.7, 1]], [[-0.35, 0.2], [0.35, 0.2]]],
  [[[-0.6, -1], [0.6, -1], [-0.6, 1], [0.6, 1]]],
  [[[0, -1], [0, 1]], [[-0.7, -0.4], [0, 0.1], [0.7, -0.4]]],
  [[[-0.7, 0], [0, -1], [0.7, 0], [0, 1], [-0.7, 0]]],
  [[[-0.6, -1], [-0.6, 1]], [[-0.6, -1], [0.6, -0.4], [-0.6, 0.2]]],
]

class Monolith implements Material {
  readonly art = new Container()
  readonly swirl = 0xc8b8ff
  readonly lens = 0xe6dcff
  readonly ghost = 0x0f1317
  readonly trim = 0xaab4c0
  readonly moon = 0x2d363f
  readonly motion = 'bob'
  private g = new Graphics()
  private glow = new Container()
  private glyphs: Graphics[] = []

  private seed: number

  constructor(seed: number) {
    this.seed = seed
    this.glow.blendMode = 'add'
    this.art.addChild(this.g, this.glow)
  }

  build(outline: Vec2[], R: number): Vec2[] {
    const g = this.g
    g.clear()
    const colors: FacetColors = {
      deep: 0x0c1014,
      lit: 0x5f6b77,
      rim: 0x8c98a6,
      glint: 0xe8eef5,
      table: gradient(['#2d363f', '#1b2128', '#0f1317']),
      edge: 0x000000,
      sheen: 0.05,
    }
    const inset = R * 0.42
    const table = drawFaceted(g, outline, { inset, rimAlpha: 0.75 }, colors)
    const r = seeded(this.seed + R)
    for (const p of scatter(table, 22, r)) g.circle(p.x, p.y, 0.4 + r() * 0.5).fill({ color: r() < 0.5 ? 0x8994a0 : 0x05070a, alpha: 0.3 })
    this.glow.removeChildren().forEach((c) => c.destroy())
    const n = outline.length
    const size = Math.min(inset * 0.5, (Math.hypot(outline[1].x - outline[0].x, outline[1].y - outline[0].y) - inset) * 0.26)
    this.glyphs = outline.map((a, i) => {
      const b = outline[(i + 1) % n]
      const ta = table[i]
      const tb = table[(i + 1) % n]
      const mid = lerp(lerp(a, b, 0.5), lerp(ta, tb, 0.5), 0.5)
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      const glyph = new Graphics()
      const shape = GLYPHS[Math.floor(r() * GLYPHS.length)]
      for (const [w, alpha] of [
        [3.2, 0.3],
        [1.1, 1],
      ])
        for (const stroke of shape) glyph.poly(stroke.flatMap(([x, y]) => [x * size * 0.7, y * size]), false).stroke({ color: 0xdcd2ff, width: w, alpha, cap: 'round', join: 'round' })
      glyph.position.set(mid.x, mid.y)
      glyph.rotation = angle
      this.glow.addChild(glyph)
      return glyph
    })
    return table
  }

  update(time: number): void {
    const n = this.glyphs.length
    this.glyphs.forEach((glyph, i) => {
      const u = (((time * 0.25 - i / n) % 1) + 1) % 1
      glyph.alpha = 0.5 + 0.5 * Math.pow(Math.max(0, Math.cos(u * Math.PI * 2)), 4)
    })
  }
}

// ---------------------------------------------------------------------------
// Geode: a rough crust split open on crystals that point inward; a few of
// their tips catch the light.
// ---------------------------------------------------------------------------

class Geode implements Material {
  readonly art = new Container()
  readonly swirl = 0xffb46e
  readonly lens = 0xe6dcff
  readonly ghost = 0x17120e
  readonly trim = 0xe7ddff
  readonly moon = 0x3a3030
  readonly motion = 'sway'
  private g = new Graphics()
  private glints = new Container()
  private sparks: { s: Sprite; phase: number }[] = []

  private seed: number

  constructor(seed: number) {
    this.seed = seed
    this.glints.blendMode = 'add'
    this.art.addChild(this.g, this.glints)
  }

  build(outline: Vec2[], R: number): Vec2[] {
    const g = this.g
    g.clear()
    const colors: FacetColors = { deep: 0x17120e, lit: 0x6a5d52, rim: 0x9b8b7c, glint: 0xf3e9dc, table: 0x0c0910, edge: 0x000000, sheen: 0 }
    const table = drawFaceted(g, outline, { inset: R * 0.22, rimAlpha: 0.7 }, colors)
    const c = centroid(table)
    const r = seeded(this.seed + R)
    const tips: Vec2[] = []
    table.forEach((a, i) => {
      const b = table[(i + 1) % table.length]
      const k = 3
      for (let j = 0; j < k; j++) {
        const p = lerp(a, b, j / k)
        const q = lerp(a, b, (j + 1) / k)
        const base = lerp(p, q, 0.5)
        const tip = lerp(base, c, 0.38 + r() * 0.2)
        tips.push(tip)
        // Two faces per crystal: the one toward the light paler.
        g.poly(flat([p, base, tip])).fill({ color: 0xf1ebff, alpha: 0.5 + r() * 0.15 })
        g.poly(flat([base, q, tip])).fill({ color: 0xb8a9d9, alpha: 0.4 + r() * 0.15 })
        g.poly(flat([p, tip, q])).stroke({ color: 0xffffff, width: 0.6, alpha: 0.35, join: 'round' })
      }
    })
    g.circle(c.x, c.y, inradius(R, outline.length) * 0.2).fill({ color: 0x0c0910, alpha: 0.6 })
    this.glints.removeChildren().forEach((s) => s.destroy())
    this.sparks = tips
      .filter(() => r() < 0.35)
      .slice(0, 4)
      .map((p) => {
        const s = sprite('star', this.glints, 0xf4eeff)
        s.position.set(p.x, p.y)
        return { s, phase: r() * 6.3 }
      })
    return table
  }

  update(time: number): void {
    for (const sp of this.sparks) {
      const b = Math.max(0, Math.sin(time * 1.3 + sp.phase))
      sp.s.alpha = Math.pow(b, 8)
      sp.s.scale.set(0.25 + 0.2 * sp.s.alpha)
    }
  }
}
