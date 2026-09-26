import { Circle, Container, Graphics } from 'pixi.js'
import { GlowFilter } from 'pixi-filters'
import type { Rune } from '../model/Rune'
import type { MoteColor } from '../model/Color'
import { verticesOf } from '../model/Polygon'
import { colorForMote, colorForRelease, RUNE_BODY_COLOR } from './Theme'
import { drawPolygon } from './drawPolygon'

const CENTER_DISPLAY_RADIUS = 13 // fixed inset size regardless of the center's real side count/radius

// Middle is drawn at a fraction of the CURRENT outer's actual radius, never
// its own independently-baked radius — radiusForSides scales with side
// count, so a middle layer with more sides than outer (routine after a
// promotion, when an old center becomes the new middle) would otherwise
// render literally bigger than, and poking out of, the outer it's nested in.
const MIDDLE_SCALE = 0.62

export class RuneView {
  container = new Container()
  private glowGraphic = new Graphics()
  private outerGraphic = new Graphics()
  private middleGraphic = new Graphics()
  private nodesGraphic = new Graphics()
  private centerGraphic = new Graphics()
  private rune: Rune
  private active = false
  private glowFilter: GlowFilter
  private filledColors = new Map<number, MoteColor>()
  private enigmaRotation = 0

  constructor(rune: Rune) {
    this.rune = rune
    this.glowFilter = new GlowFilter({
      distance: 10,
      outerStrength: 2.5,
      color: RUNE_BODY_COLOR,
      quality: 0.3,
    })
    this.container.addChild(
      this.glowGraphic,
      this.outerGraphic,
      this.middleGraphic,
      this.centerGraphic,
      this.nodesGraphic,
    )
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
    this.container.filters = active ? [this.glowFilter] : []
    this.redraw()
  }

  // A node actually caught a specific mote — recorded so the filled dot
  // shows what was really caught, which may differ from a generic catch
  // requirement (any matching color could have arrived).
  setNodeCaughtColor(nodeIndex: number, color: MoteColor): void {
    this.filledColors.set(nodeIndex, color)
    this.syncNodes()
  }

  // Advances the center indicator's animated "enigma" state — only does
  // anything while insightLevel is 'none' and there's something to obscure.
  update(dt: number): void {
    if (this.rune.insightLevel !== 'none' || !this.rune.center) return
    this.enigmaRotation += dt * 1.4
    this.drawCenter()
  }

  // Public so callers can force a full re-render after the underlying
  // rune's shapes change in place (e.g. promotion) — not just active/inactive
  // toggling, which is what triggered a redraw before this model existed.
  redraw(): void {
    // filters is intentionally NOT reassigned here (only in setActive(),
    // where the active flag genuinely changes) — reassigning the filters
    // array on the same tick the outer Graphics geometry is cleared and
    // redrawn (as every promotion does) triggered a PixiJS filter-bounds
    // bug where the container rendered at a stale/wrong screen position
    // despite its actual transform being correct, discovered live during
    // an M7 playtest of a real detonation.
    this.glowFilter.color = RUNE_BODY_COLOR
    this.container.hitArea = new Circle(0, 0, this.rune.outer.shape.radius + 8)
    this.filledColors.clear() // nodes are always fresh right after a redraw is warranted

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
        strokeColor: this.active ? 0xffffff : RUNE_BODY_COLOR,
        strokeWidth: this.active ? 4 : 2,
      },
    )

    this.middleGraphic.clear()
    drawPolygon(
      this.middleGraphic,
      { sides: this.rune.middle.shape.sides, radius: this.rune.outer.shape.radius * MIDDLE_SCALE },
      { x: 0, y: 0 },
      { fillColor: RUNE_BODY_COLOR, fillAlpha: 0.9 },
    )

    this.drawCenter()
    this.syncNodes()
  }

  // Every node always shows two colors: an outer ring for its catch (outer)
  // requirement and a small inner dot for its release (inner) value — the
  // ring is hollow until a mote is caught, then fills solid as the capture
  // indicator, while the inner dot's release color never changes.
  syncNodes(): void {
    this.nodesGraphic.clear()
    const positions = verticesOf(this.rune.outer.shape, { x: 0, y: 0 })
    this.rune.nodes.forEach((node, i) => {
      const p = positions[i]
      const nodeColors = this.rune.outer.nodeColors[i]
      if (node.filled) {
        const caught = this.filledColors.get(i)
        const ringColor = caught !== undefined ? colorForMote(caught) : colorForMote(nodeColors.catch)
        this.nodesGraphic.circle(p.x, p.y, 6).fill({ color: ringColor, alpha: 1 })
      } else {
        this.nodesGraphic.circle(p.x, p.y, 6).stroke({ color: colorForMote(nodeColors.catch), width: 2, alpha: 0.8 })
      }
      this.nodesGraphic.circle(p.x, p.y, 2.5).fill({ color: colorForRelease(nodeColors.release), alpha: 1 })
    })
  }

  private drawCenter(): void {
    this.centerGraphic.clear()

    if (!this.rune.center) {
      // Nothing left to hide once there's nothing left — a distinct, minimal
      // "spent core" glyph regardless of insight level.
      this.centerGraphic.circle(0, 0, 5).fill({ color: 0x333344, alpha: 0.6 })
      return
    }

    if (this.rune.insightLevel === 'none') {
      this.drawEnigma()
      return
    }

    const displaySpec = { sides: this.rune.center.shape.sides, radius: CENTER_DISPLAY_RADIUS }

    if (this.rune.insightLevel === 'shape') {
      drawPolygon(this.centerGraphic, displaySpec, { x: 0, y: 0 }, { strokeColor: 0x9a95ad, strokeWidth: 1.5 })
      return
    }

    // 'full': real shape + real per-node colors, dimmed to read as preview.
    drawPolygon(
      this.centerGraphic,
      displaySpec,
      { x: 0, y: 0 },
      { fillColor: RUNE_BODY_COLOR, fillAlpha: 0.3, strokeColor: 0xffffff, strokeWidth: 1 },
    )
    const positions = verticesOf(displaySpec, { x: 0, y: 0 })
    this.rune.center.nodeColors.forEach((nc, i) => {
      const p = positions[i]
      this.centerGraphic.circle(p.x, p.y, 2.5).fill({ color: colorForRelease(nc.release), alpha: 0.85 })
    })
  }

  private drawEnigma(): void {
    const r = CENTER_DISPLAY_RADIUS
    this.centerGraphic
      .arc(0, 0, r, this.enigmaRotation, this.enigmaRotation + Math.PI * 1.2)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.4 })
      .arc(0, 0, r * 0.6, -this.enigmaRotation * 1.3, -this.enigmaRotation * 1.3 + Math.PI * 1.4)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.25 })
  }
}
