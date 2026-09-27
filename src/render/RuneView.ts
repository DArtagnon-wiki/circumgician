import { Circle, Container, Graphics } from 'pixi.js'
import type { Mote, Rune, RuneLayerSpec } from '../sim/types'
import { centerLayer, middleLayer, outerLayer } from '../sim/geometry'
import { colorForMote, colorForRelease, RUNE_BODY_COLOR } from './Theme'
import { drawPolygon, localVertices } from './drawPolygon'

// Middle and center are drawn nested inside the outer at fixed fractions of
// its radius (their authored radii only matter once they become the outer).
export const MIDDLE_SCALE = 0.6
const CENTER_SCALE = 0.3
const NODE_R = 6

export class RuneView {
  readonly container = new Container() // positioned in world space
  readonly body = new Container() // scaled (icon vs field size)
  private glow = new Graphics()
  private outerG = new Graphics()
  private middleG = new Graphics()
  private centerG = new Graphics()
  private nodesG = new Graphics()
  private drawnKey = ''
  readonly runeId: string

  constructor(rune: Rune) {
    this.runeId = rune.id
    this.body.addChild(this.glow, this.outerG, this.middleG, this.centerG, this.nodesG)
    this.container.addChild(this.body)
    this.container.eventMode = 'static'
    this.container.cursor = 'pointer'
  }

  // Called every frame. `outerRot`/`middleRot` are the sim's angles; idle
  // runes pass the resting angle. `held` resolves the node's mote, if any.
  sync(rune: Rune, outerRot: number, middleRot: number, time: number, motes: Map<string, Mote>): void {
    const outer = outerLayer(rune)
    if (!outer) return
    const key = `${rune.index}`
    if (key !== this.drawnKey) this.redrawLayers(rune, outer)

    const base = Math.PI / 2
    this.outerG.rotation = outerRot + base
    this.nodesG.rotation = outerRot + base
    this.middleG.rotation = middleRot + base
    this.centerG.rotation = -(outerRot + base) * 0.5

    this.drawNodes(rune, outer, motes)

    this.glow.clear()
    if (rune.state === 'full') {
      const pulse = 0.5 + 0.5 * Math.sin(time * 6)
      this.glow.circle(0, 0, outer.radius + 12 + pulse * 5).fill({ color: 0xffffff, alpha: 0.1 + pulse * 0.12 })
      this.glow.circle(0, 0, outer.radius + 4).stroke({ color: 0xffffff, width: 2 + pulse * 2, alpha: 0.5 + pulse * 0.4 })
    } else if (rune.state === 'charging') {
      this.glow.circle(0, 0, outer.radius + 6).fill({ color: RUNE_BODY_COLOR, alpha: 0.06 })
    }
  }

  private redrawLayers(rune: Rune, outer: RuneLayerSpec): void {
    this.drawnKey = `${rune.index}`
    this.container.hitArea = new Circle(0, 0, outer.radius + 10)

    this.outerG.clear()
    drawPolygon(this.outerG, outer.sides, outer.radius, { fillColor: RUNE_BODY_COLOR, fillAlpha: 0.06, strokeColor: RUNE_BODY_COLOR, strokeWidth: 3 })

    this.middleG.clear()
    const middle = middleLayer(rune)
    if (middle) {
      const r = outer.radius * MIDDLE_SCALE
      drawPolygon(this.middleG, middle.sides, r, { fillColor: RUNE_BODY_COLOR, fillAlpha: 0.85 })
      drawPolygon(this.middleG, middle.sides, r * 0.82, { strokeColor: 0x2a1d4f, strokeWidth: 1.5, strokeAlpha: 0.6 })
    }

    this.centerG.clear()
    const center = centerLayer(rune)
    const cr = outer.radius * CENTER_SCALE
    if (!middle) {
      // Nothing beneath: the "spent core".
      this.centerG.circle(0, 0, cr * 0.6).fill({ color: 0x2a2238, alpha: 0.9 })
      this.centerG.circle(0, 0, cr * 0.6).stroke({ color: 0x6d6480, width: 1 })
    } else if (!center) {
      this.centerG.circle(0, 0, cr * 0.45).fill({ color: 0x2a2238, alpha: 0.9 })
    } else if (rune.insight === 'none') {
      this.centerG.arc(0, 0, cr, 0, Math.PI * 1.2).stroke({ color: 0x2a1d4f, width: 2, alpha: 0.8 })
      this.centerG.arc(0, 0, cr * 0.55, Math.PI, Math.PI * 2.4).stroke({ color: 0x2a1d4f, width: 2, alpha: 0.6 })
    } else {
      drawPolygon(this.centerG, center.sides, cr, { fillColor: 0x2a1d4f, fillAlpha: 0.9, strokeColor: 0xffffff, strokeWidth: 1, strokeAlpha: 0.5 })
      if (rune.insight === 'full') {
        localVertices(center.sides, cr).forEach((p, i) => {
          const n = center.nodes[i]
          this.centerG.circle(p.x, p.y, 2.6).fill({ color: colorForMote(n.catch) })
          this.centerG.circle(p.x, p.y, 1.2).fill({ color: colorForRelease(n.release) })
        })
      }
    }
  }

  // Ring = catch color (hollow when empty, solid with the caught mote's own
  // color once held); inner dot = release color. Annihilating dots get a
  // dark void center so they read as hazards.
  private drawNodes(rune: Rune, outer: RuneLayerSpec, motes: Map<string, Mote>): void {
    const g = this.nodesG
    g.clear()
    localVertices(outer.sides, outer.radius).forEach((p, i) => {
      const spec = outer.nodes[i]
      const moteId = rune.held[i]
      const mote = moteId ? motes.get(moteId) : undefined
      const catchColor = colorForMote(spec.catch)
      if (mote && mote.state === 'held') {
        g.circle(p.x, p.y, NODE_R + 3).fill({ color: colorForMote(mote.color), alpha: 0.3 })
        g.circle(p.x, p.y, NODE_R).fill({ color: colorForMote(mote.color) })
      } else {
        g.circle(p.x, p.y, NODE_R).fill({ color: 0x0d0718, alpha: 0.85 })
        g.circle(p.x, p.y, NODE_R).stroke({ color: catchColor, width: 2.5, alpha: mote ? 1 : 0.9 })
      }
      if (spec.release === 'annihilating') {
        g.circle(p.x, p.y, 3).fill({ color: colorForRelease('annihilating') })
        g.circle(p.x, p.y, 1.4).fill({ color: 0x000000 })
      } else {
        g.circle(p.x, p.y, 2.6).fill({ color: colorForRelease(spec.release) })
        if (spec.release === 'generic') g.circle(p.x, p.y, 2.6).stroke({ color: 0xffffff, width: 0.8 })
      }
    })
  }
}
