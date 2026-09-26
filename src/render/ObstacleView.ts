import { Container, Graphics, Text } from 'pixi.js'
import type { Obstacle } from '../model/Obstacle'
import { colorForSides } from './Theme'
import { drawPolygon } from './drawPolygon'

export class ObstacleView {
  container = new Container()
  private shapeGraphic = new Graphics()
  private hpText: Text
  private obstacle: Obstacle

  constructor(obstacle: Obstacle) {
    this.obstacle = obstacle
    this.hpText = new Text({
      text: String(obstacle.hp),
      style: { fill: 0xffffff, fontSize: 22, fontWeight: 'bold' },
    })
    this.hpText.anchor.set(0.5)
    this.container.addChild(this.shapeGraphic, this.hpText)
    this.redraw()
  }

  setPosition(x: number, y: number): void {
    this.container.position.set(x, y)
  }

  updateHp(hp: number): void {
    this.obstacle.hp = hp
    this.hpText.text = String(hp)
  }

  private redraw(): void {
    this.shapeGraphic.clear()
    drawPolygon(
      this.shapeGraphic,
      this.obstacle.shape,
      { x: 0, y: 0 },
      {
        fillColor: colorForSides(this.obstacle.shape.sides),
        fillAlpha: 0.85,
        strokeColor: 0xffffff,
        strokeWidth: 2,
      },
    )
  }
}
