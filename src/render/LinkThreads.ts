import { Container, Graphics, Sprite } from 'pixi.js'
import type { Vec2 } from '../sim/types'
import { FROST, RIME } from './Frost'
import { INVALID_TINT } from './Theme'
import { textures } from './textures'

export interface Link {
  from: Vec2 // rune
  to: Vec2 // obstacle
  full?: boolean // brighter and faster
  preview?: boolean // a dimmer drag preview
  invalid?: boolean // preview over a spot the rune can't be placed
  frost?: boolean // the blow won't break the frost layer it strikes: the piece will freeze
  tether?: boolean // ice held by the frost layer that froze it (from: the ice)
}

const THREAD = 0xe6dcff
const BEAD = 0xf1e9ff
const BEAD_GAP = 44 // px between glyph beads along a thread
const SEGMENTS = 14

// Links are thin shimmering threads: a wave of brightness runs along each
// toward its obstacle, carrying drifting glyph beads. Drawn fresh each
// frame; bead sprites are pooled.
export class LinkThreads {
  readonly container = new Container()
  readonly g = new Graphics()
  private beads: Sprite[] = []
  private beadLayer = new Container()

  constructor() {
    this.container.eventMode = 'none'
    this.beadLayer.blendMode = 'add'
    this.container.addChild(this.g, this.beadLayer)
  }

  // Clears the graphics too; callers may add their own overlay lines to `g`
  // after this (debug rings).
  draw(links: Link[], time: number): void {
    const g = this.g
    g.clear()
    let used = 0
    for (const l of links) {
      const dx = l.to.x - l.from.x
      const dy = l.to.y - l.from.y
      const len = Math.hypot(dx, dy)
      if (len < 1) continue
      if (l.tether) {
        this.tether(l, dx, dy, len, time)
        continue
      }
      const color = l.invalid ? INVALID_TINT : l.frost ? FROST : THREAD
      const dim = l.preview ? 0.55 : 1
      const bright = l.full ? 1.6 : 1
      const speed = l.full ? 3.4 : 1.5 // wave speed, rad/s
      // Soft glow under the thread.
      g.moveTo(l.from.x, l.from.y).lineTo(l.to.x, l.to.y).stroke({ color, width: l.full ? 5 : 3.5, alpha: 0.06 * dim * bright })
      // The thread in segments, each lit by a traveling wave. A frost
      // warning runs jagged, like a crack in ice.
      const nx = -dy / len
      const ny = dx / len
      const jag = (k: number) => (l.frost && k > 0 && k < SEGMENTS ? (k % 2 ? 3 : -3) : 0)
      for (let k = 0; k < SEGMENTS; k++) {
        const t0 = k / SEGMENTS
        const t1 = (k + 1) / SEGMENTS
        const wave = 0.5 + 0.5 * Math.sin(time * speed * 2 - t0 * 9)
        g.moveTo(l.from.x + dx * t0 + nx * jag(k), l.from.y + dy * t0 + ny * jag(k))
          .lineTo(l.from.x + dx * t1 + nx * jag(k + 1), l.from.y + dy * t1 + ny * jag(k + 1))
          .stroke({ color, width: l.full || l.frost ? 1.4 : 1, alpha: Math.min(1, (0.18 + 0.3 * wave) * dim * bright * (l.frost ? 1.5 : 1)) })
      }
      // Glyph beads drifting toward the obstacle, fading in and out at the ends.
      const n = Math.max(1, Math.floor(len / BEAD_GAP))
      const drift = (l.full ? 34 : 14) * (l.preview ? 0.6 : 1)
      const glyphs = textures().beads
      const flake = textures().star
      for (let k = 0; k < n; k++) {
        const phase = ((time * drift) / len + k / n) % 1
        const b = this.bead(used++)
        b.texture = l.frost ? flake : glyphs[k % glyphs.length]
        b.position.set(l.from.x + dx * phase, l.from.y + dy * phase)
        b.rotation = time * 0.8 + k * 1.7
        b.scale.set((l.full ? 15 : 12) / 32)
        b.tint = l.invalid ? INVALID_TINT : l.frost ? RIME : BEAD
        b.alpha = Math.sin(phase * Math.PI) * (l.full ? 0.95 : 0.6) * dim
      }
    }
    for (let i = used; i < this.beads.length; i++) this.beads[i].visible = false
  }

  // A cold dotted line, breathing slowly: the ice thaws when that layer falls.
  private tether(l: Link, dx: number, dy: number, len: number, time: number): void {
    const g = this.g
    const n = Math.max(2, Math.floor(len / 9))
    const breathe = 0.5 + 0.5 * Math.sin(time * 1.6)
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n
      const fade = Math.sin(u * Math.PI)
      g.circle(l.from.x + dx * u, l.from.y + dy * u, 1.4).fill({ color: FROST, alpha: (0.28 + 0.25 * breathe) * (0.4 + 0.6 * fade) })
    }
  }

  private bead(i: number): Sprite {
    let b = this.beads[i]
    if (!b) {
      b = new Sprite(textures().beads[0])
      b.anchor.set(0.5)
      this.beadLayer.addChild(b)
      this.beads.push(b)
    }
    b.visible = true
    return b
  }
}
