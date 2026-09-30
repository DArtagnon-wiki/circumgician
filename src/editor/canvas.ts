import { Application, Container, Graphics, Rectangle, Text, type FederatedPointerEvent } from 'pixi.js'
import { drawZoneBackground } from '../render/ZoneBackground'
import { colorForMote, OBSTACLE_COLOR, RUNE_BODY_COLOR, usePalette } from '../render/Theme'
import { polygonPoints } from '../sim/geometry'
import { DEFAULT_TETHER, FOOTPRINT_MARGIN, OBSTACLE_ZONE, REACH, VIRTUAL_H, VIRTUAL_W } from '../sim/constants'
import type { Rect, Vec2 } from '../sim/types'
import type { EditorState } from './state'

const SELECT_COLOR = 0x7cffb2

type Drag =
  | { kind: 'move'; start: Vec2; apply: (dx: number, dy: number) => void }
  | { kind: 'blocker'; start: Vec2 }
  | null

// The editing view: draws the level in virtual coordinates, fitted into its
// host element, and turns pointer gestures into state edits per tool.
export class EditorCanvas {
  readonly app = new Application()
  private world = new Container()
  private bg = new Container()
  private g = new Graphics()
  private labels = new Container()
  private drag: Drag = null
  private preview: Rect | null = null
  private state: EditorState
  private host: HTMLElement

  constructor(state: EditorState, host: HTMLElement) {
    this.state = state
    this.host = host
  }

  async init(): Promise<void> {
    await this.app.init({ resizeTo: this.host, antialias: true, background: 0x07040d, resolution: Math.min(devicePixelRatio, 2), autoDensity: true })
    this.host.appendChild(this.app.canvas)
    this.world.addChild(this.bg, this.g, this.labels)
    this.app.stage.addChild(this.world)
    this.app.stage.eventMode = 'static'
    this.app.stage.on('pointerdown', (e) => this.onDown(e))
    this.app.stage.on('globalpointermove', (e) => this.onMove(e))
    this.app.stage.on('pointerup', () => this.onUp())
    this.app.stage.on('pointerupoutside', () => this.onUp())
    this.app.renderer.on('resize', () => this.render())
    this.state.onChange(() => this.render())
    this.render()
  }

  private fit(): void {
    const { width, height } = this.app.screen
    const s = Math.min(width / VIRTUAL_W, height / VIRTUAL_H) * 0.97
    this.world.scale.set(s)
    this.world.position.set((width - VIRTUAL_W * s) / 2, (height - VIRTUAL_H * s) / 2)
    this.app.stage.hitArea = new Rectangle(0, 0, width, height)
  }

  private toWorld(e: FederatedPointerEvent): Vec2 {
    const p = this.world.toLocal(e.global)
    const snap = e.shiftKey ? 10 : 1
    return { x: Math.round(p.x / snap) * snap, y: Math.round(p.y / snap) * snap }
  }

  render(): void {
    if (!this.state.level) return
    this.fit()
    const L = this.state.level
    const sel = this.state.selection
    const g = this.g
    const { sky } = usePalette(L.palette)
    g.clear()
    this.bg.removeChildren().forEach((c) => c.destroy({ children: true }))
    this.bg.addChild(drawZoneBackground(L.field, L.blockers, sky))
    this.labels.removeChildren().forEach((c) => c.destroy())

    // Blocker/field outlines for selection and the rubber-band preview.
    L.blockers.forEach((b, i) => {
      if (sel?.kind === 'blocker' && sel.i === i) g.rect(b.x, b.y, b.w, b.h).stroke({ color: SELECT_COLOR, width: 2 })
    })
    if (this.preview) g.rect(this.preview.x, this.preview.y, this.preview.w, this.preview.h).stroke({ color: SELECT_COLOR, width: 1.5, alpha: 0.8 })

    // Ghost placements: footprint, outer polygon and the catch ring.
    for (const gh of this.state.ghosts) {
      const layer = L.hand[gh.rune]?.layers[gh.layer]
      if (!layer) continue
      const c = { x: gh.x, y: gh.y }
      g.circle(c.x, c.y, layer.radius + REACH).fill({ color: 0x7cffb2, alpha: 0.06 })
      g.circle(c.x, c.y, layer.radius + REACH).stroke({ color: 0x7cffb2, width: 1, alpha: 0.6 })
      g.circle(c.x, c.y, Math.max(1, layer.radius - REACH)).stroke({ color: 0x7cffb2, width: 1, alpha: 0.6 })
      g.circle(c.x, c.y, layer.radius + FOOTPRINT_MARGIN).stroke({ color: 0xffffff, width: 1, alpha: 0.25 })
      const pts = polygonPoints(c, layer.sides, layer.radius, -Math.PI / 2)
      g.poly(pts.flatMap((p) => [p.x, p.y])).stroke({ color: RUNE_BODY_COLOR, width: 2, alpha: 0.7 })
      pts.forEach((p, k) => g.circle(p.x, p.y, 4).stroke({ color: colorForMote(layer.nodes[k].catch), width: 2 }))
      this.label(`R${gh.rune + 1}.${gh.layer + 1}`, c.x, c.y, 10, 0x7cffb2)
    }

    L.obstacles.forEach((o, i) => {
      const layer = o.layers[0]
      if (!layer) return
      // A two-shape layer's second shape, turned half a step, behind.
      if (layer.pair !== undefined) {
        const second = polygonPoints({ x: o.x, y: o.y }, layer.pair, layer.radius, -Math.PI / 2 + Math.PI / layer.pair)
        g.poly(second.flatMap((p) => [p.x, p.y])).fill({ color: OBSTACLE_COLOR, alpha: 0.9 }).stroke({ color: 0xffffff, width: 2 })
      }
      const pts = polygonPoints({ x: o.x, y: o.y }, layer.sides, layer.radius, -Math.PI / 2)
      g.poly(pts.flatMap((p) => [p.x, p.y])).fill({ color: OBSTACLE_COLOR, alpha: 0.9 }).stroke({ color: 0xffffff, width: 2 })
      if (sel?.kind === 'obstacle' && sel.i === i) g.circle(o.x, o.y, layer.radius + 8).stroke({ color: SELECT_COLOR, width: 2 })
      this.label(String(layer.hp), o.x, o.y, 18, 0xffffff)
      const depth = o.layers.map((l) => `${l.sides}${l.pair === undefined ? '' : `+${l.pair}`}:${l.hp}`).join(' > ')
      this.label(depth, o.x, o.y + layer.radius + 14, 10, 0xb8a8e0)
    })

    L.motes.forEach((m, i) => {
      const color = colorForMote(m.color)
      g.circle(m.x, m.y, m.tether ?? DEFAULT_TETHER).stroke({ color, width: 1, alpha: 0.35 })
      g.circle(m.x, m.y, 5.5).fill({ color })
      if (m.color === 'generic') g.circle(m.x, m.y, 8).stroke({ color: 0xffffff, width: 1 })
      if (sel?.kind === 'mote' && sel.i === i) g.circle(m.x, m.y, 11).stroke({ color: SELECT_COLOR, width: 2 })
    })
  }

  private label(text: string, x: number, y: number, size: number, color: number): void {
    const t = new Text({ text, style: { fill: color, fontSize: size, fontFamily: 'sans-serif', fontWeight: 'bold' } })
    t.anchor.set(0.5)
    t.position.set(x, y)
    this.labels.addChild(t)
  }

  // ------------------------------------------------------------------
  // Tools
  // ------------------------------------------------------------------

  private hit(p: Vec2): NonNullable<EditorState['selection']> | null {
    const L = this.state.level
    for (let i = L.motes.length - 1; i >= 0; i--) if (Math.hypot(L.motes[i].x - p.x, L.motes[i].y - p.y) <= 9) return { kind: 'mote', i }
    for (let i = L.obstacles.length - 1; i >= 0; i--) {
      const o = L.obstacles[i]
      if (Math.hypot(o.x - p.x, o.y - p.y) <= (o.layers[0]?.radius ?? 20)) return { kind: 'obstacle', i }
    }
    for (let i = L.blockers.length - 1; i >= 0; i--) {
      const b = L.blockers[i]
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return { kind: 'blocker', i }
    }
    return null
  }

  private inField(p: Vec2): boolean {
    const f = this.state.level.field
    return p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h
  }

  private onDown(e: FederatedPointerEvent): void {
    const st = this.state
    if (!st.level) return
    const p = this.toWorld(e)
    switch (st.tool) {
      case 'select': {
        const ghostIdx = st.ghosts.findIndex((gh) => Math.hypot(gh.x - p.x, gh.y - p.y) < 12)
        if (e.altKey && ghostIdx >= 0) {
          st.ghosts.splice(ghostIdx, 1)
          st.emit()
          return
        }
        const h = this.hit(p)
        if (h) this.startMove(p, h)
        else if (ghostIdx >= 0) this.startGhostMove(p, ghostIdx)
        else st.select(null)
        return
      }
      case 'mote':
        if (!this.inField(p)) return
        st.change((L) => L.motes.push({ color: st.moteColor, x: p.x, y: p.y }))
        st.select({ kind: 'mote', i: st.level.motes.length - 1 })
        return
      case 'obstacle': {
        const z = OBSTACLE_ZONE
        const x = Math.max(z.x, Math.min(z.x + z.w, p.x))
        const y = Math.max(z.y, Math.min(z.y + z.h, p.y))
        st.change((L) => L.obstacles.push({ x, y, layers: [{ sides: 3, radius: 30, hp: 6 }] }))
        st.select({ kind: 'obstacle', i: st.level.obstacles.length - 1 })
        return
      }
      case 'blocker':
        if (!this.inField(p)) return
        this.drag = { kind: 'blocker', start: p }
        return
      case 'ghost': {
        const sel = st.selection
        const rune = sel?.kind === 'rune' ? sel.i : 0
        if (!st.level.hand[rune]) return
        const layer = Math.min(st.ghostLayer, st.level.hand[rune].layers.length - 1)
        st.ghosts.push({ rune, layer, x: p.x, y: p.y })
        st.emit()
        return
      }
    }
  }

  // Moves the hit entity by pointer delta, recording one history entry.
  private startMove(p: Vec2, h: NonNullable<EditorState['selection']>): void {
    const st = this.state
    st.select(h)
    const L = st.level
    const orig =
      h.kind === 'mote' ? { x: L.motes[h.i].x, y: L.motes[h.i].y } : h.kind === 'obstacle' ? { x: L.obstacles[h.i].x, y: L.obstacles[h.i].y } : { x: L.blockers[h.i].x, y: L.blockers[h.i].y }
    let begun = false
    this.drag = {
      kind: 'move',
      start: p,
      apply: (dx, dy) => {
        if (!begun) {
          if (Math.abs(dx) + Math.abs(dy) < 2) return
          st.beginDrag()
          begun = true
        }
        st.dragMove((lv) => {
          const target = h.kind === 'mote' ? lv.motes[h.i] : h.kind === 'obstacle' ? lv.obstacles[h.i] : lv.blockers[h.i]
          if (!target) return
          target.x = orig.x + dx
          target.y = orig.y + dy
        })
      },
    }
  }

  private startGhostMove(p: Vec2, idx: number): void {
    const gh = this.state.ghosts[idx]
    const orig = { x: gh.x, y: gh.y }
    this.drag = {
      kind: 'move',
      start: p,
      apply: (dx, dy) => {
        gh.x = orig.x + dx
        gh.y = orig.y + dy
        this.state.emit()
      },
    }
  }

  private onMove(e: FederatedPointerEvent): void {
    if (!this.drag) return
    const p = this.toWorld(e)
    if (this.drag.kind === 'move') {
      this.drag.apply(p.x - this.drag.start.x, p.y - this.drag.start.y)
    } else {
      const s = this.drag.start
      const f = this.state.level.field
      const x2 = Math.max(f.x, Math.min(f.x + f.w, p.x))
      const y2 = Math.max(f.y, Math.min(f.y + f.h, p.y))
      this.preview = { x: Math.min(s.x, x2), y: Math.min(s.y, y2), w: Math.abs(x2 - s.x), h: Math.abs(y2 - s.y) }
      this.render()
    }
  }

  private onUp(): void {
    const drag = this.drag
    this.drag = null
    if (drag?.kind === 'blocker' && this.preview && this.preview.w >= 4 && this.preview.h >= 4) {
      const r = this.preview
      this.state.change((L) => L.blockers.push(r))
      this.state.select({ kind: 'blocker', i: this.state.level.blockers.length - 1 })
    }
    this.preview = null
    this.render()
  }
}
