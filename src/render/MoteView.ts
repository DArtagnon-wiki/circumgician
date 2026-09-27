import { Graphics } from 'pixi.js'
import type { Mote } from '../sim/types'
import { colorForMote, HUE_COLORS } from './Theme'

// Cheap glow: a large low-alpha circle behind a crisp small one (no filters
// per mote, for iPhone GPU headroom). Held motes are drawn by their rune's
// node instead, so they are hidden here.
export class MoteView {
  graphic = new Graphics()
  private phase = Math.random() * Math.PI * 2

  sync(mote: Mote, time: number): void {
    const g = this.graphic
    g.clear()
    if (mote.state === 'held') return
    const color = colorForMote(mote.color)
    const { x, y } = mote.pos

    if (mote.state === 'traveling' && mote.travelFrom) {
      const dx = x - mote.travelFrom.x
      const dy = y - mote.travelFrom.y
      const d = Math.hypot(dx, dy)
      if (d > 1) {
        const tail = Math.min(d, 26)
        g.moveTo(x, y)
          .lineTo(x - (dx / d) * tail, y - (dy / d) * tail)
          .stroke({ color, width: 4, alpha: 0.45 })
      }
      g.circle(x, y, 20).fill({ color, alpha: 0.22 })
    } else if (mote.state === 'ejecting' && mote.ejectFrom) {
      const dx = mote.home.x - mote.ejectFrom.x
      const dy = mote.home.y - mote.ejectFrom.y
      const d = Math.hypot(dx, dy)
      const remaining = 1 - (mote.t ?? 1)
      if (d > 1 && remaining > 0.05) {
        const tail = 30 * remaining
        g.moveTo(x, y)
          .lineTo(x - (dx / d) * tail, y - (dy / d) * tail)
          .stroke({ color, width: 5, alpha: 0.5 * remaining + 0.1 })
      }
      g.circle(x, y, 22).fill({ color, alpha: 0.25 })
    } else {
      const speed = mote.vel ? Math.hypot(mote.vel.x, mote.vel.y) : 0
      if (speed > 15 && mote.vel) {
        // Coasting after a kick or a rune's push: a short streak behind it.
        const tail = Math.min(24, speed * 0.12)
        g.moveTo(x, y)
          .lineTo(x - (mote.vel.x / speed) * tail, y - (mote.vel.y / speed) * tail)
          .stroke({ color, width: 4, alpha: 0.4 })
      }
      const breathe = 0.12 + Math.sin(time * 2.2 + this.phase) * 0.04
      g.circle(x, y, 16).fill({ color, alpha: breathe })
    }
    if (mote.color === 'generic') {
      // Wildcard: a white core with three tiny hue sparks orbiting it.
      // Deliberately unlike a rune's center glyph.
      const sparks = [HUE_COLORS.red, HUE_COLORS.teal, HUE_COLORS.gold]
      sparks.forEach((c, k) => {
        const a = time * 2.4 + this.phase + (k * Math.PI * 2) / 3
        g.circle(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 1.8).fill({ color: c })
      })
      g.circle(x, y, 5.5).fill({ color: 0xffffff, alpha: 0.95 })
    } else {
      g.circle(x, y, 5.5).fill({ color, alpha: 0.95 })
    }
    g.circle(x - 1.5, y - 1.5, 2).fill({ color: 0xffffff, alpha: 0.55 })
  }
}
