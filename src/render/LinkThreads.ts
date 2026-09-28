import { Container, Graphics, Sprite } from 'pixi.js'
import type { Vec2 } from '../sim/types'
import { INVALID_TINT } from './Theme'
import { textures } from './textures'

export interface Link {
  from: Vec2 // rune
  to: Vec2 // obstacle
  full?: boolean // brighter and faster
  preview?: boolean // a dimmer drag preview
  invalid?: boolean // preview over a spot the rune can't be placed
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
      const color = l.invalid ? INVALID_TINT : THREAD
      const dim = l.preview ? 0.55 : 1
      const bright = l.full ? 1.6 : 1
      const speed = l.full ? 3.4 : 1.5 // wave speed, rad/s
      // Soft glow under the thread.
      g.moveTo(l.from.x, l.from.y).lineTo(l.to.x, l.to.y).stroke({ color, width: l.full ? 5 : 3.5, alpha: 0.06 * dim * bright })
      // The thread in segments, each lit by a traveling wave.
      for (let k = 0; k < SEGMENTS; k++) {
        const t0 = k / SEGMENTS
        const t1 = (k + 1) / SEGMENTS
        const wave = 0.5 + 0.5 * Math.sin(time * speed * 2 - t0 * 9)
        g.moveTo(l.from.x + dx * t0, l.from.y + dy * t0)
          .lineTo(l.from.x + dx * t1, l.from.y + dy * t1)
          .stroke({ color, width: l.full ? 1.4 : 1, alpha: Math.min(1, (0.18 + 0.3 * wave) * dim * bright) })
      }
      // Glyph beads drifting toward the obstacle, fading in and out at the ends.
      const n = Math.max(1, Math.floor(len / BEAD_GAP))
      const drift = (l.full ? 34 : 14) * (l.preview ? 0.6 : 1)
      const glyphs = textures().beads
      for (let k = 0; k < n; k++) {
        const phase = ((time * drift) / len + k / n) % 1
        const b = this.bead(used++)
        b.texture = glyphs[k % glyphs.length]
        b.position.set(l.from.x + dx * phase, l.from.y + dy * phase)
        b.rotation = time * 0.8 + k * 1.7
        b.scale.set((l.full ? 15 : 12) / 32)
        b.tint = l.invalid ? INVALID_TINT : BEAD
        b.alpha = Math.sin(phase * Math.PI) * (l.full ? 0.95 : 0.6) * dim
      }
    }
    for (let i = used; i < this.beads.length; i++) this.beads[i].visible = false
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
