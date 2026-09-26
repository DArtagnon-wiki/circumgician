import { Graphics } from 'pixi.js'
import type { MiasmaPuff } from '../model/MiasmaPuff'
import { colorForMote } from './Theme'

// Cheap glow trick: a large low-alpha circle behind a crisp small one,
// avoids real-time filters on every drifting puff for GPU headroom on iPhone.
export class MiasmaPuffView {
  graphic = new Graphics()

  sync(puff: MiasmaPuff): void {
    const color = colorForMote(puff.color)
    this.graphic.clear()

    if (puff.state === 'traveling' && puff.travelStartPos) {
      // "Being drawn in" indicator: a faded comet-tail stretching back
      // toward where this puff was reserved from, plus a brighter/larger
      // glow — clearly distinct from ambient wandering.
      const dx = puff.position.x - puff.travelStartPos.x
      const dy = puff.position.y - puff.travelStartPos.y
      const dist = Math.hypot(dx, dy)
      if (dist > 1) {
        const tailX = puff.position.x - (dx / dist) * Math.min(dist, 22)
        const tailY = puff.position.y - (dy / dist) * Math.min(dist, 22)
        this.graphic
          .moveTo(puff.position.x, puff.position.y)
          .lineTo(tailX, tailY)
          .stroke({ color, width: 3, alpha: 0.35 })
      }
      this.graphic.circle(puff.position.x, puff.position.y, 22).fill({ color, alpha: 0.18 })
    } else {
      this.graphic.circle(puff.position.x, puff.position.y, 18).fill({ color, alpha: 0.12 })
    }

    this.graphic.circle(puff.position.x, puff.position.y, 6).fill({ color, alpha: 0.85 })
  }

  hide(): void {
    this.graphic.clear()
  }
}
