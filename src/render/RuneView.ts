import { Container, Graphics } from 'pixi.js'
import type { Rune } from '../model/Rune'
import { verticesOf } from '../model/Polygon'
import { colorForSides } from './Theme'
import { drawPolygon } from './drawPolygon'

export class RuneView {
  container = new Container()
  private outerGraphic = new Graphics()
  private innerGraphic = new Graphics()
  private nodesGraphic = new Graphics()
  private rune: Rune

  constructor(rune: Rune) {
    this.rune = rune
    this.container.addChild(this.outerGraphic, this.innerGraphic, this.nodesGraphic)
    this.redraw()
  }

  setPosition(x: number, y: number): void {
    this.container.position.set(x, y)
  }

  private redraw(): void {
    this.outerGraphic.clear()
    drawPolygon(
      this.outerGraphic,
      this.rune.outer,
      { x: 0, y: 0 },
      { strokeColor: colorForSides(this.rune.outer.sides), strokeWidth: 2 },
    )

    this.innerGraphic.clear()
    drawPolygon(
      this.innerGraphic,
      this.rune.inner,
      { x: 0, y: 0 },
      { fillColor: colorForSides(this.rune.inner.sides), fillAlpha: 0.9 },
    )

    this.nodesGraphic.clear()
    for (const node of verticesOf(this.rune.outer, { x: 0, y: 0 })) {
      this.nodesGraphic.circle(node.x, node.y, 4).fill({ color: 0xffffff, alpha: 0.6 })
    }
  }
}
