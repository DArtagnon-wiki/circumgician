import { Container, Graphics, Sprite } from 'pixi.js'
import type { ObstacleMotion } from '../model/Look'
import type { Obstacle, ObstacleLayerSpec, Vec2 } from '../sim/types'
import { localVertices } from './drawPolygon'
import { FROST, RIME } from './Frost'
import { makeMaterial, type Material } from './obstacleStyles'
import { textures } from './textures'

const NEXT_PAD = 3 // gap between the current polygon and the next-shape outline
const REVEAL_TIME = 0.45 // next outline shrinking into place after a collapse
const IMPLODE_TIME = 0.35
const GILT = 0xe6c170
const MOON_SPEED = 0.45 // rad/s round the obstacle

// Radius at which an n-gon circumscribes a circle of radius r (its inradius
// equals r), so the whole current polygon fits inside the outline.
const circumscribing = (r: number, sides: number) => (r + NEXT_PAD) / Math.cos(Math.PI / sides)

interface Hole {
  swirl: Sprite
  lens: Sprite
  core: Sprite
}

interface Dying {
  x: number
  y: number
  s: number
  t: number
  hole: Hole
}

// An obstacle is a shape cut from some material (obstacleStyles.ts: faceted
// obsidian unless the level picks another). Its strength is black holes
// swirling inside (one per HP), and its next layer (if any) a ghostly
// outline circumscribed around it, dotted with that layer's strength. When
// the current layer collapses, the outline shrinks into place. It idles in
// its own way (sways, floats, turns...), and may have moons. Bosses carry
// gilded fractures, frost layers veins of ice; ice itself (a level's blocks,
// frozen pieces) is obsidian rimed and glazed in frost.
export class ObstacleView {
  readonly container = new Container()
  private nextC = new Container()
  private nextG = new Graphics()
  private glintC = new Container()
  private nextGlints: Sprite[] = []
  private body = new Container()
  private material: Material
  private motion: ObstacleMotion
  private phase: number // desynchronises neighbours' idling
  private home: Vec2
  private overG = new Graphics() // boss fractures, over any material
  private frostG = new Graphics()
  private frozen: boolean
  private flashG = new Graphics()
  private moonBack = new Container()
  private moonFront = new Container()
  private moons: Graphics[] = []
  // Holes by blend: glowing swirls and lensing rings, then the black cores.
  private holeGlowC = new Container()
  private holeCoreC = new Container()
  private holes: Hole[] = []
  private spare: Hole[] = []
  private table: Vec2[] = []
  private drawnIndex = -1
  private reveal = 1 // 0..1 progress of the outline shrinking into place
  private revealFrom = 0 // outline radius the new layer starts at
  private revealTurn = 0 // outline's angle offset at the collapse, eased out
  private flash = 0
  private shownHp = -1
  private dying: Dying[] = []
  // Display snapshots queued by detonations in flight: until each one's
  // orb lands, the obstacle keeps showing the state from before its hit.
  private holds: { left: number; index: number; hp: number }[] = []

  constructor(obstacle: Obstacle) {
    const seed = Math.round(obstacle.pos.x * 13 + obstacle.pos.y * 7)
    this.phase = (seed % 97) * 0.37
    this.frozen = !!obstacle.frozen
    // Ice is always obsidian under its glaze.
    this.material = makeMaterial(this.frozen ? 'obsidian' : (obstacle.look?.style ?? 'obsidian'), seed)
    this.motion = this.frozen ? 'sway' : (obstacle.look?.motion ?? this.material.motion)
    this.home = { ...obstacle.pos }
    this.nextC.addChild(this.nextG, this.glintC)
    this.frostG.blendMode = 'add'
    this.flashG.blendMode = 'add'
    this.holeGlowC.blendMode = 'add'
    this.body.addChild(this.material.art, this.overG, this.frostG, this.holeGlowC, this.holeCoreC, this.flashG)
    this.container.addChild(this.moonBack, this.nextC, this.body, this.moonFront)
    this.container.position.set(obstacle.pos.x, obstacle.pos.y)
    const moons = this.frozen ? 0 : (obstacle.look?.moons ?? 0)
    for (let i = 0; i < moons; i++) this.moons.push(new Graphics())
  }

  hit(): void {
    this.flash = 1
  }

  hold(seconds: number, index: number, hp: number): void {
    this.holds.push({ left: seconds, index, hp })
  }

  // Keep showing what is on screen now for `seconds` (ice waiting to thaw).
  holdAsIs(seconds: number): void {
    if (this.drawnIndex >= 0) this.holds.push({ left: seconds, index: this.drawnIndex, hp: this.shownHp })
  }

  sync(obstacle: Obstacle, dt: number, time: number): void {
    for (const h of this.holds) h.left -= dt
    while (this.holds.length && this.holds[0].left <= 0) this.holds.shift()
    const shown = this.holds[0]
    const index = shown ? shown.index : obstacle.index
    const hp = shown ? shown.hp : obstacle.hp
    const layer = obstacle.layers[index]
    if ((!shown && obstacle.cleared) || !layer) {
      this.container.visible = false
      return
    }
    this.container.visible = true
    const next = obstacle.layers[index + 1]
    const idle = this.idle(time)
    this.container.position.set(this.home.x + idle.x, this.home.y + idle.y)

    if (this.drawnIndex !== index) {
      const prev = obstacle.layers[index - 1]
      if (this.drawnIndex !== -1 && prev) {
        this.reveal = 0
        this.revealFrom = circumscribing(prev.radius, layer.sides)
        // Start from the outline's current angle (mod the shape's symmetry)
        // so it seamlessly becomes the body.
        const step = (Math.PI * 2) / layer.sides
        const d = this.nextC.rotation - idle.turn
        this.revealTurn = d - Math.round(d / step) * step
      }
      this.drawnIndex = index
      this.shownHp = hp
      for (const d of this.dying) this.release(d.hole)
      this.dying = []
      this.drawLayer(layer, next)
    }
    this.reveal = Math.min(1, this.reveal + dt / REVEAL_TIME)
    this.flash = Math.max(0, this.flash - dt * 4)
    const e = 1 - Math.pow(1 - this.reveal, 3)
    const radius = this.revealFrom + (layer.radius - this.revealFrom) * e
    const settled = this.reveal >= 1

    this.body.scale.set((settled ? 1 : radius / layer.radius) * idle.scale)
    this.body.rotation = idle.turn + this.revealTurn * (1 - e)
    this.body.alpha = 0.3 + 0.7 * e
    this.flashG.alpha = this.flash * 0.55

    if (next) {
      this.nextC.visible = true
      this.nextC.alpha = settled ? 1 : Math.max(0, (this.reveal - 0.6) / 0.4)
      this.nextC.rotation = time * 0.15
      this.nextGlints.forEach((g, i) => {
        g.alpha = 0.35 + 0.65 * Math.max(0, Math.sin(time * 1.7 + i * 2.1))
        g.rotation = -this.nextC.rotation
      })
    } else {
      this.nextC.visible = false
    }

    this.material.update(time)
    this.syncMoons(layer, next, time)
    this.syncHoles(hp, layer.radius * Math.cos(Math.PI / layer.sides), time, dt, e)
  }

  // Where idling puts the obstacle this frame: an offset, a turn and a
  // scale. Small enough that threads and strikes still meet it.
  private idle(time: number): { x: number; y: number; turn: number; scale: number } {
    const t = time + this.phase
    switch (this.motion) {
      case 'bob':
        return { x: 0, y: Math.sin(t * 0.9) * 3, turn: Math.sin(t * 0.45) * 0.03, scale: 1 }
      case 'spin':
        return { x: 0, y: 0, turn: t * (this.phase % 2 < 1 ? 0.2 : -0.2), scale: 1 }
      case 'pulse':
        return { x: 0, y: 0, turn: Math.sin(t * 0.4) * 0.03, scale: 1 + Math.sin(t * 1.6) * 0.025 }
      case 'drift':
        return { x: Math.cos(t * 0.35) * 4, y: Math.sin(t * 0.5) * 3, turn: Math.sin(t * 0.3) * 0.06, scale: 1 }
      case 'still':
        return { x: 0, y: 0, turn: 0, scale: 1 }
      default:
        return { x: 0, y: 0, turn: Math.sin(time * 0.4 + this.home.y) * 0.05, scale: 1 }
    }
  }

  // Moons circle on a tilted orbit clear of the next layer's outline,
  // passing behind the body on the far side.
  private syncMoons(layer: ObstacleLayerSpec, next: ObstacleLayerSpec | undefined, time: number): void {
    if (!this.moons.length) return
    const orbit = circumscribing(layer.radius, next?.sides ?? layer.sides) + 9
    const n = this.moons.length
    this.moons.forEach((m, i) => {
      const a = time * MOON_SPEED + (i / n) * Math.PI * 2 + this.phase
      const depth = Math.sin(a) // > 0: in front
      m.position.set(Math.cos(a) * orbit, Math.sin(a) * orbit * 0.32)
      m.scale.set(0.8 + 0.25 * depth)
      m.rotation = time * 0.8 + i
      m.alpha = 0.75 + 0.25 * depth
      const side = depth > 0 ? this.moonFront : this.moonBack
      if (m.parent !== side) side.addChild(m)
    })
  }

  private drawLayer(layer: ObstacleLayerSpec, next: ObstacleLayerSpec | undefined): void {
    const R = layer.radius
    const outline = localVertices(layer.sides, R)
    this.table = this.material.build(outline, R)
    this.overG.clear()
    if (layer.boss) drawGildedFractures(this.overG, outline, this.table, R)
    this.drawMoons(R)
    this.frostG.clear()
    if (layer.frost) drawFrostVeins(this.frostG, outline, this.table, R)
    if (this.frozen) {
      // Ice: glazed, rimed, with frost creeping in from each corner and
      // crystal facets meeting at the heart.
      const pts = outline.flatMap((p) => [p.x, p.y])
      this.frostG.poly(pts).fill({ color: FROST, alpha: 0.2 })
      this.frostG.poly(this.table.flatMap((p) => [p.x, p.y])).fill({ color: RIME, alpha: 0.08 })
      this.frostG.poly(pts).stroke({ color: FROST, width: 2.5, alpha: 0.85 })
      this.frostG.poly(pts).stroke({ color: RIME, width: 0.8, alpha: 0.7 })
      for (const p of outline) this.frostG.moveTo(p.x * 0.9, p.y * 0.9).lineTo(p.x * 0.5, p.y * 0.5).stroke({ color: RIME, width: 1.2, alpha: 0.5 })
      outline.forEach((p, i) => {
        const q = outline[(i + 1) % outline.length]
        const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
        this.frostG.moveTo(m.x * 0.82, m.y * 0.82).lineTo(m.x * 0.62 + (i % 2 ? 2 : -2), m.y * 0.62).stroke({ color: RIME, width: 0.8, alpha: 0.35 })
      })
    }

    this.flashG.clear()
    this.flashG.poly(outline.flatMap((p) => [p.x, p.y])).fill({ color: 0xe9ddff })

    this.nextG.clear()
    this.glintC.removeChildren().forEach((c) => c.destroy())
    this.nextGlints = []
    if (next) {
      const r = circumscribing(R, next.sides)
      const pts = localVertices(next.sides, r).flatMap((p) => [p.x, p.y])
      // A ghost of the material: a smoky edge with a thin bright line.
      const m = this.material
      this.nextG.poly(pts).fill({ color: m.ghost, alpha: 0.22 })
      this.nextG.poly(pts).stroke({ color: m.ghost, width: 4, alpha: 0.55 })
      const trim = next.boss ? GILT : next.frost ? FROST : m.trim
      this.nextG.poly(pts).stroke({ color: trim, width: next.frost ? 1.3 : 1, alpha: next.frost ? 0.8 : 0.6 })
      // Its strength: one dark pip per HP, spaced evenly along the rim and
      // offset half a step so they sit between the vertex glints.
      const verts = localVertices(next.sides, r)
      const edge = Math.hypot(verts[1].x - verts[0].x, verts[1].y - verts[0].y)
      const pip = Math.min(2.6, ((edge * next.sides) / next.hp) * 0.28)
      for (let k = 0; k < next.hp; k++) {
        const u = ((k + 0.5) / next.hp) * next.sides
        const i = Math.floor(u)
        const a = verts[i]
        const b = verts[(i + 1) % next.sides]
        const x = a.x + (b.x - a.x) * (u - i)
        const y = a.y + (b.y - a.y) * (u - i)
        this.nextG.circle(x, y, pip + 0.9).fill({ color: next.boss ? GILT : next.frost ? FROST : m.trim, alpha: 0.6 })
        this.nextG.circle(x, y, pip).fill({ color: 0x030108 })
      }
      const star = textures().star
      for (const p of verts) {
        const s = new Sprite(star)
        s.anchor.set(0.5)
        s.position.set(p.x, p.y)
        s.scale.set(0.42)
        s.tint = next.boss ? 0xffe2a6 : next.frost ? RIME : m.trim
        s.blendMode = 'add'
        this.glintC.addChild(s)
        this.nextGlints.push(s)
      }
    }
  }

  // Small shards of the material, each a little polygon of its own.
  private drawMoons(R: number): void {
    const size = Math.max(3, R * 0.14)
    this.moons.forEach((m, i) => {
      m.clear()
      const pts = localVertices(3 + (i % 3), size).flatMap((p) => [p.x, p.y])
      m.poly(pts).fill({ color: this.material.moon })
      m.poly(pts).stroke({ color: this.material.trim, width: 0.9, alpha: 0.8 })
    })
  }

  // One black hole per HP, packed on concentric rings (1, 6, 12, ...) and
  // slowly orbiting. Lost HP implodes where it sat.
  private syncHoles(hp: number, inradius: number, time: number, dt: number, appear: number): void {
    const layout = holeLayout(Math.max(hp, this.shownHp), inradius)
    while (this.holes.length > hp) {
      const i = this.holes.length - 1
      const p = placeHole(layout, i, time)
      this.dying.push({ ...p, s: layout.size, t: 0, hole: this.holes.pop()! })
    }
    this.shownHp = hp
    while (this.holes.length < hp) this.holes.push(this.acquire())
    const live = holeLayout(hp, inradius)
    this.holes.forEach((h, i) => {
      const p = placeHole(live, i, time)
      drawHole(h, p.x, p.y, live.size * appear, time + i, 1)
    })
    this.dying = this.dying.filter((d) => {
      d.t += dt / IMPLODE_TIME
      if (d.t >= 1) {
        this.release(d.hole)
        return false
      }
      // Collapse inward while the lensing ring flares outward.
      drawHole(d.hole, d.x, d.y, d.s * (1 - d.t), time, 1 - d.t)
      d.hole.lens.scale.set((d.s * (1.5 + d.t * 3) * 2) / 64 / 0.8)
      d.hole.lens.alpha = 0.8 * (1 - d.t)
      return true
    })
  }

  private acquire(): Hole {
    const h = this.spare.pop()
    if (h) {
      for (const s of [h.swirl, h.lens, h.core]) s.visible = true
      return h
    }
    const t = textures()
    const make = (tex: typeof t.disc, layer: Container) => {
      const s = new Sprite(tex)
      s.anchor.set(0.5)
      layer.addChild(s)
      return s
    }
    const swirl = make(t.swirl, this.holeGlowC)
    swirl.tint = this.material.swirl
    const lens = make(t.ring, this.holeGlowC)
    lens.tint = this.material.lens
    const core = make(t.disc, this.holeCoreC)
    core.tint = 0x000000
    return { swirl, lens, core }
  }

  private release(h: Hole): void {
    for (const s of [h.swirl, h.lens, h.core]) s.visible = false
    this.spare.push(h)
  }
}

// Gold veins across the facets, from the table's corners out to the rim.
function drawGildedFractures(g: Graphics, outline: Vec2[], table: Vec2[], R: number): void {
  const n = outline.length
  for (let i = 0; i < n; i += 1) {
    const a = table[i]
    const b = outline[i]
    const c = outline[(i + 1) % n]
    const m = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }
    const kink = { x: a.x + (m.x - a.x) * 0.45 + (i % 2 ? 2 : -2), y: a.y + (m.y - a.y) * 0.45 + (i % 2 ? -1.5 : 1.5) }
    g.moveTo(a.x, a.y).lineTo(kink.x, kink.y).lineTo(m.x * 0.97, m.y * 0.97)
    if (i % 2 === 0) g.moveTo(kink.x, kink.y).lineTo(b.x * 0.9, b.y * 0.9)
  }
  g.stroke({ color: GILT, width: Math.max(0.9, R / 34), alpha: 0.85, cap: 'round', join: 'round' })
  g.poly(outline.flatMap((p) => [p.x, p.y])).stroke({ color: GILT, width: 1, alpha: 0.45 })
}

// Veins of ice through the facets: from each table corner a crack runs to
// its vertex and forks, and rime crusts the rim. (Drawn additively.)
function drawFrostVeins(g: Graphics, outline: Vec2[], table: Vec2[], R: number): void {
  const n = outline.length
  g.poly(outline.flatMap((p) => [p.x, p.y])).fill({ color: FROST, alpha: 0.1 })
  for (let i = 0; i < n; i++) {
    const a = table[i]
    const b = outline[i]
    const k1 = { x: a.x + (b.x - a.x) * 0.4 + (i % 2 ? 1.8 : -1.8), y: a.y + (b.y - a.y) * 0.4 + (i % 2 ? -1.2 : 1.2) }
    const k2 = { x: a.x + (b.x - a.x) * 0.72 - (i % 2 ? 1.4 : -1.4), y: a.y + (b.y - a.y) * 0.72 }
    g.moveTo(a.x, a.y).lineTo(k1.x, k1.y).lineTo(k2.x, k2.y).lineTo(b.x * 0.94, b.y * 0.94)
    // A fork toward the next edge's midpoint.
    const c = outline[(i + 1) % n]
    const m = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }
    g.moveTo(k1.x, k1.y).lineTo(k1.x + (m.x - k1.x) * 0.55, k1.y + (m.y - k1.y) * 0.55)
  }
  g.stroke({ color: FROST, width: Math.max(1.2, R / 24), alpha: 0.85, cap: 'round', join: 'round' })
  g.poly(outline.flatMap((p) => [p.x, p.y])).stroke({ color: FROST, width: 2.2, alpha: 0.5 })
  g.poly(outline.flatMap((p) => [p.x, p.y])).stroke({ color: RIME, width: 0.8, alpha: 0.6 })
  for (const p of outline) g.circle(p.x * 0.93, p.y * 0.93, Math.max(1.2, R / 22)).fill({ color: RIME, alpha: 0.55 })
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

// Accretion swirl, a lensing ring of bent light, and the black core.
function drawHole(h: Hole, x: number, y: number, s: number, t: number, alpha: number): void {
  const on = s > 0.2
  for (const sp of [h.swirl, h.lens, h.core]) {
    sp.visible = on
    sp.position.set(x, y)
  }
  if (!on) return
  h.swirl.scale.set((s * 2.9 * 2) / 64)
  h.swirl.rotation = -t * 2.4
  h.swirl.alpha = 0.55 * alpha
  h.lens.scale.set((s * 1.42 * 2) / 64 / 0.8)
  h.lens.alpha = (0.5 + Math.sin(t * 3) * 0.15) * alpha
  h.core.scale.set((s * 2) / 32)
  h.core.alpha = alpha
}
