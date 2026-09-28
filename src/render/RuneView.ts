import { Circle, Container, Graphics, Sprite } from 'pixi.js'
import type { Insight, Mote, Piece, ReleaseColor, Rune, RuneLayerSpec, Vec2 } from '../sim/types'
import { centerLayer, isFinal, middleLayer, outerLayer, polygonPoints } from '../sim/geometry'
import { ASH_COLOR, ASH_DARK, RUNE_BODY_COLOR, colorForMote, colorForRelease, lighten, opal } from './Theme'
import { drawPolygon, localVertices } from './drawPolygon'
import { sheenBand } from './obsidian'
import { textures } from './textures'
import type { Liquid } from './Detonation'
import { quality } from './Quality'

// Middle and center are drawn nested inside the outer at fixed fractions of
// its radius (their authored radii only matter once they become the outer).
export const MIDDLE_SCALE = 0.6
const CENTER_SCALE = 0.3
export const BOWL_R = 8.5
const TUBE_W = 7
const LIQUID_W = 3.4
const FILL_TIME = 0.25
const FLOWS = 2 // traveling glints per half-tube
const CAPSULE_W = 64 // capsule texture size
const CAPSULE_H = 16
const GLASS_LINE = 0xece6ff

interface Half {
  node: number
  release: ReleaseColor
  base: Sprite
  flows: Sprite[]
  x: number // start, at the bowl's rim
  y: number
  dx: number // unit direction toward the edge midpoint
  dy: number
  len: number
}

interface Swirl {
  a: Sprite // one per meeting color
  b: Sprite
  na: number // node feeding each side
  nb: number
}

// What a view draws: a rune in hand (its layer in hand, what that strikes,
// and the entry after) or a piece on the field (its glass and its energy).
// A stack's final entry is never cast, so wherever it shows it is drawn as
// energy lines only.
export interface RuneLook {
  key: string // redraw when this changes
  outer: RuneLayerSpec
  middle?: RuneLayerSpec
  middleIsEnergy: boolean
  center?: RuneLayerSpec
  centerIsEnergy: boolean
  insight: Insight
  state: 'idle' | 'charging' | 'full'
  held: (string | null)[]
}

const NONE_HELD: (string | null)[] = []

export function handLook(rune: Rune): RuneLook | null {
  const outer = outerLayer(rune)
  if (!outer) return null
  return {
    key: `hand:${rune.index}:${rune.insight}`,
    outer,
    middle: middleLayer(rune),
    middleIsEnergy: isFinal(rune, rune.index + 1),
    center: centerLayer(rune),
    centerIsEnergy: isFinal(rune, rune.index + 2),
    insight: rune.insight,
    state: 'idle',
    held: NONE_HELD,
  }
}

export function pieceLook(piece: Piece): RuneLook {
  return { key: 'piece', outer: piece.layer, middle: piece.energy, middleIsEnergy: true, centerIsEnergy: false, insight: 'full', state: piece.state, held: piece.held }
}

interface Bowl {
  c: Container
  glass: Sprite
  glow: Sprite
  liquid: Sprite
  shine: Sprite
  fill: number
  held: boolean
  color: number
  generic: boolean
}

// A rune is glassware. The outer layer's edges are glass tubes: each half
// carries its node's release color as liquid flowing from the node toward
// the edge's midpoint, where the two colors swirl together. Annihilating
// halves are dull ash, still, and cracked. Nodes are glass bowls tinted
// with what they catch; a caught mote fills its bowl with glowing liquid.
// The middle layer is a frosted plate, the center faintly etched glass; a
// stack's final entry (never cast) and a piece's energy are lines of light.
export class RuneView {
  readonly container = new Container() // positioned in world space
  readonly body = new Container() // scaled (icon vs field size)
  private aura: Sprite
  private middleC = new Container()
  private middleG = new Graphics()
  private centerC = new Container()
  private centerG = new Graphics()
  private outerC = new Container()
  private glassG = new Graphics()
  private liquidC = new Container()
  private bowlGlowC = new Container() // additive, apart from the bowls: one batch
  private bowlC = new Container()
  private halves: Half[] = []
  private swirls: Swirl[] = []
  private bowls: Bowl[] = []
  private drawnKey = ''
  private hit = new Circle(0, 0, 0)
  readonly id: string

  constructor(id: string) {
    this.id = id
    this.aura = new Sprite(textures().glow)
    this.aura.anchor.set(0.5)
    this.aura.blendMode = 'add'
    this.aura.tint = 0xeadfff
    this.middleC.addChild(this.middleG)
    this.centerC.addChild(this.centerG)
    this.bowlGlowC.blendMode = 'add'
    this.outerC.addChild(this.glassG, this.liquidC, this.bowlGlowC, this.bowlC)
    this.body.addChild(this.aura, this.middleC, this.centerC, this.outerC)
    this.container.addChild(this.body)
    this.container.hitArea = this.hit
    this.container.eventMode = 'static'
    this.container.cursor = 'pointer'
  }

  // Called every frame. `outerRot`/`middleRot` are the sim's angles; runes
  // in hand pass the resting angle. `motes` resolves the nodes' motes.
  sync(look: RuneLook, outerRot: number, middleRot: number, time: number, dt: number, motes: Map<string, Mote>): void {
    const outer = look.outer
    if (look.key !== this.drawnKey) this.rebuild(look)

    const base = Math.PI / 2
    this.outerC.rotation = outerRot + base
    this.middleC.rotation = middleRot + base
    this.centerC.rotation = -(outerRot + base) * 0.5

    const full = look.state === 'full'
    const pulse = full ? 0.5 + 0.5 * Math.sin(time * 6) : 0
    // Inventory icons flow slowly; a full piece's liquid races and glows.
    const speed = (full ? 40 : 18) * (look.state === 'idle' ? 0.35 : 1)
    const releaseColor = (r: ReleaseColor, node: number) => (r === 'generic' ? opal(time, node * 0.7) : colorForRelease(r))

    for (const h of this.halves) {
      if (h.release === 'annihilating') continue // ash: still, set at build
      const color = releaseColor(h.release, h.node)
      h.base.tint = color
      h.base.alpha = 0.8 + pulse * 0.2
      const glint = lighten(color, 0.6)
      h.flows.forEach((f, k) => {
        const phase = (((time * speed) / Math.max(4, h.len) + k / FLOWS) % 1 + 1) % 1
        f.position.set(h.x + h.dx * h.len * phase, h.y + h.dy * h.len * phase)
        f.alpha = Math.sin(phase * Math.PI) * (0.5 + pulse * 0.5)
        f.tint = glint
      })
    }
    for (const s of this.swirls) {
      s.a.rotation = time * 2.6
      s.b.rotation = -time * 3.2 + 1
      const ra = outer.nodes[s.na].release
      const rb = outer.nodes[s.nb].release
      s.a.tint = ra === 'annihilating' ? ASH_COLOR : releaseColor(ra, s.na)
      s.b.tint = rb === 'annihilating' ? ASH_COLOR : releaseColor(rb, s.nb)
      s.a.alpha = ra === 'annihilating' ? 0 : 0.75 + pulse * 0.25
      s.b.alpha = rb === 'annihilating' ? 0 : 0.75 + pulse * 0.25
    }

    // Bowls keep their highlights toward the (fixed) light as the rune turns.
    const counter = -(outerRot + base)
    outer.nodes.forEach((_, i) => {
      const b = this.bowls[i]
      b.c.rotation = counter
      const id = look.held[i]
      const m = id ? motes.get(id) : undefined
      if (m) {
        b.generic = m.color === 'generic'
        b.color = colorForMote(m.color)
      }
      const held = m?.state === 'held'
      b.held = held
      const step = dt / FILL_TIME
      b.fill = Math.max(0, Math.min(1, b.fill + (held ? step : -step)))
      let level = 1 - (1 - b.fill) * (1 - b.fill)
      const incoming = m?.state === 'traveling'
      // A mote on its way makes the bowl shimmer in anticipation.
      if (incoming) level = Math.max(level, 0.3 + 0.08 * Math.sin(time * 32 + i * 2))
      const color = b.generic ? opal(time, i) : b.color
      b.liquid.visible = level > 0.01
      b.liquid.tint = color
      b.liquid.alpha = held ? 0.95 : 0.5
      b.liquid.scale.set((level * BOWL_R * 1.75) / 64)
      b.glow.tint = color
      b.glow.alpha = held && quality.settings.glows ? level * (full ? 0.55 + pulse * 0.35 : 0.3) : 0
    })

    this.aura.scale.set(((outer.radius + BOWL_R) * 2.9) / 128)
    this.aura.alpha = !quality.settings.glows ? 0 : full ? 0.22 + pulse * 0.2 : look.state === 'charging' ? 0.06 : 0
  }

  // What the bowls hold right now, in world space, for a detonation's
  // gather. Valid until the next sync redraws the (new) outer layer.
  liquids(pos: Vec2, outer: RuneLayerSpec, angle: number): Liquid[] {
    const pts = polygonPoints(pos, outer.sides, outer.radius, angle)
    const out: Liquid[] = []
    this.bowls.forEach((b, i) => {
      if (b.held && pts[i]) out.push({ x: pts[i].x, y: pts[i].y, color: b.color, generic: b.generic })
    })
    return out
  }

  // The tap area lives in unscaled container space while only `body` is
  // scaled, so the scene sizes it to what is actually drawn each frame.
  // (A fixed full-size circle let a big rune's invisible tap area cover its
  // neighbours' inventory icons.)
  setHitRadius(r: number): void {
    if (this.hit.radius !== r) this.hit.radius = r
  }

  private rebuild(look: RuneLook): void {
    this.drawnKey = look.key
    this.buildTubes(look.outer)
    this.buildBowls(look.outer)
    this.drawMiddle(look)
    this.drawCenter(look)
  }

  private buildTubes(outer: RuneLayerSpec): void {
    const t = textures()
    this.liquidC.removeChildren().forEach((c) => c.destroy({ children: true }))
    this.halves = []
    this.swirls = []
    const g = this.glassG
    g.clear()
    const pts = localVertices(outer.sides, outer.radius)
    const n = pts.length
    const bases = new Container()
    const flows = new Container()
    const swirls = new Container()
    flows.blendMode = 'add'
    swirls.blendMode = 'add'
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % n]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      for (const [node, from] of [[i, a], [(i + 1) % n, b]] as const) {
        const release = outer.nodes[node].release
        const half = this.makeHalf(node, release, from, mid)
        drawHalfGlass(g, half, release === 'annihilating', i * 7 + node)
        bases.addChild(half.base)
        for (const f of half.flows) flows.addChild(f)
        this.halves.push(half)
      }
      const make = () => {
        const s = new Sprite(t.swirl)
        s.anchor.set(0.5)
        s.position.set(mid.x, mid.y)
        s.scale.set(10 / 64)
        swirls.addChild(s)
        return s
      }
      this.swirls.push({ a: make(), b: make(), na: i, nb: (i + 1) % n })
    }
    this.liquidC.addChild(bases, flows, swirls)
  }

  private makeHalf(node: number, release: ReleaseColor, from: Vec2, to: Vec2): Half {
    const t = textures()
    const ddx = to.x - from.x
    const ddy = to.y - from.y
    const d = Math.hypot(ddx, ddy) || 1
    const dx = ddx / d
    const dy = ddy / d
    const start = BOWL_R * 0.85
    const len = Math.max(0, d - start)
    const x = from.x + dx * start
    const y = from.y + dy * start
    const ash = release === 'annihilating'
    // Ash leaked out at the crack: its liquid stops short, and is still.
    const liquidLen = ash ? len * 0.48 : len
    const base = new Sprite(t.capsule)
    base.anchor.set(0.5)
    base.position.set(x + dx * liquidLen * 0.5, y + dy * liquidLen * 0.5)
    base.rotation = Math.atan2(dy, dx)
    base.scale.set((liquidLen + LIQUID_W) / CAPSULE_W, LIQUID_W / (CAPSULE_H * 0.55))
    if (ash) {
      base.tint = ASH_COLOR
      base.alpha = 0.55
    }
    const flows: Sprite[] = []
    if (!ash) {
      for (let k = 0; k < FLOWS; k++) {
        const f = new Sprite(t.capsule)
        f.anchor.set(0.5)
        f.rotation = base.rotation
        f.scale.set(Math.min(7, len * 0.45) / CAPSULE_W, (LIQUID_W * 0.6) / (CAPSULE_H * 0.55))
        flows.push(f)
      }
    }
    return { node, release, base, flows, x, y, dx, dy, len }
  }

  private buildBowls(outer: RuneLayerSpec): void {
    const t = textures()
    this.bowlC.removeChildren().forEach((c) => c.destroy({ children: true }))
    this.bowlGlowC.removeChildren().forEach((c) => c.destroy())
    this.bowls = localVertices(outer.sides, outer.radius).map((p, i) => {
      const c = new Container()
      c.position.set(p.x, p.y)
      const sprite = (tex: typeof t.bowl, size: number) => {
        const s = new Sprite(tex)
        s.anchor.set(0.5)
        s.scale.set(size / tex.width)
        c.addChild(s)
        return s
      }
      const glow = new Sprite(t.glow)
      glow.anchor.set(0.5)
      glow.position.set(p.x, p.y)
      glow.scale.set((BOWL_R * 5) / t.glow.width)
      glow.alpha = 0
      this.bowlGlowC.addChild(glow)
      const liquid = sprite(t.meniscus, 0)
      liquid.visible = false
      const glass = sprite(t.bowl, BOWL_R * 2)
      glass.tint = colorForMote(outer.nodes[i].catch)
      const shine = sprite(t.highlight, BOWL_R * 2)
      shine.alpha = 0.85
      this.bowlC.addChild(c)
      return { c, glass, glow, liquid, shine, fill: 0, held: false, color: 0xffffff, generic: false }
    })
  }

  // Frosted glass plate: layered pale fills, a sheen streak, a crisp rim
  // and an inner edge catching the light. Energy (a shape that only
  // strikes) is lines of light instead.
  private drawMiddle(look: RuneLook): void {
    const g = this.middleG
    g.clear()
    const middle = look.middle
    if (!middle) return
    const r = look.outer.radius * MIDDLE_SCALE
    if (look.middleIsEnergy) {
      drawEnergy(g, middle.sides, r)
      return
    }
    drawPolygon(g, middle.sides, r, { fillColor: RUNE_BODY_COLOR, fillAlpha: 0.16 })
    drawPolygon(g, middle.sides, r * 0.84, { fillColor: 0xffffff, fillAlpha: 0.07 })
    const band = sheenBand(localVertices(middle.sides, r), -r * 0.28, r * 0.13)
    if (band.length > 2) g.poly(band.flatMap((p) => [p.x, p.y])).fill({ color: 0xffffff, alpha: 0.12 })
    drawPolygon(g, middle.sides, r * 0.9, { strokeColor: 0xffffff, strokeWidth: 0.8, strokeAlpha: 0.3 })
    drawPolygon(g, middle.sides, r, { strokeColor: GLASS_LINE, strokeWidth: 1.6, strokeAlpha: 0.85 })
  }

  // Faintly etched glass. Insight keeps its meaning: none = an enigma of
  // arcs, shape = the outline, full = the outline plus each node's catch
  // (ring) and release (dot) in miniature.
  private drawCenter(look: RuneLook): void {
    const g = this.centerG
    g.clear()
    const { middle, center, insight } = look
    const cr = look.outer.radius * CENTER_SCALE
    const etch = { color: 0xffffff, width: 1.1, alpha: 0.55 }
    if (!middle) {
      // Nothing beneath: the "spent core", an empty etched ring.
      g.circle(0, 0, cr * 0.55).stroke({ ...etch, alpha: 0.35 })
      g.circle(0, 0, cr * 0.3).fill({ color: ASH_DARK, alpha: 0.6 })
    } else if (!center) {
      g.circle(0, 0, cr * 0.4).stroke({ ...etch, alpha: 0.3 })
    } else if (look.centerIsEnergy && insight !== 'none') {
      drawEnergy(g, center.sides, cr)
    } else if (insight === 'none') {
      // moveTo first: a bare arc() starts with a line from the current point.
      g.moveTo(cr, 0).arc(0, 0, cr, 0, Math.PI * 1.2).stroke(etch)
      g.moveTo(-cr * 0.55, 0).arc(0, 0, cr * 0.55, Math.PI, Math.PI * 2.4).stroke({ ...etch, alpha: 0.4 })
    } else {
      drawPolygon(g, center.sides, cr, { fillColor: 0xffffff, fillAlpha: 0.07, strokeColor: 0xffffff, strokeWidth: 1.1, strokeAlpha: 0.6 })
      if (insight === 'full') {
        localVertices(center.sides, cr).forEach((p, i) => {
          const n = center.nodes[i]
          g.circle(p.x, p.y, 2.5).fill({ color: 0x0b0716, alpha: 0.7 })
          g.circle(p.x, p.y, 2.5).stroke({ color: colorForMote(n.catch), width: 1.2 })
          if (n.release === 'annihilating') {
            g.circle(p.x, p.y, 1.2).fill({ color: ASH_COLOR })
            g.moveTo(p.x - 1.6, p.y - 1.6).lineTo(p.x + 1.6, p.y + 1.6).stroke({ color: ASH_DARK, width: 0.6 })
          } else {
            g.circle(p.x, p.y, 1.2).fill({ color: n.release === 'generic' ? 0xffffff : colorForRelease(n.release) })
          }
        })
      }
    }
  }
}

// Lines of light: a soft glow under a bright thin outline.
function drawEnergy(g: Graphics, sides: number, r: number): void {
  drawPolygon(g, sides, r, { strokeColor: 0xb89cff, strokeWidth: 4.5, strokeAlpha: 0.22 })
  drawPolygon(g, sides, r, { strokeColor: 0xf3ecff, strokeWidth: 1.3, strokeAlpha: 0.9 })
}

// One half-tube's glass: a faint body, two walls and an outer highlight.
// Annihilating halves are sooty and cracked: a zigzag fracture across the
// tube and a missing sliver of wall.
function drawHalfGlass(g: Graphics, h: Half, cracked: boolean, seed: number): void {
  const nx = -h.dy
  const ny = h.dx
  const w = TUBE_W / 2
  const at = (t: number, o: number) => ({ x: h.x + h.dx * h.len * t + nx * o, y: h.y + h.dy * h.len * t + ny * o })
  const line = (a: Vec2, b: Vec2) => g.moveTo(a.x, a.y).lineTo(b.x, b.y)

  line(at(0, 0), at(1, 0)).stroke({ color: cracked ? ASH_DARK : RUNE_BODY_COLOR, width: TUBE_W, alpha: cracked ? 0.35 : 0.13 })
  const wall = { color: GLASS_LINE, width: 0.8, alpha: cracked ? 0.4 : 0.55 }
  if (!cracked) {
    line(at(0, -w), at(1, -w)).stroke(wall)
    line(at(0, w), at(1, w)).stroke(wall)
    line(at(0.1, w * 0.45), at(0.95, w * 0.45)).stroke({ color: 0xffffff, width: 0.6, alpha: 0.3 })
    return
  }
  const jit = ((seed * 9301 + 49297) % 233280) / 233280 - 0.5
  const c = 0.55 + jit * 0.1
  // The far wall is intact; the near wall has a sliver knocked out.
  line(at(0, -w), at(1, -w)).stroke(wall)
  line(at(0, w), at(c - 0.04, w)).stroke(wall)
  line(at(c + 0.1, w), at(1, w)).stroke(wall)
  g.moveTo(at(c - 0.04, w).x, at(c - 0.04, w).y)
    .lineTo(at(c + 0.01, w * 0.35).x, at(c + 0.01, w * 0.35).y)
    .lineTo(at(c + 0.1, w).x, at(c + 0.1, w).y)
    .stroke({ color: GLASS_LINE, width: 0.6, alpha: 0.45 })
  // Zigzag fracture across the tube, with a short branch.
  const z = [at(c - 0.02, -w), at(c + 0.05, -w * 0.35), at(c - 0.01, w * 0.15), at(c + 0.03, w * 0.35)]
  g.moveTo(z[0].x, z[0].y)
  for (let k = 1; k < z.length; k++) g.lineTo(z[k].x, z[k].y)
  line(at(c + 0.05, -w * 0.35), at(c + 0.14, -w * 0.7))
  g.stroke({ color: 0xf4f0ea, width: 0.7, alpha: 0.8 })
}
