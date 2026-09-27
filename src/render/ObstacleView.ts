import { Container, Graphics } from 'pixi.js'
import type { Obstacle } from '../sim/types'
import { OBSTACLE_COLOR } from './Theme'
import { drawPolygon } from './drawPolygon'

const NEXT_PAD = 3 // gap between the current polygon and the next-shape outline
const REVEAL_TIME = 0.45 // next outline shrinking into place after a collapse
const IMPLODE_TIME = 0.35

// Radius at which an n-gon circumscribes a circle of radius r (its inradius
// equals r), so the whole current polygon fits inside the outline.
const circumscribing = (r: number, sides: number) => (r + NEXT_PAD) / Math.cos(Math.PI / sides)

interface Dying {
  x: number
  y: number
  s: number
  t: number
}

// An obstacle: its current layer as a filled polygon whose strength is shown
// as orbiting black holes (one per HP), and its next layer (if any) as a
// faint outline circumscribed around it. When the current layer collapses,
// that outline shrinks into place and becomes the obstacle.
export class ObstacleView {
  readonly container = new Container()
  private shape = new Graphics()
  private holes = new Graphics()
  private drawnIndex = -1
  private reveal = 1 // 0..1 progress of the outline shrinking into place
  private revealFrom = 0 // outline radius the new layer starts at
  private flash = 0
  private shownHp = -1
  private dying: Dying[] = []

  constructor(obstacle: Obstacle) {
    this.container.addChild(this.shape, this.holes)
    this.container.position.set(obstacle.pos.x, obstacle.pos.y)
  }

  hit(): void {
    this.flash = 1
  }

  sync(obstacle: Obstacle, dt: number, time: number): void {
    const layer = obstacle.layers[obstacle.index]
    if (obstacle.cleared || !layer) {
      this.container.visible = false
      return
    }
    this.container.visible = true

    if (this.drawnIndex !== obstacle.index) {
      const prev = obstacle.layers[obstacle.index - 1]
      if (this.drawnIndex !== -1 && prev) {
        this.reveal = 0
        this.revealFrom = circumscribing(prev.radius, layer.sides)
      }
      this.drawnIndex = obstacle.index
      this.shownHp = obstacle.hp
      this.dying = []
    }
    this.reveal = Math.min(1, this.reveal + dt / REVEAL_TIME)
    this.flash = Math.max(0, this.flash - dt * 4)
    const e = 1 - Math.pow(1 - this.reveal, 3)
    const radius = this.revealFrom + (layer.radius - this.revealFrom) * e
    const settled = this.reveal >= 1

    const g = this.shape
    g.clear()
    const breathe = Math.sin(time * 1.3 + obstacle.pos.x) * 0.04

    // Next layer: the outline this obstacle will become.
    const next = obstacle.layers[obstacle.index + 1]
    if (next) {
      const appear = settled ? 1 : Math.max(0, (this.reveal - 0.6) / 0.4)
      const r = circumscribing(layer.radius, next.sides)
      const rot = time * 0.15
      drawPolygonRotated(g, next.sides, r, rot, { fillColor: 0x9b7bff, fillAlpha: 0.05 * appear, strokeColor: 0xd8c8ff, strokeWidth: 1.5, strokeAlpha: (0.45 + breathe) * appear })
      if (next.boss) drawPolygonRotated(g, next.sides, r + 4, rot, { strokeColor: 0xffc857, strokeWidth: 1, strokeAlpha: 0.4 * appear })
    }

    drawPolygon(g, layer.sides, radius, {
      fillColor: this.flash > 0 ? 0xffffff : OBSTACLE_COLOR,
      fillAlpha: this.flash > 0 ? 0.3 + this.flash * 0.5 : 0.25 + 0.65 * e,
      strokeColor: 0xffffff,
      strokeWidth: 2,
    })
    if (layer.boss) {
      // Endless boss: a gilded double rim and three crown pips.
      const glow = 0.5 + 0.5 * Math.sin(time * 3)
      drawPolygon(g, layer.sides, radius + 4, { strokeColor: 0xffc857, strokeWidth: 2.5, strokeAlpha: (0.7 + glow * 0.3) * e })
      for (let k = -1; k <= 1; k++) g.circle(k * 9, -radius - 12, 2.5).fill({ color: 0xffc857, alpha: e })
    }
    g.rotation = Math.sin(time * 0.4 + obstacle.pos.y) * 0.05

    this.drawHoles(obstacle.hp, layer.radius * Math.cos(Math.PI / layer.sides), time, dt, e)
  }

  // One black hole per HP, packed on concentric rings (1, 6, 12, ...) and
  // slowly orbiting. Lost HP implodes where it sat.
  private drawHoles(hp: number, inradius: number, time: number, dt: number, appear: number): void {
    const layout = holeLayout(Math.max(hp, this.shownHp), inradius)
    if (hp < this.shownHp) {
      for (let i = hp; i < this.shownHp; i++) {
        const p = placeHole(layout, i, time)
        this.dying.push({ ...p, s: layout.size, t: 0 })
      }
    }
    this.shownHp = hp
    const g = this.holes
    g.clear()
    const live = holeLayout(hp, inradius)
    for (let i = 0; i < hp; i++) {
      const p = placeHole(live, i, time)
      drawHole(g, p.x, p.y, live.size * appear, time + i)
    }
    this.dying = this.dying.filter((d) => {
      d.t += dt / IMPLODE_TIME
      if (d.t >= 1) return false
      const k = 1 - d.t
      drawHole(g, d.x, d.y, d.s * k, time)
      g.circle(d.x, d.y, d.s * (1 + d.t * 3)).stroke({ color: 0xd8c8ff, width: 1.2, alpha: k })
      return true
    })
  }
}

interface HoleLayout {
  size: number
  spacing: number
}

function holeLayout(n: number, inradius: number): HoleLayout {
  let rings = 0
  while (1 + 3 * rings * (rings + 1) < n) rings++
  const usable = inradius * 0.95
  const size = Math.max(1.8, Math.min(5, usable / (rings * 2.6 + 1.1)))
  return { size, spacing: size * 2.6 }
}

// Slot i: 0 = center, then ring k holds 6k slots.
function placeHole(l: HoleLayout, i: number, time: number): { x: number; y: number } {
  if (i === 0) return { x: 0, y: 0 }
  let k = 1
  let start = 1
  while (i >= start + 6 * k) {
    start += 6 * k
    k++
  }
  const slot = i - start
  const a = (slot / (6 * k)) * Math.PI * 2 + time * (0.35 / k) * (k % 2 ? 1 : -1)
  return { x: Math.cos(a) * k * l.spacing, y: Math.sin(a) * k * l.spacing }
}

function drawHole(g: Graphics, x: number, y: number, s: number, t: number): void {
  if (s <= 0.2) return
  g.circle(x, y, s * 2.3).fill({ color: 0xb89cff, alpha: 0.1 })
  g.circle(x, y, s * 1.35).stroke({ color: 0xffd9a0, width: Math.max(0.6, s * 0.35), alpha: 0.75 + Math.sin(t * 3) * 0.2 })
  g.circle(x, y, s).fill({ color: 0x000000 })
}

function drawPolygonRotated(
  g: Graphics,
  sides: number,
  radius: number,
  rotation: number,
  style: { fillColor?: number; fillAlpha?: number; strokeColor?: number; strokeWidth?: number; strokeAlpha?: number },
): void {
  const pts: number[] = []
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + rotation + (i * 2 * Math.PI) / sides
    pts.push(Math.cos(a) * radius, Math.sin(a) * radius)
  }
  g.poly(pts)
  if (style.fillColor !== undefined) g.fill({ color: style.fillColor, alpha: style.fillAlpha ?? 1 })
  if (style.strokeColor !== undefined) g.stroke({ color: style.strokeColor, width: style.strokeWidth ?? 1, alpha: style.strokeAlpha ?? 1 })
}
