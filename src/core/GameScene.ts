import { Graphics, Point, type Application, type FederatedPointerEvent } from 'pixi.js'
import { createLayers, type Layers } from '../render/Layers'
import { ACCENT_COLOR, HUE_COLORS, INVALID_TINT, RUNE_BODY_COLOR, colorForMote, lighten } from '../render/Theme'
import { ZoneBackground } from '../render/ZoneBackground'
import { ObstacleView } from '../render/ObstacleView'
import { MIDDLE_SCALE, RuneView } from '../render/RuneView'
import { MoteView, createMoteLayers, type MoteLayers } from '../render/MoteView'
import { SmokeSystem } from '../render/SmokeSystem'
import { LinkThreads, type Link } from '../render/LinkThreads'
import { Effects } from '../render/Effects'
import { detonationTiming, playDetonation } from '../render/Detonation'
import { governor, quality, type Tier } from '../render/Quality'
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, computeFit } from './VirtualScreen'
import { Sim } from '../sim/Sim'
import { ensureEndlessLayers } from '../sim/endless'
import { INVENTORY_ZONE, REACH } from '../sim/constants'
import { middleAngle, outerAngle, outerLayer } from '../sim/geometry'
import type { LevelData, Mote, Vec2 } from '../sim/types'
import type { DetonationInfo } from '../sim/events'
import { createDebugPanel, isDebugMode } from '../debug/DebugPanel'
import { createGameHud, type GameHud } from '../ui/GameHud'
import type { Recap } from '../ui/HUD'
import { Sfx } from '../audio/Sfx'

export interface GameSceneCallbacks {
  onWon: () => void
  onLost: () => void
  onMenu: () => void
  onRestart?: () => void // endless: a fresh run instead of a board reset
}

export interface GameSceneOptions {
  seed?: number
  endless?: boolean // one life: no undo, stacks generated forever, score shown
}

interface DragState {
  runeId: string
  view: RuneView
  pos: Vec2
  liftY: number // touch drags hover the rune above the finger
  onMove: (e: PointerEvent) => void
  onEnd: (e: PointerEvent) => void
  onCancel: (e: PointerEvent) => void
}

interface Flight {
  from: Vec2
  fromScale: number
  t: number
  delay?: number // seconds to linger at `from` first (a detonation's burst)
}

const FLY_HOME_TIME = 0.5
const RESULT_DELAY = 1.5
const REST_ANGLE = -Math.PI / 2
const TOUCH_LIFT = 56
const KICK_TOUCH_RADIUS = 26 // fingers are blunt
const KICK_MOUSE_RADIUS = 16

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
  // Obstacles hit by the action being resolved right now, with the delay
  // until each one's orb lands (sim events fire synchronously; cleared
  // every frame).
  private impacts = new Map<string, number>()
  private flights = new Map<string, Flight>()
  private pops = new Map<string, number>()
  private links = new LinkThreads()
  private effects!: Effects
  private smoke!: SmokeSystem
  private moteLayers!: MoteLayers
  private zoneBg!: ZoneBackground
  private clock = 0 // monotonic scene time for decoration (sim time rewinds on undo)
  private drag: DragState | null = null
  private pendingResult: { kind: 'won' | 'lost'; wait: number } | null = null
  private mood = 1 // 1 = normal, drops toward 0.35 during the loss animation
  private showRings = false
  private sfx = new Sfx()
  private hud: GameHud | null = null
  private debugPanel: HTMLElement | null = null
  private endless = false
  // For the result screen. Unlike the board's own stats, these survive undo.
  private session = { time: 0, kicks: 0, undos: 0 }

  mount(app: Application, level: LevelData, callbacks: GameSceneCallbacks, opts: GameSceneOptions = {}): void {
    this.app = app
    this.callbacks = callbacks
    this.endless = !!opts.endless
    this.layers = createLayers()
    this.app.stage.addChild(this.layers.root)
    this.layers.links.addChild(this.links.container)
    this.smoke = new SmokeSystem()
    this.moteLayers = createMoteLayers()
    this.layers.motes.addChild(this.smoke.container, this.moteLayers.halos, this.moteLayers.bodies, this.moteLayers.hearts)
    this.effects = new Effects(this.layers.effects)
    this.applyFit()

    const seed = opts.seed ?? (Math.random() * 2 ** 32) >>> 0
    this.sim = new Sim(level, { seed, ensureLayers: opts.endless ? ensureEndlessLayers : undefined })
    this.zoneBg = new ZoneBackground(level.field, level.blockers)
    this.layers.background.addChild(this.zoneBg.container)
    this.applyQuality()
    this.bindSimEvents()
    this.rebuildViews()

    // Taps that miss every rune land on this invisible backdrop and kick the
    // nearest free mote. (A hitArea on the root container would short-circuit
    // hit-testing of the runes inside it, so the backdrop is a sibling.)
    const backdrop = new Graphics().rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({ color: 0x000000, alpha: 0.001 })
    backdrop.eventMode = 'static'
    backdrop.on('pointerdown', (e) => this.onBoardPointerDown(e))
    this.layers.background.addChildAt(backdrop, 0)

    this.hud = createGameHud({
      onUndo: opts.endless ? undefined : () => this.undo(),
      onRestart: () => (callbacks.onRestart ? callbacks.onRestart() : this.restart()),
      onMenu: () => callbacks.onMenu(),
      showScore: opts.endless,
    })

    if (isDebugMode()) {
      this.debugPanel = createDebugPanel({
        forceDetonate: () => {
          for (const r of this.sim.state.runes) if (r.state === 'charging' || r.state === 'full') this.sim.detonate(r.id, true)
        },
        collapseObstacles: () => this.sim.debugCollapseAll(),
        toggleRings: () => (this.showRings = !this.showRings),
        cycleTier: () => {
          // auto -> 2 -> 1 -> 0 -> auto
          const next: Tier | null = governor.pinned === null ? 2 : governor.pinned === 0 ? null : ((governor.pinned - 1) as Tier)
          governor.pin(next)
          return next === null ? 'Detail: auto' : `Detail: ${next} (pinned)`
        },
        stats: () => `tier ${quality.tier}${governor.pinned === null ? '' : ' pinned'} · ${governor.fps.toFixed(0)} fps (${governor.avgMs.toFixed(1)} ms) · ${this.smoke.live} puffs`,
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
  }

  undo(): void {
    this.sfx.unlock()
    if (this.sim.undo()) {
      this.session.undos++
      this.sfx.undo()
    }
  }

  restart(): void {
    this.sfx.unlock()
    this.sim.restart((Math.random() * 2 ** 32) >>> 0)
    this.session = { time: 0, kicks: 0, undos: 0 }
    this.sfx.undo()
  }

  // The result screen's numbers: the board's stats for the line that ended
  // here, plus what the player did along the way.
  recap(): Recap {
    const s = this.sim.state
    let strengthLeft = 0
    // Endless stacks never end, so only a curated level has a total.
    if (!this.endless) for (const o of s.obstacles) if (!o.cleared) strengthLeft += o.layers.slice(o.index + 1).reduce((hp, l) => hp + l.hp, o.hp)
    return { ...s.stats, ...this.session, strengthLeft, lostBecause: s.lostBecause }
  }

  relayout(): void {
    this.applyFit()
  }

  // Detail for the current quality tier (the governor calls through the
  // shell when it changes; views read the glows flag themselves).
  applyQuality(): void {
    const q = quality.settings
    this.smoke.rate = q.smokeRate
    this.smoke.cap = q.smokeCap
    this.zoneBg.setStarCount(q.stars)
  }

  // ---------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------

  update(dt: number): void {
    dt = Math.min(dt, 1 / 20) // no giant steps after a background tab
    this.clock += dt
    this.impacts.clear()
    this.sim.step(dt)
    const s = this.sim.state
    if (s.status === 'playing') this.session.time += dt

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

    this.zoneBg.update(dt, this.clock)
    this.syncMotes(s.motes, dt, s.time)
    this.smoke.update(dt)
    for (const o of s.obstacles) this.obstacleViews.get(o.id)?.sync(o, dt, s.time)
    this.syncRunes(dt)
    this.drawLinks()
    this.effects.update(dt)
    this.applyFit()
    this.hud?.setUndoEnabled(this.sim.canUndo)
    this.hud?.setScore(s.score, s.broken)
  }

  private syncMotes(motes: Mote[], dt: number, time: number): void {
    const alive = new Set<string>()
    for (const m of motes) {
      alive.add(m.id)
      let view = this.moteViews.get(m.id)
      if (!view) {
        view = new MoteView(this.smoke, this.moteLayers)
        this.moteViews.set(m.id, view)
      }
      view.sync(m, dt, time)
    }
    for (const [id, view] of this.moteViews) {
      if (alive.has(id)) continue
      view.destroy()
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
        if (flight?.delay && flight.delay > 0) {
          flight.delay -= dt
          pos = flight.from
          scale = flight.fromScale
        } else if (flight) {
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
      // Tap area matches what is drawn; inventory icons never overlap.
      let hitR = outer.radius * scale + 10
      if (rune.state === 'idle' && this.drag?.runeId !== rune.id) {
        hitR = Math.min(hitR, VIRTUAL_WIDTH / Math.max(1, s.runes.length) / 2 - 4)
      }
      view.setHitRadius(hitR)
      view.sync(rune, oRot, mRot, s.time, dt, motes)
    }
  }

  private drawLinks(): void {
    const s = this.sim.state
    const obstacles = new Map(s.obstacles.map((o) => [o.id, o]))
    const list: Link[] = []
    for (const rune of s.runes) {
      if (!rune.pos || !rune.linkedObstacleId) continue
      const o = obstacles.get(rune.linkedObstacleId)
      if (o) list.push({ from: rune.pos, to: o.pos, full: rune.state === 'full' })
    }
    if (this.drag) {
      const target = this.sim.previewLink(this.drag.runeId, this.drag.pos)
      const ok = this.sim.canPlace(this.drag.runeId, this.drag.pos)
      if (target) list.push({ from: this.drag.pos, to: target.pos, preview: true, invalid: !ok })
    }
    this.links.draw(list, this.clock)
    const g = this.links.g
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
    for (const v of this.moteViews.values()) v.destroy()
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
    bus.on('mote:held', ({ rune }) => {
      const motes = this.sim.state.motes
      this.sfx.nodeFilled(rune.held.filter((id) => id !== null && motes.find((m) => m.id === id)?.state === 'held').length)
    })
    bus.on('rune:full', ({ rune }) => {
      this.effects.ring(rune.pos!, ACCENT_COLOR, outerLayer(rune)!.radius, outerLayer(rune)!.radius + 26, 0.45, 2)
      this.sfx.full()
    })
    bus.on('rune:detonated', ({ rune, info }) => this.onDetonated(rune.id, rune.state === 'spent', info))
    // Damage lands when the detonation's orb does (the view holds the
    // obstacle until then); a debug collapse has no orb and lands at once.
    bus.on('obstacle:damaged', ({ obstacle }) => {
      this.effects.after(this.impacts.get(obstacle.id) ?? 0, () => this.obstacleViews.get(obstacle.id)?.hit())
    })
    bus.on('obstacle:collapsed', ({ obstacle, previous, cleared }) => {
      const pos = { ...obstacle.pos }
      this.effects.after(this.impacts.get(obstacle.id) ?? 0, () => {
        this.effects.obsidianShatter(pos, previous.radius, cleared)
        this.effects.ring(pos, 0xcdb8ff, previous.radius, previous.radius + (cleared ? 90 : 50), 0.5, 2)
        this.effects.addShake(cleared ? 10 : 7)
        this.sfx.obstacleCleared(cleared)
      })
    })
    bus.on('sim:won', () => {
      const delay = this.latestImpact()
      this.pendingResult = { kind: 'won', wait: RESULT_DELAY + delay }
      this.effects.after(delay, () => {
        const hues = Object.values(HUE_COLORS)
        hues.forEach((c, i) => this.effects.ring({ x: 200, y: 450 }, c, 20 + i * 8, 260 + i * 30, 1.2, 3))
        this.effects.addShake(6)
        this.sfx.win()
      })
    })
    bus.on('sim:lost', () => {
      const delay = this.latestImpact()
      this.pendingResult = { kind: 'lost', wait: RESULT_DELAY + delay }
      this.effects.after(delay, () => {
        this.effects.flash(0x8a0f2a, 0.35, 1.4, { x: 0, y: 0, w: VIRTUAL_WIDTH, h: VIRTUAL_HEIGHT })
        for (const r of this.sim.state.runes) {
          const outer = outerLayer(r)
          if (r.pos && outer) this.effects.ring(r.pos, 0x6d6480, outer.radius, outer.radius * 0.4, 1.2, 3)
        }
        this.sfx.lose()
      })
    })
    bus.on('sim:restored', () => {
      this.mood = Math.max(this.mood, 0.6)
      this.rebuildViews()
    })
  }

  private latestImpact(): number {
    let d = 0
    for (const v of this.impacts.values()) d = Math.max(d, v)
    return d
  }

  private onDetonated(runeId: string, spent: boolean, info: DetonationInfo): void {
    const { pos, outer } = info
    // Fires before the sim damages the obstacle, so it still shows the
    // state to hold on screen until the orb lands.
    const target = info.obstacleId ? this.sim.state.obstacles.find((o) => o.id === info.obstacleId) : undefined
    const timing = detonationTiming(pos, target?.pos ?? null)
    if (target) {
      this.impacts.set(target.id, timing.impact)
      this.obstacleViews.get(target.id)?.hold(timing.impact, target.index, target.hp)
      this.effects.after(timing.impact, () => this.effects.addShake(5 + info.damage))
    } else {
      this.effects.after(timing.launch, () => this.effects.addShake(3))
    }
    playDetonation(this.effects, this.smoke, {
      pos,
      sides: outer.sides,
      radius: outer.radius,
      angle: info.outerAngle,
      liquids: this.runeViews.get(runeId)?.liquids(pos, outer, info.outerAngle) ?? [],
      releases: outer.nodes.map((n) => n.release),
      target: target ? { ...target.pos } : null,
    })
    if (!spent) {
      // What's left of the rune lingers through the burst, then flies home.
      const rune = this.sim.rune(runeId)!
      const newOuter = outerLayer(rune)!
      this.flights.set(runeId, { from: { ...pos }, fromScale: (MIDDLE_SCALE * outer.radius) / newOuter.radius, t: 0, delay: timing.launch })
    }
    this.sfx.detonate(timing.launch, target ? timing.impact : null)
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------

  // Returns whether a mote was kicked.
  private onBoardPointerDown(e: FederatedPointerEvent): boolean {
    this.sfx.unlock()
    if (this.drag || this.sim.state.status !== 'playing') return false
    const p = this.layers.root.toLocal(e.global)
    let best: Mote | null = null
    let bestD = e.pointerType === 'touch' ? KICK_TOUCH_RADIUS : KICK_MOUSE_RADIUS
    for (const m of this.sim.state.motes) {
      if (m.state !== 'free') continue
      const d = Math.hypot(m.pos.x - p.x, m.pos.y - p.y)
      if (d < bestD) {
        bestD = d
        best = m
      }
    }
    if (best && this.sim.kick(best.id, { x: p.x, y: p.y })) {
      this.session.kicks++
      const v = best.vel ?? { x: 0, y: 0 }
      this.moteViews.get(best.id)?.burst(best.pos.x, best.pos.y, lighten(colorForMote(best.color), 0.12), best.color === 'generic', 5, v.x * 0.25, v.y * 0.25)
      this.effects.ring(best.pos, colorForMote(best.color), 6, 22, 0.25, 1.5)
      this.sfx.kick()
      return true
    }
    return false
  }

  private onRunePointerDown(runeId: string, e: FederatedPointerEvent): void {
    this.sfx.unlock() // must run inside a real gesture for iOS Safari
    const rune = this.sim.rune(runeId)
    if (!rune || this.sim.state.status !== 'playing') return
    if (rune.state === 'full') {
      this.sim.detonate(runeId)
    } else if (rune.state === 'idle' && !this.drag && !this.flights.has(runeId)) {
      this.beginDrag(runeId, e)
    } else if (rune.state === 'charging') {
      // A charging rune has nothing to do on tap, so the tap falls through to
      // kicking a mote under the finger (motes near a rune stay reachable).
      if (!this.onBoardPointerDown(e)) this.sfx.notReady()
    }
  }

  // Drag tracking uses window-level DOM pointer events, not Pixi per-object
  // events: on touch the rune hovers above the finger (so release is never
  // "over" it) and it is reparented mid-press, which made Pixi drop the
  // release on iPhone and leave the rune stuck until a second drag.
  private beginDrag(runeId: string, e: FederatedPointerEvent): void {
    const view = this.runeViews.get(runeId)
    if (!view) return
    const liftY = e.pointerType === 'touch' ? TOUCH_LIFT : 0
    const pointerId = e.pointerId
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId && this.drag) this.drag.pos = this.clientToVirtual(ev, liftY)
    }
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) this.endDrag(this.clientToVirtual(ev, liftY))
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) this.cancelDrag()
    }
    const g = this.layers.root.toLocal(e.global)
    this.drag = { runeId, view, pos: { x: g.x, y: g.y - liftY }, liftY, onMove, onEnd, onCancel }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onCancel)
    this.layers.drag.addChild(view.container)
    this.sfx.pickUp()
  }

  private clientToVirtual(ev: PointerEvent, liftY: number): Vec2 {
    const global = new Point()
    this.app.renderer.events.mapPositionToPoint(global, ev.clientX, ev.clientY)
    const p = this.layers.root.toLocal(global)
    return { x: p.x, y: p.y - liftY }
  }

  private endDrag(pos: Vec2): void {
    const drag = this.drag
    if (!drag) return
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
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onEnd)
    window.removeEventListener('pointercancel', onCancel)
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
