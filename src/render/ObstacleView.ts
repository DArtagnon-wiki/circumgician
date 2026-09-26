import { Container, Graphics, Text } from 'pixi.js'
import type { Obstacle } from '../model/Obstacle'
import type { PolygonSpec } from '../model/Polygon'
import { OBSTACLE_COLOR } from './Theme'
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

  // Called on layer promotion — the obstacle's active shape actually
  // changes, not just its HP. Full "shell cracked" reveal treatment is M3's
  // job; this keeps the view correct in the meantime.
  updateLayer(shape: PolygonSpec, hp: number, maxHp: number): void {
    this.obstacle.shape = shape
    this.obstacle.hp = hp
    this.obstacle.maxHp = maxHp
    this.hpText.text = String(hp)
    this.redraw()
  }

  private redraw(): void {
    this.shapeGraphic.clear()
    drawPolygon(
      this.shapeGraphic,
      this.obstacle.shape,
      { x: 0, y: 0 },
      {
        fillColor: OBSTACLE_COLOR,
        fillAlpha: 0.85,
        strokeColor: 0xffffff,
        strokeWidth: 2,
      },
    )
  }
}
