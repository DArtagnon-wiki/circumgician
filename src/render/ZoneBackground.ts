import { Container, FillGradient, Graphics, Sprite } from 'pixi.js'
import { FIELD_ZONE, INVENTORY_ZONE, VIRTUAL_H, VIRTUAL_W } from '../sim/constants'
import type { Rect, Vec2 } from '../sim/types'
import { ZONE_COLORS } from './Theme'
import { textures } from './textures'
import { drawObsidian } from './obsidian'

const TAU = Math.PI * 2
const STAR_TINTS = [0xffffff, 0xdfe6ff, 0xffe2f1, 0xfff1d6, 0xe8dcff]
const DRIFT = { x: -0.45, y: 0.89 } // the sky turns slowly down and to the left
export const MAX_STARS = 48

interface Star {
  s: Sprite
  speed: number
  base: number
  phase: number
  freq: number
}

// Constellations in the sky's usual empty margins (virtual px).
const CONSTELLATIONS: { pts: [number, number][]; edges: [number, number][] }[] = [
  { pts: [[22, 70], [50, 44], [84, 56], [108, 30], [72, 94]], edges: [[0, 1], [1, 2], [2, 3], [2, 4]] },
  { pts: [[322, 224], [348, 240], [376, 228], [360, 268], [334, 284]], edges: [[0, 1], [1, 2], [1, 3], [3, 4]] },
  { pts: [[24, 236], [52, 256], [40, 288], [76, 280]], edges: [[0, 1], [1, 2], [1, 3]] },
]

// Rune-ish marks in unit space, stamped around the arcane circles.
const GLYPHS: [number, number, number, number][][] = [
  [[0, -1, 0, 1], [-0.7, -0.3, 0.7, 0.3]],
  [[-0.7, -1, 0.7, 1], [0.7, -1, -0.7, 1]],
  [[-0.5, -1, -0.5, 1], [-0.5, 0, 0.6, -0.8], [-0.5, 0, 0.6, 0.8]],
  [[0, -1, -0.8, 1], [0, -1, 0.8, 1], [-0.5, 0.3, 0.5, 0.3]],
  [[-0.7, -1, 0.7, -1], [0, -1, 0, 1], [-0.7, 1, 0.7, 1]],
  [[-0.7, 1, 0, -1], [0, -1, 0.7, 1], [0, 0, 0, 1]],
]

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Concentric rings, a ruler of ticks, an inscribed heptagram and a band of
// glyphs. Drawn once; the owner only rotates it.
function arcaneCircle(r: number, seed: number): Graphics {
  const g = new Graphics()
  const color = ZONE_COLORS.etch
  const rand = seeded(seed)
  for (const [k, a] of [[1, 0.55], [0.93, 0.4], [0.64, 0.4], [0.58, 0.25], [0.18, 0.35]] as const) g.circle(0, 0, r * k).stroke({ color, width: 0.8, alpha: a })
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * TAU
    const r1 = i % 5 === 0 ? r : r * 0.965
    g.moveTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93).lineTo(Math.cos(a) * r1, Math.sin(a) * r1)
  }
  g.stroke({ color, width: 0.6, alpha: 0.4 })
  const star = Array.from({ length: 7 }, (_, i) => {
    const a = -Math.PI / 2 + (i * TAU) / 7
    return { x: Math.cos(a) * r * 0.58, y: Math.sin(a) * r * 0.58 }
  })
  g.moveTo(star[0].x, star[0].y)
  for (let k = 1; k <= 7; k++) g.lineTo(star[(k * 3) % 7].x, star[(k * 3) % 7].y)
  g.stroke({ color, width: 0.7, alpha: 0.35 })
  const count = 14
  const gr = r * 0.785
  const size = Math.min(6, r * 0.05)
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU
    const cx = Math.cos(a) * gr
    const cy = Math.sin(a) * gr
    const ca = Math.cos(a + Math.PI / 2)
    const sa = Math.sin(a + Math.PI / 2)
    for (const [x1, y1, x2, y2] of GLYPHS[Math.floor(rand() * GLYPHS.length)]) {
      g.moveTo(cx + (x1 * ca - y1 * sa) * size, cy + (x1 * sa + y1 * ca) * size).lineTo(cx + (x2 * ca - y2 * sa) * size, cy + (x2 * sa + y2 * ca) * size)
    }
  }
  g.stroke({ color, width: 0.8, alpha: 0.45, cap: 'round' })
  return g
}

function linear(x0: number, y0: number, x1: number, y1: number, colorStops: { offset: number; color: string }[]): FillGradient {
  return new FillGradient({ type: 'linear', start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, textureSpace: 'global', colorStops })
}

// Gradients own GPU textures and are the same for every level, so they are
// made once and shared rather than rebuilt (and leaked) per scene.
const HORIZON = FIELD_ZONE.y - 12
let gradients: { fade: FillGradient; shelf: FillGradient; gilt: FillGradient } | null = null
function sharedGradients() {
  return (gradients ??= {
    // The middle zone sinks into shadow below a soft horizon under the sky.
    fade: linear(0, HORIZON, 0, INVENTORY_ZONE.y, [
      { offset: 0, color: 'rgba(4,2,8,0)' },
      { offset: 40 / (INVENTORY_ZONE.y - HORIZON), color: 'rgba(4,2,8,0.5)' },
      { offset: 1, color: 'rgba(4,2,8,0.58)' },
    ]),
    shelf: linear(0, INVENTORY_ZONE.y, 0, INVENTORY_ZONE.y + INVENTORY_ZONE.h, [
      { offset: 0, color: 'rgba(26,14,50,0.72)' },
      { offset: 1, color: 'rgba(6,3,12,0.9)' },
    ]),
    gilt: linear(0, 0, VIRTUAL_W, 0, [
      { offset: 0, color: 'rgba(217,184,114,0)' },
      { offset: 0.5, color: 'rgba(217,184,114,0.8)' },
      { offset: 1, color: 'rgba(217,184,114,0)' },
    ]),
  })
}

function roundRectPath(g: Graphics, r: Rect, inset: number, radius: number): Graphics {
  return g.roundRect(r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2, Math.max(1, radius - inset))
}

// The field's etched ring: an engraved double line (each with a dark
// under-cut) with rune ticks between, gilt pips at intervals and corners.
function fieldRing(field: Rect): Graphics {
  const g = new Graphics()
  const R = 14
  const etch = ZONE_COLORS.etch
  // Soft halo outside the ring.
  roundRectPath(g, field, -3, R).stroke({ color: ZONE_COLORS.fieldEdge, width: 6, alpha: 0.08 })
  for (const [inset, width, alpha] of [[0, 1.3, 0.62], [6, 0.8, 0.34]] as const) {
    g.roundRect(field.x + inset + 0.8, field.y + inset + 1, field.w - inset * 2, field.h - inset * 2, R - inset).stroke({ color: 0x000000, width, alpha: 0.6 })
    roundRectPath(g, field, inset, R).stroke({ color: etch, width, alpha })
  }
  // Ticks along the straight runs, a gilt diamond every fifth.
  const pips: Vec2[] = []
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const steps = Math.max(1, Math.round(len / 11))
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      const x = x0 + (x1 - x0) * t
      const y = y0 + (y1 - y0) * t
      if (i % 5 === 0) pips.push({ x: x + nx * 3, y: y + ny * 3 })
      else g.moveTo(x + nx * 1.5, y + ny * 1.5).lineTo(x + nx * (i % 5 === 0 ? 5 : 4), y + ny * (i % 5 === 0 ? 5 : 4))
    }
  }
  const { x, y, w, h } = field
  edge(x + R, y, x + w - R, y, 0, 1)
  edge(x + R, y + h, x + w - R, y + h, 0, -1)
  edge(x, y + R, x, y + h - R, 1, 0)
  edge(x + w, y + R, x + w, y + h - R, -1, 0)
  g.stroke({ color: etch, width: 0.7, alpha: 0.32 })
  for (const p of pips) g.poly([p.x, p.y - 2, p.x + 2, p.y, p.x, p.y + 2, p.x - 2, p.y]).fill({ color: ZONE_COLORS.gilt, alpha: 0.55 })
  // Corner stars.
  for (const [cx, cy] of [[x + 3, y + 3], [x + w - 3, y + 3], [x + 3, y + h - 3], [x + w - 3, y + h - 3]]) {
    g.poly([cx, cy - 4, cx + 1, cy - 1, cx + 4, cy, cx + 1, cy + 1, cx, cy + 4, cx - 1, cy + 1, cx - 4, cy, cx - 1, cy - 1]).fill({ color: ZONE_COLORS.gilt, alpha: 0.7 })
  }
  return g
}

function chamferedRect(b: Rect, c: number): Vec2[] {
  const k = Math.min(c, b.w / 3, b.h / 3)
  return [
    { x: b.x + k, y: b.y },
    { x: b.x + b.w - k, y: b.y },
    { x: b.x + b.w, y: b.y + k },
    { x: b.x + b.w, y: b.y + b.h - k },
    { x: b.x + b.w - k, y: b.y + b.h },
    { x: b.x + k, y: b.y + b.h },
    { x: b.x, y: b.y + b.h - k },
    { x: b.x, y: b.y + k },
  ]
}

// Blockers are obsidian slabs, the same material as obstacles.
function blockerSlabs(blockers: Rect[]): Graphics {
  const g = new Graphics()
  for (const b of blockers) {
    const outline = chamferedRect(b, 5)
    g.poly(outline.flatMap((p) => [p.x + 2, p.y + 3])).fill({ color: 0x000000, alpha: 0.4 })
    drawObsidian(g, outline, { inset: Math.min(6, b.w / 4, b.h / 4), fractures: 2 + Math.floor((b.w * b.h) / 4000), seed: Math.round(b.x * 31 + b.y * 17 + b.w) })
  }
  return g
}

function shelf(): Graphics {
  const g = new Graphics()
  const { y, h } = INVENTORY_ZONE
  const W = VIRTUAL_W
  const { shelf: fill, gilt: line } = sharedGradients()
  g.rect(0, y, W, h).fill(fill)
  g.moveTo(0, y + 0.5).lineTo(W, y + 0.5).stroke({ fill: line, width: 1 })
  g.moveTo(40, y + 4).lineTo(W - 40, y + 4).stroke({ fill: line, width: 0.6, alpha: 0.35 })
  // Central filigree: a diamond flanked by two curls.
  const cx = W / 2
  g.poly([cx, y - 4, cx + 5, y + 0.5, cx, y + 5, cx - 5, y + 0.5]).fill({ color: ZONE_COLORS.gilt, alpha: 0.85 })
  for (const s of [-1, 1]) {
    g.moveTo(cx + s * 7, y + 0.5).bezierCurveTo(cx + s * 12, y - 6, cx + s * 20, y - 5, cx + s * 22, y - 1).bezierCurveTo(cx + s * 23, y + 2, cx + s * 19, y + 3, cx + s * 18, y)
  }
  g.stroke({ color: ZONE_COLORS.gilt, width: 0.9, alpha: 0.7 })
  return g
}

// Slowly drifting, twinkling stars at parallax depths.
export class Starfield {
  readonly container = new Container()
  private stars: Star[] = []
  private count = MAX_STARS

  constructor(seed: number) {
    const t = textures()
    const rand = seeded(seed)
    for (let i = 0; i < MAX_STARS; i++) {
      const depth = rand() // 0 far .. 1 near
      const bright = depth > 0.75
      const s = new Sprite(bright ? t.star : t.starDot)
      s.anchor.set(0.5)
      s.position.set(rand() * VIRTUAL_W, rand() * VIRTUAL_H)
      s.scale.set(bright ? 0.35 + depth * 0.3 : 0.35 + depth * 0.35)
      s.tint = STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)]
      s.rotation = bright ? rand() * 0.6 - 0.3 : 0
      this.stars.push({ s, speed: 1.2 + depth * 3.6, base: 0.35 + depth * 0.55, phase: rand() * TAU, freq: 0.6 + rand() * 1.8 })
      this.container.addChild(s)
    }
  }

  // Quality governor hook: fewer live stars on slower devices.
  setCount(n: number): void {
    this.count = Math.max(0, Math.min(MAX_STARS, n))
    this.stars.forEach((st, i) => (st.s.visible = i < this.count))
  }

  update(dt: number, time: number): void {
    for (let i = 0; i < this.count; i++) {
      const st = this.stars[i]
      const s = st.s
      s.x += DRIFT.x * st.speed * dt
      s.y += DRIFT.y * st.speed * dt
      if (s.y > VIRTUAL_H + 6) s.y -= VIRTUAL_H + 12
      if (s.x < -6) s.x += VIRTUAL_W + 12
      s.alpha = st.base * (0.6 + 0.4 * Math.sin(time * st.freq + st.phase))
    }
  }
}

function constellations(): Graphics {
  const g = new Graphics()
  for (const c of CONSTELLATIONS) {
    for (const [a, b] of c.edges) g.moveTo(...c.pts[a]).lineTo(...c.pts[b])
  }
  g.stroke({ color: ZONE_COLORS.etch, width: 0.6, alpha: 0.2 })
  for (const c of CONSTELLATIONS) for (const [x, y] of c.pts) g.circle(x, y, 1.3).fill({ color: 0xffffff, alpha: 0.55 })
  return g
}

function nebulaSprite(): Sprite {
  const s = new Sprite(textures().nebula)
  s.setSize(VIRTUAL_W, VIRTUAL_H)
  return s
}

// Backdrop for a level: nebula, drifting stars, faint arcane circles and
// constellations, the field and its etched ring, blocker slabs and the
// inventory shelf. update() drifts the stars and turns the circles.
export class ZoneBackground {
  readonly container = new Container()
  private stars = new Starfield(1234)
  private skyCircle: Graphics
  private fieldCircle: Graphics

  constructor(field: Rect, blockers: Rect[]) {
    this.container.eventMode = 'none'
    this.container.addChild(nebulaSprite(), this.stars.container, constellations())

    this.skyCircle = arcaneCircle(128, 7)
    this.skyCircle.position.set(VIRTUAL_W / 2, 150)
    this.skyCircle.alpha = 0.14
    const fieldR = Math.min(field.w, field.h) * 0.46
    this.fieldCircle = arcaneCircle(fieldR, 11)
    this.fieldCircle.position.set(field.x + field.w / 2, field.y + field.h / 2)
    this.fieldCircle.alpha = 0.1

    // Veils: the middle zone outside the field sinks into shadow, the field
    // itself is a darker pane.
    const veil = new Graphics()
    veil.rect(0, HORIZON, VIRTUAL_W, INVENTORY_ZONE.y - HORIZON).fill(sharedGradients().fade)
    veil.roundRect(field.x, field.y, field.w, field.h, 14).cut()
    veil.roundRect(field.x, field.y, field.w, field.h, 14).fill({ color: ZONE_COLORS.fieldVeil, alpha: 0.4 })

    this.container.addChild(this.skyCircle, veil, this.fieldCircle, fieldRing(field), blockerSlabs(blockers), shelf())
  }

  setStarCount(n: number): void {
    this.stars.setCount(n)
  }

  update(dt: number, time: number): void {
    this.stars.update(dt, time)
    this.skyCircle.rotation = time * 0.012
    this.fieldCircle.rotation = -time * 0.008
  }
}

// The sky behind the menus: the same nebula, stars and constellations, with
// a large arcane circle turning slowly behind the title. Fitted to cover
// the whole window, and faded in once the textures are ready.
export class MenuBackdrop {
  readonly container = new Container()
  private stars = new Starfield(4321)
  private outer = arcaneCircle(176, 3)
  private inner = arcaneCircle(104, 5)

  constructor() {
    this.container.eventMode = 'none'
    this.container.alpha = 0
    for (const [c, a] of [[this.outer, 0.17], [this.inner, 0.12]] as const) {
      c.position.set(VIRTUAL_W / 2, 330)
      c.alpha = a
    }
    this.container.addChild(nebulaSprite(), this.stars.container, constellations(), this.outer, this.inner)
  }

  update(dt: number, time: number): void {
    this.stars.update(dt, time)
    this.outer.rotation = time * 0.01
    this.inner.rotation = -time * 0.016
    this.container.alpha = Math.min(1, this.container.alpha + dt * 1.6)
  }

  fit(screenW: number, screenH: number): void {
    const s = Math.max(screenW / VIRTUAL_W, screenH / VIRTUAL_H)
    this.container.scale.set(s)
    this.container.position.set((screenW - VIRTUAL_W * s) / 2, (screenH - VIRTUAL_H * s) / 2)
  }
}

// Static variant for the level editor.
export function drawZoneBackground(field: Rect, blockers: Rect[]): Container {
  const bg = new ZoneBackground(field, blockers)
  bg.update(0, 0)
  return bg.container
}
