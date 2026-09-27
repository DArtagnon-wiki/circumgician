import { Graphics, type Application, type FederatedPointerEvent } from 'pixi.js'
import { createLayers, type Layers } from '../render/Layers'
import { ACCENT_COLOR, HUE_COLORS, INVALID_TINT, RUNE_BODY_COLOR, colorForMote } from '../render/Theme'
import { drawZoneBackground } from '../render/ZoneBackground'
import { ObstacleView } from '../render/ObstacleView'
import { MIDDLE_SCALE, RuneView } from '../render/RuneView'
import { MoteView } from '../render/MoteView'
import { Effects } from '../render/Effects'
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, computeFit } from './VirtualScreen'
import { Sim } from '../sim/Sim'
import { INVENTORY_ZONE, REACH } from '../sim/constants'
import { middleAngle, outerAngle, outerLayer } from '../sim/geometry'
import type { LevelData, Mote, Vec2 } from '../sim/types'
import type { DetonationInfo } from '../sim/events'
import { createDebugPanel, isDebugMode } from '../debug/DebugPanel'
import { createGameHud, type GameHud } from '../ui/GameHud'
import { Sfx } from '../audio/Sfx'

export interface GameSceneCallbacks {
  onWon: () => void
  onLost: () => void
  onMenu: () => void
}

interface DragState {
  runeId: string
  view: RuneView
  pos: Vec2
  liftY: number // touch drags hover the rune above the finger
  onMove: (e: FederatedPointerEvent) => void
  onEnd: (e: FederatedPointerEvent) => void
  onCancel: () => void
}

interface Flight {
  from: Vec2
  fromScale: number
  t: number
}

const FLY_HOME_TIME = 0.5
const RESULT_DELAY = 1.5
const REST_ANGLE = -Math.PI / 2
const TOUCH_LIFT = 56

// One instance per level attempt. The Sim owns all rules; this class only
// renders its state, turns input into sim actions and adds juice.
export class GameScene {
  layers!: Layers
  sim!: Sim
  private app!: Application
  private callbacks!: GameSceneCallbacks
  private runeViews = new Map<string, RuneView>()
  private obstacleViews = new Map<string, ObstacleView>()
  private moteViews = new Map<string, MoteView>()
  private lastMotePos = new Map<string, { pos: Vec2; color: string }>()
  private flights = new Map<string, Flight>()
  private pops = new Map<string, number>()
  private linkG = new Graphics()
  private effects!: Effects
  private drag: DragState | null = null
  private pendingResult: { kind: 'won' | 'lost'; wait: number } | null = null
  private mood = 1 // 1 = normal, drops toward 0.35 during the loss animation
  private showRings = false
  private sfx = new Sfx()
  private hud: GameHud | null = null
  private debugPanel: HTMLElement | null = null

  mount(app: Application, level: LevelData, callbacks: GameSceneCallbacks, seed = (Math.random() * 2 ** 32) >>> 0): void {
    this.app = app
    this.callbacks = callbacks
    this.layers = createLayers()
    this.app.stage.addChild(this.layers.root)
    this.layers.links.addChild(this.linkG)
    this.effects = new Effects(this.layers.effects)
    this.applyFit()

    this.sim = new Sim(level, { seed })
    this.layers.background.addChild(drawZoneBackground(level.field, level.blockers))
    this.bindSimEvents()
    this.rebuildViews()

    this.hud = createGameHud({
      onUndo: () => this.undo(),
      onRestart: () => this.restart(),
      onMenu: () => callbacks.onMenu(),
    })

    if (isDebugMode()) {
      this.debugPanel = createDebugPanel({
        forceDetonate: () => {
          for (const r of this.sim.state.runes) if (r.state === 'charging' || r.state === 'full') this.sim.detonate(r.id, true)
        },
        collapseObstacles: () => this.sim.debugCollapseAll(),
        toggleRings: () => (this.showRings = !this.showRings),
      })
    }
  }

  destroy(): void {
    this.cancelDrag()
    this.debugPanel?.remove()
    this.hud?.remove()
    this.sim.bus.all.clear()
    this.app.stage.removeChild(this.layers.root)
    this.layers.root.destroy({ children: true })
    this.sfx.close()
  }

  undo(): void {
    this.sfx.unlock()
    if (this.sim.undo()) this.sfx.undo()
  }

  restart(): void {
    this.sfx.unlock()
    this.sim.restart((Math.random() * 2 ** 32) >>> 0)
    this.sfx.undo()
  }

  relayout(): void {
    this.applyFit()
  }

  // ---------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------

  update(dt: number): void {
    dt = Math.min(dt, 1 / 20) // no giant steps after a background tab
    this.sim.step(dt)
    const s = this.sim.state

    if (this.pendingResult) {
      this.pendingResult.wait -= dt
      if (this.pendingResult.wait <= 0) {
        const kind = this.pendingResult.kind
        this.pendingResult = null
        if (kind === 'won') this.callbacks.onWon()
        else this.callbacks.onLost()
      }
    }
    const targetMood = s.status === 'lost' ? 0.35 : 1
    this.mood += (targetMood - this.mood) * Math.min(1, dt * 3)
    this.layers.runes.alpha = this.mood
    this.layers.obstacles.alpha = 0.4 + 0.6 * this.mood
    this.layers.motes.alpha = 0.3 + 0.7 * this.mood

    this.syncMotes(s.motes, s.time)
    for (const o of s.obstacles) this.obstacleViews.get(o.id)?.sync(o, dt, s.time)
    this.syncRunes(dt)
    this.drawLinks()
    this.effects.update(dt)
    this.applyFit()
    this.hud?.setUndoEnabled(this.sim.canUndo)
  }

  private syncMotes(motes: Mote[], time: number): void {
    const alive = new Set<string>()
    for (const m of motes) {
      alive.add(m.id)
      let view = this.moteViews.get(m.id)
      if (!view) {
        view = new MoteView()
        this.moteViews.set(m.id, view)
        this.layers.motes.addChild(view.graphic)
      }
      view.sync(m, time)
      this.lastMotePos.set(m.id, { pos: { ...m.pos }, color: m.color })
    }
    for (const [id, view] of this.moteViews) {
      if (alive.has(id)) continue
      view.graphic.destroy()
      this.moteViews.delete(id)
    }
  }

  private slotPosition(slot: number): Vec2 {
    const n = Math.max(1, this.sim.state.runes.length)
    return { x: ((slot + 0.5) / n) * VIRTUAL_WIDTH, y: INVENTORY_ZONE.y + INVENTORY_ZONE.h / 2 - 4 }
  }

  private iconScale(radius: number): number {
    const n = Math.max(1, this.sim.state.runes.length)
    const room = Math.min(44, VIRTUAL_WIDTH / n / 2 - 10)
    return Math.min(1, room / radius)
  }

  private syncRunes(dt: number): void {
    const s = this.sim.state
    const motes = new Map(s.motes.map((m) => [m.id, m]))
    for (const rune of s.runes) {
      const view = this.runeViews.get(rune.id)
      if (!view) continue
      const outer = outerLayer(rune)
      if (rune.state === 'spent' || !outer) {
        if (!this.flights.has(rune.id)) this.removeRuneView(rune.id)
        continue
      }

      let pos: Vec2
      let scale: number
      let oRot = REST_ANGLE
      let mRot = REST_ANGLE
      view.container.tint = 0xffffff

      if (this.drag?.runeId === rune.id) {
        pos = this.drag.pos
        scale = 1
        view.container.tint = this.sim.canPlace(rune.id, pos) ? 0xffffff : INVALID_TINT
      } else if (rune.pos && (rune.state === 'charging' || rune.state === 'full')) {
        pos = rune.pos
        oRot = outerAngle(rune, s.time)
        mRot = middleAngle(rune, s.time)
        let pop = this.pops.get(rune.id)
        if (pop !== undefined) {
          pop += dt / 0.3
          if (pop >= 1) this.pops.delete(rune.id)
          else this.pops.set(rune.id, pop)
        }
        scale = pop !== undefined && pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.12 : 1
        if (view.container.parent !== this.layers.runes) this.layers.runes.addChild(view.container)
      } else {
        const slot = this.slotPosition(rune.slot)
        const icon = this.iconScale(outer.radius)
        const flight = this.flights.get(rune.id)
        if (flight) {
          flight.t = Math.min(1, flight.t + dt / FLY_HOME_TIME)
          const e = 1 - Math.pow(1 - flight.t, 3)
          const arc = Math.sin(flight.t * Math.PI) * -40
          pos = { x: flight.from.x + (slot.x - flight.from.x) * e, y: flight.from.y + (slot.y - flight.from.y) * e + arc }
          // The middle "expands into the new outer" on the way home.
          const grow = Math.min(1, flight.t * 2.2)
          const peak = flight.fromScale + (1 - flight.fromScale) * grow
          scale = flight.t < 0.45 ? peak : peak + (icon - peak) * ((flight.t - 0.45) / 0.55)
          if (flight.t >= 1) this.flights.delete(rune.id)
        } else {
          pos = slot
          scale = icon
        }
      }
      view.container.position.set(pos.x, pos.y)
      view.body.scale.set(scale)
      view.sync(rune, oRot, mRot, s.time, motes)
    }
  }

  private drawLinks(): void {
    const g = this.linkG
    g.clear()
    const s = this.sim.state
    const obstacles = new Map(s.obstacles.map((o) => [o.id, o]))
    for (const rune of s.runes) {
      if (!rune.pos || !rune.linkedObstacleId) continue
      const o = obstacles.get(rune.linkedObstacleId)
      if (!o) continue
      const full = rune.state === 'full'
      const pulse = full ? 0.5 + 0.5 * Math.sin(s.time * 6) : 0
      g.moveTo(rune.pos.x, rune.pos.y).lineTo(o.pos.x, o.pos.y).stroke({ color: ACCENT_COLOR, width: full ? 3 + pulse * 2 : 2, alpha: full ? 0.45 + pulse * 0.3 : 0.28 })
    }
    if (this.drag) {
      const target = this.sim.previewLink(this.drag.runeId, this.drag.pos)
      const ok = this.sim.canPlace(this.drag.runeId, this.drag.pos)
      if (target) g.moveTo(this.drag.pos.x, this.drag.pos.y).lineTo(target.pos.x, target.pos.y).stroke({ color: ok ? ACCENT_COLOR : INVALID_TINT, width: 2, alpha: 0.5 })
    }
    if (this.showRings) {
      for (const rune of s.runes) {
        const outer = outerLayer(rune)
        if (!rune.pos || !outer) continue
        g.circle(rune.pos.x, rune.pos.y, outer.radius + REACH).stroke({ color: 0x7cffb2, width: 1, alpha: 0.5 })
        g.circle(rune.pos.x, rune.pos.y, Math.max(1, outer.radius - REACH)).stroke({ color: 0x7cffb2, width: 1, alpha: 0.5 })
      }
    }
  }

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------

  private rebuildViews(): void {
    this.cancelDrag()
    for (const id of [...this.runeViews.keys()]) this.removeRuneView(id)
    for (const v of this.obstacleViews.values()) v.container.destroy({ children: true })
    for (const v of this.moteViews.values()) v.graphic.destroy()
    this.obstacleViews.clear()
    this.moteViews.clear()
    this.flights.clear()
    this.pops.clear()
    this.effects.clear()
    this.pendingResult = null

    const s = this.sim.state
    for (const o of s.obstacles) {
      const view = new ObstacleView(o)
      this.obstacleViews.set(o.id, view)
      this.layers.obstacles.addChild(view.container)
    }
    for (const r of s.runes) {
      if (r.state === 'spent') continue
      const view = new RuneView(r)
      view.container.on('pointerdown', (e) => this.onRunePointerDown(r.id, e))
      this.runeViews.set(r.id, view)
      this.layers.runes.addChild(view.container)
    }
  }

  private removeRuneView(id: string): void {
    const view = this.runeViews.get(id)
    if (!view) return
    view.container.destroy({ children: true })
    this.runeViews.delete(id)
  }

  // ---------------------------------------------------------------------
  // Sim events -> juice
  // ---------------------------------------------------------------------

  private bindSimEvents(): void {
    const bus = this.sim.bus
    bus.on('rune:placed', ({ rune }) => {
      this.pops.set(rune.id, 0)
      this.effects.ring(rune.pos!, RUNE_BODY_COLOR, 20, outerLayer(rune)!.radius + 20, 0.35, 2)
      this.sfx.place()
    })
    bus.on('mote:held', () => this.sfx.nodeFilled())
    bus.on('rune:full', ({ rune }) => {
      this.effects.ring(rune.pos!, ACCENT_COLOR, outerLayer(rune)!.radius, outerLayer(rune)!.radius + 26, 0.45, 2)
      this.sfx.ready()
    })
    bus.on('rune:detonated', ({ rune, info }) => this.onDetonated(rune.id, rune.state === 'spent', info))
    bus.on('obstacle:damaged', ({ obstacle }) => this.obstacleViews.get(obstacle.id)?.hit())
    bus.on('obstacle:collapsed', ({ obstacle, previous, cleared }) => {
      this.effects.shatter(obstacle.pos, previous.sides, previous.radius, -Math.PI / 2, 0xffffff, 3)
      this.effects.sparks(obstacle.pos, 0xd8c8ff, cleared ? 22 : 12, cleared ? 220 : 140)
      this.effects.ring(obstacle.pos, 0xffffff, previous.radius, previous.radius + (cleared ? 90 : 50), 0.5, 4)
      this.effects.addShake(cleared ? 10 : 7)
      this.sfx.obstacleCleared(cleared)
    })
    bus.on('sim:won', () => {
      this.pendingResult = { kind: 'won', wait: RESULT_DELAY }
      const hues = Object.values(HUE_COLORS)
      hues.forEach((c, i) => this.effects.ring({ x: 200, y: 450 }, c, 20 + i * 8, 260 + i * 30, 1.2, 3))
      this.effects.addShake(6)
      this.sfx.win()
    })
    bus.on('sim:lost', () => {
      this.pendingResult = { kind: 'lost', wait: RESULT_DELAY }
      this.effects.flash(0x8a0f2a, 0.35, 1.4, { x: 0, y: 0, w: VIRTUAL_WIDTH, h: VIRTUAL_HEIGHT })
      for (const r of this.sim.state.runes) {
        const outer = outerLayer(r)
        if (r.pos && outer) this.effects.ring(r.pos, 0x6d6480, outer.radius, outer.radius * 0.4, 1.2, 3)
      }
      this.sfx.lose()
    })
    bus.on('sim:restored', () => {
      this.mood = Math.max(this.mood, 0.6)
      this.rebuildViews()
    })
  }

  private onDetonated(runeId: string, spent: boolean, info: DetonationInfo): void {
    const { pos, outer } = info
    this.effects.shatter(pos, outer.sides, outer.radius, info.outerAngle, RUNE_BODY_COLOR, 3.5)
    this.effects.ring(pos, 0xffffff, outer.radius * 0.5, outer.radius + 50, 0.45, 4)
    for (const id of info.annihilated) {
      const last = this.lastMotePos.get(id)
      if (!last) continue
      this.effects.ring(last.pos, 0xff2266, 16, 2, 0.4, 3)
      this.effects.sparks(last.pos, 0x3a0014, 6, 60)
    }
    for (const id of info.released) {
      const m = this.sim.state.motes.find((mm) => mm.id === id)
      if (m) this.effects.sparks(m.pos, colorForMote(m.color), 3, 90)
    }
    if (info.obstacleId) {
      const o = this.sim.state.obstacles.find((oo) => oo.id === info.obstacleId)
      if (o) this.bolt(pos, o.pos)
      this.effects.addShake(5 + info.damage)
    } else {
      this.effects.addShake(3)
    }
    if (spent) {
      if (info.middle === undefined) this.effects.sparks(pos, 0x6d6480, 10, 80)
    } else {
      const rune = this.sim.rune(runeId)!
      const newOuter = outerLayer(rune)!
      this.flights.set(runeId, { from: { ...pos }, fromScale: (MIDDLE_SCALE * outer.radius) / newOuter.radius, t: 0 })
    }
    this.sfx.detonate(info.damage > 0)
  }

  // A jagged arc of light from the rune to the obstacle it hits.
  private bolt(from: Vec2, to: Vec2): void {
    const segs = 9
    const pts: Vec2[] = []
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const j = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * 22
      const nx = -(to.y - from.y)
      const ny = to.x - from.x
      const len = Math.hypot(nx, ny) || 1
      pts.push({ x: from.x + (to.x - from.x) * t + (nx / len) * j, y: from.y + (to.y - from.y) * t + (ny / len) * j })
    }
    let life = 0
    const g = new Graphics()
    this.layers.effects.addChild(g)
    this.effects.add((dt) => {
      life += dt / 0.3
      g.clear()
      if (life >= 1) {
        g.destroy()
        return false
      }
      g.poly(pts.flatMap((p) => [p.x, p.y]), false).stroke({ color: 0xffffff, width: 4 * (1 - life), alpha: 1 - life })
      g.poly(pts.flatMap((p) => [p.x, p.y]), false).stroke({ color: 0xb89cff, width: 10 * (1 - life), alpha: 0.3 * (1 - life) })
      return true
    })
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------

  private onRunePointerDown(runeId: string, e: FederatedPointerEvent): void {
    this.sfx.unlock() // must run inside a real gesture for iOS Safari
    const rune = this.sim.rune(runeId)
    if (!rune || this.sim.state.status !== 'playing') return
    if (rune.state === 'full') {
      this.sim.detonate(runeId)
    } else if (rune.state === 'idle' && !this.drag && !this.flights.has(runeId)) {
      this.beginDrag(runeId, e)
    } else if (rune.state === 'charging') {
      this.sfx.notReady()
    }
  }

  private beginDrag(runeId: string, e: FederatedPointerEvent): void {
    const view = this.runeViews.get(runeId)
    if (!view) return
    const liftY = e.pointerType === 'touch' ? TOUCH_LIFT : 0
    const onMove = (ev: FederatedPointerEvent) => {
      if (this.drag) this.drag.pos = this.pointerPos(ev, liftY)
    }
    const onEnd = (ev: FederatedPointerEvent) => this.endDrag(ev)
    const onCancel = () => this.cancelDrag()
    this.drag = { runeId, view, pos: this.pointerPos(e, liftY), liftY, onMove, onEnd, onCancel }
    // globalpointermove fires regardless of hit-testing; pointerupoutside
    // catches releases elsewhere; pointercancel covers OS interruptions.
    view.container.on('globalpointermove', onMove)
    view.container.on('pointerup', onEnd)
    view.container.on('pointerupoutside', onEnd)
    view.container.on('pointercancel', onCancel)
    this.layers.drag.addChild(view.container)
    this.sfx.pickUp()
  }

  private pointerPos(e: FederatedPointerEvent, liftY: number): Vec2 {
    const p = this.layers.root.toLocal(e.global)
    return { x: p.x, y: p.y - liftY }
  }

  private endDrag(e: FederatedPointerEvent): void {
    const drag = this.drag
    if (!drag) return
    const pos = this.pointerPos(e, drag.liftY)
    this.detachDrag()
    if (!this.sim.place(drag.runeId, pos)) {
      this.flights.set(drag.runeId, { from: pos, fromScale: 1, t: 0.3 })
      this.layers.runes.addChild(drag.view.container)
      this.sfx.notReady()
    }
  }

  private cancelDrag(): void {
    const drag = this.drag
    if (!drag) return
    this.detachDrag()
    this.flights.set(drag.runeId, { from: drag.pos, fromScale: 1, t: 0.3 })
    this.layers.runes.addChild(drag.view.container)
  }

  private detachDrag(): void {
    if (!this.drag) return
    const { view, onMove, onEnd, onCancel } = this.drag
    view.container.off('globalpointermove', onMove)
    view.container.off('pointerup', onEnd)
    view.container.off('pointerupoutside', onEnd)
    view.container.off('pointercancel', onCancel)
    if (!view.container.destroyed && view.container.parent === this.layers.drag) this.layers.runes.addChild(view.container)
    this.drag = null
  }

  // ---------------------------------------------------------------------
  // Fit
  // ---------------------------------------------------------------------

  private applyFit(): void {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-bottom')
    const fit = computeFit(window.innerWidth, window.innerHeight, parseFloat(raw) || 0)
    const sx = this.effects?.shake ? (Math.random() - 0.5) * this.effects.shake : 0
    const sy = this.effects?.shake ? (Math.random() - 0.5) * this.effects.shake : 0
    this.layers.root.scale.set(fit.scale)
    this.layers.root.position.set(fit.offsetX + sx * fit.scale, fit.offsetY + sy * fit.scale)
  }
}
