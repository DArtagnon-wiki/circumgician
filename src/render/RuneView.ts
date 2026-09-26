import { Circle, Container, Graphics } from 'pixi.js'
import type { Rune } from '../model/Rune'
import { verticesOf } from '../model/Polygon'
import { colorForSides } from './Theme'
import { drawPolygon } from './drawPolygon'

export class RuneView {
  container = new Container()
  private glowGraphic = new Graphics()
  private outerGraphic = new Graphics()
  private innerGraphic = new Graphics()
  private nodesGraphic = new Graphics()
  private rune: Rune
  private active = false

  constructor(rune: Rune) {
    this.rune = rune
    this.container.addChild(this.glowGraphic, this.outerGraphic, this.innerGraphic, this.nodesGraphic)
    this.container.eventMode = 'static'
    this.container.cursor = 'pointer'
    this.container.hitArea = new Circle(0, 0, rune.outer.radius + 8)
    this.redraw()
  }

  setPosition(x: number, y: number): void {
    this.container.position.set(x, y)
  }

  setActive(active: boolean): void {
    this.active = active
    this.redraw()
  }

  private redraw(): void {
    this.glowGraphic.clear()
    if (this.active) {
      this.glowGraphic.circle(0, 0, this.rune.outer.radius + 10).fill({ color: 0xffffff, alpha: 0.18 })
    }

    this.outerGraphic.clear()
    drawPolygon(
      this.outerGraphic,
      this.rune.outer,
      { x: 0, y: 0 },
      {
        strokeColor: this.active ? 0xffffff : colorForSides(this.rune.outer.sides),
        strokeWidth: this.active ? 4 : 2,
      },
    )

    this.innerGraphic.clear()
    drawPolygon(
      this.innerGraphic,
      this.rune.inner,
      { x: 0, y: 0 },
      { fillColor: colorForSides(this.rune.inner.sides), fillAlpha: 0.9 },
    )

    this.syncNodes()
  }

  syncNodes(): void {
    this.nodesGraphic.clear()
    const positions = verticesOf(this.rune.outer, { x: 0, y: 0 })
    this.rune.nodes.forEach((node, i) => {
      const p = positions[i]
      if (node.filled) {
        this.nodesGraphic.circle(p.x, p.y, 6).fill({ color: colorForSides(this.rune.inner.sides), alpha: 1 })
      } else {
        this.nodesGraphic.circle(p.x, p.y, 4).fill({ color: 0xffffff, alpha: 0.6 })
      }
    })
  }
}
