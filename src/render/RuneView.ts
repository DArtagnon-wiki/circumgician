import { Circle, Container, Graphics } from 'pixi.js'
import { GlowFilter } from 'pixi-filters'
import type { Rune } from '../model/Rune'
import { verticesOf } from '../model/Polygon'
import { colorForSides } from './Theme'
import { drawPolygon } from './drawPolygon'

// NOTE: this is a mechanical port to the new outer/middle/center model —
// full 3-layer rendering (per-node color rings, the center indicator's
// none/shape/full spectrum) is M3's job. For now `center` isn't drawn at all.
export class RuneView {
  container = new Container()
  private glowGraphic = new Graphics()
  private outerGraphic = new Graphics()
  private middleGraphic = new Graphics()
  private nodesGraphic = new Graphics()
  private rune: Rune
  private active = false
  private glowFilter: GlowFilter

  constructor(rune: Rune) {
    this.rune = rune
    this.glowFilter = new GlowFilter({
      distance: 10,
      outerStrength: 2.5,
      color: colorForSides(rune.middle.shape.sides),
      quality: 0.3,
    })
    this.container.addChild(this.glowGraphic, this.outerGraphic, this.middleGraphic, this.nodesGraphic)
    this.container.eventMode = 'static'
    this.container.cursor = 'pointer'
    this.container.hitArea = new Circle(0, 0, rune.outer.shape.radius + 8)
    this.redraw()
  }

  setPosition(x: number, y: number): void {
    this.container.position.set(x, y)
  }

  setActive(active: boolean): void {
    this.active = active
    this.redraw()
  }

  // Public so callers can force a full re-render after the underlying
  // rune's shapes change in place (e.g. promotion) — not just active/inactive
  // toggling, which is what triggered a redraw before this model existed.
  redraw(): void {
    this.container.filters = this.active ? [this.glowFilter] : []
    this.glowFilter.color = colorForSides(this.rune.middle.shape.sides)
    this.container.hitArea = new Circle(0, 0, this.rune.outer.shape.radius + 8)

    this.glowGraphic.clear()
    if (this.active) {
      this.glowGraphic.circle(0, 0, this.rune.outer.shape.radius + 10).fill({ color: 0xffffff, alpha: 0.18 })
    }

    this.outerGraphic.clear()
    drawPolygon(
      this.outerGraphic,
      this.rune.outer.shape,
      { x: 0, y: 0 },
      {
        strokeColor: this.active ? 0xffffff : colorForSides(this.rune.outer.shape.sides),
        strokeWidth: this.active ? 4 : 2,
      },
    )

    this.middleGraphic.clear()
    drawPolygon(
      this.middleGraphic,
      this.rune.middle.shape,
      { x: 0, y: 0 },
      { fillColor: colorForSides(this.rune.middle.shape.sides), fillAlpha: 0.9 },
    )

    this.syncNodes()
  }

  syncNodes(): void {
    this.nodesGraphic.clear()
    const positions = verticesOf(this.rune.outer.shape, { x: 0, y: 0 })
    this.rune.nodes.forEach((node, i) => {
      const p = positions[i]
      if (node.filled) {
        this.nodesGraphic.circle(p.x, p.y, 6).fill({ color: colorForSides(this.rune.middle.shape.sides), alpha: 1 })
      } else {
        this.nodesGraphic.circle(p.x, p.y, 4).fill({ color: 0xffffff, alpha: 0.6 })
      }
    })
  }
}
