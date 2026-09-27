import { Graphics } from 'pixi.js'
import type { Mote } from '../sim/types'
import { colorForMote } from './Theme'

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
      const breathe = 0.12 + Math.sin(time * 2.2 + this.phase) * 0.04
      g.circle(x, y, 16).fill({ color, alpha: breathe })
    }
    if (mote.color === 'generic') {
      // Wildcards shimmer with a thin rotating prism ring.
      const a = time * 2 + this.phase
      g.arc(x, y, 9, a, a + Math.PI * 1.3).stroke({ color: 0xffffff, width: 1.5, alpha: 0.7 })
    }
    g.circle(x, y, 5.5).fill({ color, alpha: 0.95 })
    g.circle(x - 1.5, y - 1.5, 2).fill({ color: 0xffffff, alpha: 0.55 })
  }
}
