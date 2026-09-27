import { Container, Graphics, Text } from 'pixi.js'
import type { Obstacle } from '../sim/types'
import { OBSTACLE_COLOR } from './Theme'
import { drawPolygon } from './drawPolygon'

export class ObstacleView {
  readonly container = new Container()
  private shape = new Graphics()
  private hpText: Text
  private drawnIndex = -1
  private shown = 1 // pop-in scale for a freshly revealed layer
  private flash = 0

  constructor(obstacle: Obstacle) {
    this.hpText = new Text({ text: '', style: { fill: 0xffffff, fontSize: 22, fontWeight: 'bold', fontFamily: 'Georgia, serif' } })
    this.hpText.anchor.set(0.5)
    this.container.addChild(this.shape, this.hpText)
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
      if (this.drawnIndex !== -1) this.shown = 0.4
      this.drawnIndex = obstacle.index
    }
    this.shown = Math.min(1, this.shown + dt * 3)
    this.flash = Math.max(0, this.flash - dt * 4)
    const pop = this.shown < 1 ? 1 + Math.sin(this.shown * Math.PI) * 0.15 : 1
    this.container.scale.set(this.shown * pop + (1 - this.shown) * 0.4)

    this.shape.clear()
    const breathe = Math.sin(time * 1.3 + obstacle.pos.x) * 0.04
    drawPolygon(this.shape, layer.sides, layer.radius + 8, { strokeColor: 0x9b7bff, strokeWidth: 1, strokeAlpha: 0.25 + breathe })
    drawPolygon(this.shape, layer.sides, layer.radius, {
      fillColor: this.flash > 0 ? 0xffffff : OBSTACLE_COLOR,
      fillAlpha: this.flash > 0 ? 0.3 + this.flash * 0.5 : 0.9,
      strokeColor: 0xffffff,
      strokeWidth: 2,
    })
    this.shape.rotation = Math.sin(time * 0.4 + obstacle.pos.y) * 0.05
    this.hpText.text = String(obstacle.hp)
  }
}
