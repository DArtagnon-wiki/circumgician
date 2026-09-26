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
    this.graphic
      .circle(puff.position.x, puff.position.y, 18)
      .fill({ color, alpha: 0.12 })
      .circle(puff.position.x, puff.position.y, 6)
      .fill({ color, alpha: 0.85 })
  }

  hide(): void {
    this.graphic.clear()
  }
}
