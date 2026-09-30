import { Graphics, Point, type Application, type FederatedPointerEvent } from 'pixi.js'
import { createLayers, type Layers } from '../render/Layers'
import { ACCENT_COLOR, INVALID_TINT, RUNE_BODY_COLOR, activePalette, colorForMote, hueColor, hueName, lighten, usePalette } from '../render/Theme'
import { ZoneBackground } from '../render/ZoneBackground'
import { ObstacleView } from '../render/ObstacleView'
import { BOWL_MIN, BOWL_R, MIDDLE_SCALE, RuneView, fuseTip, handLook, pieceLook } from '../render/RuneView'
import { MoteView, createMoteLayers, type MoteLayers } from '../render/MoteView'
import { SmokeSystem } from '../render/SmokeSystem'
import { LinkThreads, type Link } from '../render/LinkThreads'
import { Effects } from '../render/Effects'
import { LAUNCH, detonationTiming, playDetonation } from '../render/Detonation'
import { FROST, freezeBurst, frostStreak, iceShatter } from '../render/Frost'
import { burnUp, fuseSpark } from '../render/Fire'
import { textures } from '../render/textures'
import { governor, quality, type Tier } from '../render/Quality'
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, computeFit } from './VirtualScreen'
import { handLayout, iconRadius, type HandLayout } from './handLayout'
import { Sim } from '../sim/Sim'
import { ENDLESS_TUNING, ensureEndlessLayers } from '../sim/endless'
import { EJECT_TIME, FLICK_GAIN, MOTE_FRICTION, REACH, THAW_LAG } from '../sim/constants'
import { middleAngle, outerAngle, outerLayer } from '../sim/geometry'
import { partnerOf, shieldPull, upShields } from '../sim/rules'
import type { Hue, LevelData, Mote, Obstacle, Piece, Rune, RuneLayerSpec, Vec2 } from '../sim/types'
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

// A touch on the board, followed until it lifts: a swipe flicks a mote
// along it, a tap shoves the nearest one away from the finger.
interface Gesture {
  pointerId: number
  moteId: string | null // the free mote nearest where it began, if one was close
  onPiece: boolean // began on a charging piece (a tap there that moves nothing is "not ready")
  start: Sample
  samples: Sample[] // the most recent positions
  onMove: (e: PointerEvent) => void
  onEnd: (e: PointerEvent) => void
  onCancel: (e: PointerEvent) => void
}

interface Sample {
  t: number // seconds
  x: number
  y: number
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
const GRAB_TOUCH_RADIUS = 34 // fingers are blunt
const GRAB_MOUSE_RADIUS = 22
const TAP_SLOP = 6 // px a touch may wander and still be a tap
const FLICK_WINDOW = 0.1 // s: the end of a swipe sets its speed
const NO_MOTES = new Map<string, Mote>()
const FROST_BACK = 0.3 // frost racing back from a frost layer to the piece it bites
const STASIS_RING = 0xc9d4ff // a piece latching into stasis

// One instance per level attempt. The Sim owns all rules; this class only
// renders its state, turns input into sim actions and adds juice.
export class GameScene {
  layers!: Layers
  sim!: Sim
  private app!: Application
  private callbacks!: GameSceneCallbacks
  private handViews = new Map<string, RuneView>() // by rune id
  private pieceViews = new Map<string, RuneView>() // by piece id
  private obstacleViews = new Map<string, ObstacleView>()
  private moteViews = new Map<string, MoteView>()
  // Obstacles hit by the action being resolved right now, with the delay
  // until each one's orb lands (sim events fire synchronously; cleared
  // every frame).
  private impacts = new Map<string, number>()
  private discoveries = 0 // new hues announced for the detonation in progress
  private veiled = new Set<string>() // motes of a frostbitten piece, hidden until its ice forms
  private flights = new Map<string, Flight>()
  private layout: HandLayout | null = null
  private largestRune = 1 // the biggest layer any rune will show in hand (icons size against it)
  private pops = new Map<string, number>()
  private sparks = new Map<string, number>() // per burning piece: time until its fuse throws the next spark
  private lowFuses = new Set<string>() // burning pieces whose fuse has already sizzled low
  private links = new LinkThreads()
  private effects!: Effects
  private smoke!: SmokeSystem
  private moteLayers!: MoteLayers
  private zoneBg!: ZoneBackground
  private clock = 0 // monotonic scene time for decoration (sim time rewinds on undo)
  private drag: DragState | null = null
  private gesture: Gesture | null = null
  private pendingResult: { kind: 'won' | 'lost'; wait: number } | null = null
  private mood = 1 // 1 = normal, drops toward 0.35 during the loss animation
  private viewing = false // the result card is set aside to study the board
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
    // Every color drawn from here on is the level's palette's.
    const palette = usePalette(level.palette)

    const seed = opts.seed ?? (Math.random() * 2 ** 32) >>> 0
    this.sim = new Sim(level, {
      seed,
      ensureLayers: opts.endless ? ensureEndlessLayers : undefined,
      fuse: opts.endless ? ENDLESS_TUNING.fuse : undefined,
    })
    // A stack's final entry is never cast, so it never shows as an outer layer.
    this.largestRune = Math.max(1, ...level.hand.flatMap((r) => r.layers.slice(0, -1).map((l) => l.radius)))
    this.zoneBg = new ZoneBackground(level.field, level.blockers, palette.sky)
    this.layers.background.addChild(this.zoneBg.container)
    this.applyQuality()
    this.bindSimEvents()
    this.rebuildViews()

    // Touches that miss every rune land on this invisible backdrop, where a
    // swipe flicks a mote. (A hitArea on the root container would short-circuit
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
          for (const p of [...this.sim.state.pieces]) this.sim.detonate(p.id, true)
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
    this.detachGesture()
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

  // The result card set aside (or back): a lost board shows at full
  // strength while it is studied.
  setViewing(viewing: boolean): void {
    this.viewing = viewing
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
    if (!this.endless) for (const o of s.obstacles) if (!o.cleared && !o.frozen) strengthLeft += o.layers.slice(o.index + 1).reduce((hp, l) => hp + l.hp, o.hp)
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
    const targetMood = s.status === 'lost' && !this.viewing ? 0.35 : 1
    this.mood += (targetMood - this.mood) * Math.min(1, dt * 3)
    this.layers.runes.alpha = this.mood
    this.layers.obstacles.alpha = 0.4 + 0.6 * this.mood
    this.layers.motes.alpha = 0.3 + 0.7 * this.mood

    this.zoneBg.update(dt, this.clock)
    this.syncMotes(s.motes, dt, s.time)
    this.smoke.update(dt)
    for (const o of s.obstacles) {
      const view = this.obstacleViews.get(o.id)
      if (!view) continue
      // A two-shape layer lights the shapes whose places are held in stasis.
      const held = s.pieces.filter((p) => p.stasis !== undefined && p.linkedObstacleId === o.id).map((p) => p.energy.sides)
      view.setEngaged(held, held.length > 1)
      // Its shields, and how far their pullers have them.
      const shields = o.layers[o.index]?.shields ?? []
      view.setShields(
        o.index,
        shields.map((sh, i) => ({ color: hueColor(sh.color), strength: sh.strength, pull: shieldPull(s, o, sh.color), down: !!o.down?.includes(i) })),
      )
      view.sync(o, dt, s.time)
    }
    this.syncHand(dt)
    this.syncPieces(dt)
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
      if (this.veiled.has(m.id)) view.hide()
      else view.sync(m, dt, time)
    }
    for (const [id, view] of this.moteViews) {
      if (alive.has(id)) continue
      view.destroy()
      this.moteViews.delete(id)
    }
  }

  private slotPosition(slot: number): Vec2 {
    return this.hand().slots[slot] ?? this.hand().slots[0]
  }

  private iconScale(radius: number): number {
    return iconRadius(radius, this.largestRune, this.hand().room, BOWL_R, BOWL_MIN) / radius
  }

  // The shelf's layout for this hand (its size is fixed for a level).
  private hand(): HandLayout {
    const n = this.sim.state.runes.length
    if (this.layout?.slots.length !== Math.max(1, n)) this.layout = handLayout(n)
    return this.layout
  }

  // Runes in hand sit in their slots; the one being dragged follows the
  // finger, and a rune whose next layer just came back flies home.
  private syncHand(dt: number): void {
    const s = this.sim.state
    for (const rune of s.runes) {
      const view = this.handViews.get(rune.id)
      if (!view) continue
      const look = handLook(rune)
      if (!look) {
        if (!this.flights.has(rune.id)) this.removeView(this.handViews, rune.id)
        continue
      }
      let pos: Vec2
      let scale: number
      view.container.tint = 0xffffff
      if (this.drag?.runeId === rune.id) {
        pos = this.drag.pos
        scale = 1
        view.container.tint = this.sim.canPlace(rune.id, pos) ? 0xffffff : INVALID_TINT
      } else {
        const slot = this.slotPosition(rune.slot)
        const icon = this.iconScale(look.outer.radius)
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
      // In hand, the whole slot takes a tap (slots never overlap); dragged,
      // the rune itself.
      view.setHitRadius(this.drag?.runeId === rune.id ? look.outer.radius * scale + 10 : this.hand().hit)
      view.sync(look, REST_ANGLE, REST_ANGLE, s.time, dt, NO_MOTES)
    }
  }

  private syncPieces(dt: number): void {
    const s = this.sim.state
    const motes = new Map(s.motes.map((m) => [m.id, m]))
    for (const piece of s.pieces) {
      const view = this.pieceViews.get(piece.id)
      if (!view) continue
      let pop = this.pops.get(piece.id)
      if (pop !== undefined) {
        pop += dt / 0.3
        if (pop >= 1) this.pops.delete(piece.id)
        else this.pops.set(piece.id, pop)
      }
      const scale = pop !== undefined && pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.12 : 1
      view.container.position.set(piece.pos.x, piece.pos.y)
      view.body.scale.set(scale)
      view.setHitRadius(piece.layer.radius * scale + 10)
      if (piece.burnAt !== undefined) this.burnFuse(view, piece, dt)
      else view.setFuse(piece.freezeAt === undefined ? null : Math.max(0, (piece.freezeAt - s.time) / (piece.freezeFor ?? ENDLESS_TUNING.fuse)), piece.layer.radius, s.time)
      view.sync(pieceLook(piece, this.stasisOf(piece), this.pullColorOf(piece)), outerAngle(piece, s.time), middleAngle(piece, s.time), s.time, dt, motes)
    }
  }

  // A piece in stasis waits for its partner, or is armed once both are there.
  private stasisOf(piece: Piece): 'waiting' | 'armed' | undefined {
    if (piece.stasis === undefined) return undefined
    return partnerOf(this.sim.state, piece) ? 'armed' : 'waiting'
  }

  // The color a puller hauls on: its obstacle's first shield still up that
  // it has a bowl for (or, all of those down, the first it has one for).
  private pullColorOf(piece: Piece): number | undefined {
    if (piece.pulling === undefined) return undefined
    const o = this.sim.state.obstacles.find((x) => x.id === piece.linkedObstacleId)
    if (!o) return undefined
    const any = (o.layers[o.index]?.shields ?? []).find((sh) => piece.layer.nodes.some((n) => n.catch === sh.color))
    return haulColor(piece.layer, o) ?? (any ? hueColor(any.color) : undefined)
  }

  // A level's fuse burning down around a piece: sparks fly from its tip,
  // and it sizzles once as it runs low.
  private burnFuse(view: RuneView, piece: Piece, dt: number): void {
    const s = this.sim.state
    const left = Math.max(0, (piece.burnAt! - s.time) / (piece.burnFor ?? piece.burnAt! - piece.placedAt))
    view.setFuse(left, piece.layer.radius, s.time, 'ember')
    let wait = (this.sparks.get(piece.id) ?? 0) - dt
    const every = left < 0.3 ? 0.03 : 0.07
    for (; wait <= 0; wait += every) fuseSpark(this.effects, fuseTip(piece.pos, piece.layer.radius, left))
    this.sparks.set(piece.id, wait)
    if (left < 0.3 && !this.lowFuses.has(piece.id)) {
      this.lowFuses.add(piece.id)
      this.sfx.fuseLow()
    }
  }

  private drawLinks(): void {
    const s = this.sim.state
    const obstacles = new Map(s.obstacles.map((o) => [o.id, o]))
    const list: Link[] = []
    // Ice (once it shows) is tethered to the frost layer whose fall thaws it.
    for (const o of s.obstacles) {
      const boss = o.frozen?.by && obstacles.get(o.frozen.by.obstacle)
      if (boss && !o.cleared && this.obstacleViews.has(o.id)) list.push({ from: o.pos, to: boss.pos, tether: true })
    }
    // A blow short of a frost layer's strength will be caught by its frost.
    const bitten = (power: number, o: Obstacle) => !o.frozen && !!o.layers[o.index]?.frost && power < o.hp
    const motes = new Map(s.motes.map((m) => [m.id, m]))
    for (const piece of s.pieces) {
      if (!piece.linkedObstacleId) continue
      const o = obstacles.get(piece.linkedObstacleId)
      if (!o || !this.obstacleViews.has(o.id)) continue
      // The most it can strike for: every bowl but those holding blanks.
      const blank = piece.held.filter((id) => {
        const c = id ? motes.get(id)?.color : undefined
        return c === 'null' || c === 'void'
      }).length
      const power = piece.layer.sides - blank
      const stasis = this.stasisOf(piece)
      const pull = this.pullColorOf(piece)
      list.push({
        from: piece.pos,
        to: o.pos,
        // A striker waiting on a shielded layer looks unready until it falls.
        full: piece.state === 'full' && (pull !== undefined || upShields(o).length === 0),
        frost: pull === undefined && bitten(power, o),
        ...(stasis ? { stasis } : {}),
        ...(pull === undefined ? {} : { pull }),
        ...(blank ? { pips: { lit: power, blank }, fromRadius: piece.layer.radius } : {}),
      })
    }
    if (this.drag) {
      const target = this.sim.previewLink(this.drag.runeId, this.drag.pos)
      const ok = this.sim.canPlace(this.drag.runeId, this.drag.pos)
      const rune = this.sim.rune(this.drag.runeId)
      const outer = rune && outerLayer(rune)
      const blank = outer ? outer.nodes.filter((n) => n.prefilled === 'null' || n.prefilled === 'void').length : 0
      const power = outer ? outer.sides - blank : 0
      // Dropped here, would it latch on to pull a shield?
      const pull = target && outer ? haulColor(outer, target) : undefined
      if (target)
        list.push({
          from: this.drag.pos,
          to: target.pos,
          preview: true,
          invalid: !ok,
          frost: !!outer && pull === undefined && bitten(power, target),
          ...(pull === undefined ? {} : { pull }),
          ...(blank && outer ? { pips: { lit: power, blank }, fromRadius: outer.radius } : {}),
        })
    }
    this.links.draw(list, this.clock)
    const g = this.links.g
    if (this.showRings) {
      for (const { pos, layer } of s.pieces) {
        g.circle(pos.x, pos.y, layer.radius + REACH).stroke({ color: 0x7cffb2, width: 1, alpha: 0.5 })
        g.circle(pos.x, pos.y, Math.max(1, layer.radius - REACH)).stroke({ color: 0x7cffb2, width: 1, alpha: 0.5 })
      }
    }
  }

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------

  private rebuildViews(): void {
    this.cancelDrag()
    this.detachGesture()
    for (const id of [...this.handViews.keys()]) this.removeView(this.handViews, id)
    for (const id of [...this.pieceViews.keys()]) this.removeView(this.pieceViews, id)
    for (const v of this.obstacleViews.values()) v.container.destroy({ children: true })
    for (const v of this.moteViews.values()) v.destroy()
    this.obstacleViews.clear()
    this.moteViews.clear()
    this.flights.clear()
    this.sparks.clear()
    this.lowFuses.clear()
    this.pops.clear()
    this.veiled.clear()
    this.effects.clear()
    this.pendingResult = null

    const s = this.sim.state
    for (const o of s.obstacles) this.addObstacleView(o)
    for (const r of s.runes) if (r.state === 'idle') this.addHandView(r)
    for (const p of s.pieces) this.addPieceView(p)
  }

  private addObstacleView(o: Obstacle): void {
    const view = new ObstacleView(o)
    this.obstacleViews.set(o.id, view)
    this.layers.obstacles.addChild(view.container)
  }

  private addHandView(rune: Rune): void {
    const view = new RuneView(rune.id)
    view.container.on('pointerdown', (e) => this.onRunePointerDown(rune.id, e))
    this.handViews.set(rune.id, view)
    this.layers.runes.addChild(view.container)
  }

  private addPieceView(piece: Piece): void {
    const view = new RuneView(piece.id)
    view.container.on('pointerdown', (e) => this.onPiecePointerDown(piece.id, e))
    this.pieceViews.set(piece.id, view)
    this.layers.runes.addChild(view.container)
  }

  private removeView(views: Map<string, RuneView>, id: string): void {
    const view = views.get(id)
    if (!view) return
    view.container.destroy({ children: true })
    views.delete(id)
  }

  // ---------------------------------------------------------------------
  // Sim events -> juice
  // ---------------------------------------------------------------------

  private bindSimEvents(): void {
    const bus = this.sim.bus
    bus.on('piece:cast', ({ piece, rune }) => {
      this.addPieceView(piece)
      this.pops.set(piece.id, 0)
      this.effects.ring(piece.pos, RUNE_BODY_COLOR, 20, piece.layer.radius + 20, 0.35, 2)
      this.sfx.place()
      // The rune's next layer comes back to hand: its view flies home from
      // the drop, growing from the size it had inside the cast layer.
      const next = outerLayer(rune)
      if (next) this.flights.set(rune.id, { from: { ...piece.pos }, fromScale: (MIDDLE_SCALE * piece.layer.radius) / next.radius, t: 0 })
      else this.removeView(this.handViews, rune.id)
    })
    bus.on('mote:held', ({ piece }) => {
      const motes = this.sim.state.motes
      this.sfx.nodeFilled(piece.held.filter((id) => id !== null && motes.find((m) => m.id === id)?.state === 'held').length)
    })
    bus.on('piece:full', ({ piece }) => {
      this.effects.ring(piece.pos, ACCENT_COLOR, piece.layer.radius, piece.layer.radius + 26, 0.45, 2)
      this.sfx.full()
    })
    // Latched onto a two-shape layer: clamps close round it; with its
    // partner already there, the pair arms.
    bus.on('piece:stasis', ({ piece }) => {
      this.effects.ring(piece.pos, STASIS_RING, piece.layer.radius + 30, piece.layer.radius + 12, 0.35, 2)
      const partner = partnerOf(this.sim.state, piece)
      if (!partner) {
        this.sfx.stasis()
        return
      }
      for (const p of [piece, partner]) this.effects.ring(p.pos, 0xffffff, p.layer.radius + 6, p.layer.radius + 34, 0.5, 2)
      this.sfx.armed()
    })
    bus.on('piece:released', ({ piece }) => this.effects.ring(piece.pos, STASIS_RING, piece.layer.radius + 12, piece.layer.radius + 36, 0.4, 1.5))
    // Latched onto a shielded layer: clamps in the shield's color close.
    bus.on('piece:pulling', ({ piece }) => {
      this.effects.ring(piece.pos, this.pullColorOf(piece) ?? STASIS_RING, piece.layer.radius + 30, piece.layer.radius + 12, 0.35, 2)
      this.sfx.stasis()
    })
    // Pulled down: the shield bursts in its color.
    bus.on('shield:down', ({ obstacle, index }) => {
      const sh = obstacle.layers[obstacle.index]?.shields?.[index]
      if (!sh) return
      const color = hueColor(sh.color)
      const r = obstacle.layers[obstacle.index].radius + 12
      this.effects.ring(obstacle.pos, color, r, r + 42, 0.55, 3)
      this.effects.ring(obstacle.pos, lighten(color, 0.5), r - 4, r + 20, 0.3, 1.5)
      const star = textures().star
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3
        const v = 60 + Math.random() * 70
        this.effects.particle(star, {
          x: obstacle.pos.x + Math.cos(a) * r,
          y: obstacle.pos.y + Math.sin(a) * r,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          drag: 0.1,
          spin: (Math.random() - 0.5) * 6,
          scale: 0.35 + Math.random() * 0.25,
          scaleTo: 0.05,
          tint: lighten(color, 0.3),
          add: true,
          life: 0.6 + Math.random() * 0.3,
        })
      }
      this.effects.addShake(4)
      this.sfx.shieldDown()
    })
    bus.on('piece:detonated', ({ piece, info }) => this.onDetonated(piece.id, info))
    bus.on('hue:discovered', ({ hue, mote }) => this.onHueDiscovered(hue, { ...mote.home }))
    // A piece whose fuse burned down before it burst: it and the motes it
    // held go up in flames and ash.
    bus.on('piece:burned', ({ piece, motes }) => {
      this.removeView(this.pieceViews, piece.id)
      this.sparks.delete(piece.id)
      this.lowFuses.delete(piece.id)
      burnUp(this.effects, this.smoke, { ...piece.pos }, piece.layer.radius, motes.map((m) => ({ ...m.pos })))
      this.effects.addShake(4)
      this.sfx.burn()
    })
    // Endless: a piece whose fuse ran out turns to ice in place.
    bus.on('piece:frozen', ({ piece, obstacle }) => {
      this.removeView(this.pieceViews, piece.id)
      this.addObstacleView(obstacle)
      freezeBurst(this.effects, obstacle.pos, piece.layer.radius)
      this.effects.addShake(4)
      this.sfx.freeze()
    })
    // A frost layer fell: frost races from it to each piece it froze, and
    // the ice shatters as the motes burst out (the sim times them to it).
    bus.on('ice:thawed', ({ ice, by }) => {
      const impact = this.impacts.get(by.id) ?? 0
      const at = { ...ice.pos }
      const radius = ice.layers[0].radius
      this.obstacleViews.get(ice.id)?.holdAsIs(impact + THAW_LAG)
      this.effects.after(impact, () => frostStreak(this.effects, { ...by.pos }, at, THAW_LAG))
      this.effects.after(impact + THAW_LAG, () => {
        iceShatter(this.effects, this.smoke, at, radius)
        this.effects.addShake(5)
        this.sfx.iceBreak()
      })
    })
    // Damage lands when the detonation's orb does (the view holds the
    // obstacle until then); a debug collapse has no orb and lands at once.
    bus.on('obstacle:damaged', ({ obstacle }) => {
      this.effects.after(this.impacts.get(obstacle.id) ?? 0, () => this.obstacleViews.get(obstacle.id)?.hit())
    })
    bus.on('obstacle:collapsed', ({ obstacle, previous, cleared }) => {
      const pos = { ...obstacle.pos }
      const ice = !!obstacle.frozen
      this.effects.after(this.impacts.get(obstacle.id) ?? 0, () => {
        if (ice) {
          iceShatter(this.effects, this.smoke, pos, previous.radius)
          this.effects.addShake(6)
          this.sfx.iceBreak()
          return
        }
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
        const hues = Object.values(activePalette().hues)
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
        for (const { pos, layer } of this.sim.state.pieces) this.effects.ring(pos, 0x6d6480, layer.radius, layer.radius * 0.4, 1.2, 3)
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

  private onDetonated(pieceId: string, info: DetonationInfo): void {
    const { pos, outer } = info
    this.discoveries = 0
    this.sparks.delete(pieceId)
    this.lowFuses.delete(pieceId)
    // Fires before the sim damages the obstacle, so it still shows the
    // state to hold on screen until the orb lands.
    const target = info.obstacleId ? this.sim.state.obstacles.find((o) => o.id === info.obstacleId) : undefined
    const timing = detonationTiming(pos, target?.pos ?? null)
    if (target) {
      // A pair's two blows land as one, with the later of them.
      this.impacts.set(target.id, Math.max(timing.impact, this.impacts.get(target.id) ?? 0))
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
      liquids: this.pieceViews.get(pieceId)?.liquids(pos, outer, info.outerAngle) ?? [],
      releases: outer.nodes.map((n) => n.release),
      target: target ? { ...target.pos } : null,
      frozen: !!info.frozeInto,
    })
    // The piece is used up: its glass shatters in the effect above (or,
    // frostbitten, it freezes once the blow has landed).
    if (info.frozeInto && target) this.frostbite(pieceId, info.frozeInto, pos, outer.radius, { ...target.pos }, timing.impact)
    else this.removeView(this.pieceViews, pieceId)
    this.sfx.detonate(timing.launch, target ? timing.impact : null)
  }

  // The blow lands and the frost layer holds: frost races back along the
  // thread, and the piece freezes where it stands, its motes locked inside.
  // Until then the piece stays as it was, and its motes out of sight.
  private frostbite(pieceId: string, iceId: string, at: Vec2, radius: number, boss: Vec2, impact: number): void {
    const ice = this.sim.state.obstacles.find((o) => o.id === iceId)
    if (!ice) return
    const motes = [...(ice.frozen?.motes ?? [])]
    for (const id of motes) this.veiled.add(id)
    this.effects.after(impact, () => {
      this.effects.ring(boss, FROST, 14, 64, 0.45, 2.5)
      frostStreak(this.effects, boss, at, FROST_BACK)
    })
    this.effects.after(impact + FROST_BACK, () => {
      this.removeView(this.pieceViews, pieceId)
      if (!this.obstacleViews.has(iceId)) this.addObstacleView(ice)
      for (const id of motes) this.veiled.delete(id)
      freezeBurst(this.effects, at, radius)
      this.effects.addShake(4)
      this.sfx.freeze()
    })
  }

  // A hue the board has never had: the screen flashes it as its liquid
  // spills, light blooms where its first mote lands, and its name rings out
  // over a jingle. Nothing pauses. Two new hues at once take turns.
  private onHueDiscovered(hue: Hue, at: Vec2): void {
    const color = hueColor(hue)
    const delay = this.discoveries++ * 1.2
    this.effects.after(LAUNCH + delay, () => {
      this.effects.flash(color, 0.24, 0.9, { x: 0, y: 0, w: VIRTUAL_WIDTH, h: VIRTUAL_HEIGHT })
      this.effects.flash(0xffffff, 0.12, 0.25, { x: 0, y: 0, w: VIRTUAL_WIDTH, h: VIRTUAL_HEIGHT })
      this.sfx.discover()
    })
    this.effects.after(EJECT_TIME + delay, () => {
      const t = textures()
      this.effects.particle(t.glow, { x: at.x, y: at.y, scale: 0.4, scaleTo: 3.4, tint: color, add: true, life: 1 })
      this.effects.particle(t.glow, { x: at.x, y: at.y, scale: 0.3, scaleTo: 1.4, tint: 0xffffff, alpha: 0.8, add: true, life: 0.45 })
      this.effects.ring(at, color, 8, 110, 0.8, 3)
      this.effects.ring(at, lighten(color, 0.6), 4, 70, 0.55, 2)
      this.effects.after(0.18, () => this.effects.ring(at, color, 12, 170, 1.1, 2))
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3
        const v = 90 + Math.random() * 110
        this.effects.particle(t.star, {
          x: at.x,
          y: at.y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          drag: 0.08,
          spin: (Math.random() - 0.5) * 6,
          scale: 0.5 + Math.random() * 0.3,
          scaleTo: 0.1,
          tint: lighten(color, 0.35),
          add: true,
          life: 0.8 + Math.random() * 0.4,
        })
      }
      this.effects.addShake(3)
      this.hud?.announce('New color', hueName(hue), `#${color.toString(16).padStart(6, '0')}`)
    })
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------

  // A touch on the board is followed until it lifts (see endGesture). The
  // free mote nearest where it began, if one is close, is marked at once.
  private onBoardPointerDown(e: FederatedPointerEvent, onPiece = false): void {
    this.sfx.unlock()
    if (this.drag || this.gesture || this.sim.state.status !== 'playing') return
    const p = this.layers.root.toLocal(e.global)
    const radius = e.pointerType === 'mouse' ? GRAB_MOUSE_RADIUS : GRAB_TOUCH_RADIUS
    const mote = this.nearestFreeMote((m) => Math.hypot(m.pos.x - p.x, m.pos.y - p.y), radius)
    if (mote) this.effects.ring(mote.pos, colorForMote(mote.color), 16, 9, 0.2, 1.2)
    const pointerId = e.pointerId
    const start = { t: performance.now() / 1000, x: p.x, y: p.y }
    const sample = (ev: PointerEvent): Sample => ({ t: performance.now() / 1000, ...this.clientToVirtual(ev, 0) })
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || !this.gesture) return
      this.gesture.samples.push(sample(ev))
      if (this.gesture.samples.length > 32) this.gesture.samples.shift()
    }
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) this.endGesture(sample(ev), radius)
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) this.detachGesture()
    }
    this.gesture = { pointerId, moteId: mote?.id ?? null, onPiece, start, samples: [start], onMove, onEnd, onCancel }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onCancel)
  }

  private nearestFreeMote(distance: (m: Mote) => number, within: number): Mote | null {
    let best: Mote | null = null
    let bestD = within
    for (const m of this.sim.state.motes) {
      if (m.state !== 'free') continue
      const d = distance(m)
      if (d < bestD) {
        bestD = d
        best = m
      }
    }
    return best
  }

  // A swipe flicks the mote it began on (or, failing that, the one it
  // crossed) along it: at least as far as the swipe, farther the quicker it
  // was. A tap shoves the nearest mote away from the finger.
  private endGesture(end: Sample, radius: number): void {
    const g = this.gesture
    this.detachGesture()
    if (!g || this.sim.state.status !== 'playing') return
    const { start } = g
    const dx = end.x - start.x
    const dy = end.y - start.y
    const moved = Math.hypot(dx, dy)
    let mote = g.moteId ? (this.sim.state.motes.find((m) => m.id === g.moteId && m.state === 'free') ?? null) : null
    let ok = false
    if (moved < TAP_SLOP) {
      ok = !!mote && this.sim.kick(mote.id, start)
    } else {
      mote ??= this.nearestFreeMote((m) => distToSegment(m.pos, start, end), radius)
      if (mote) {
        // The swipe's speed over its last moments.
        const recent = g.samples.find((s) => s.t >= end.t - FLICK_WINDOW) ?? start
        const dt = end.t - recent.t
        const quick = dt > 0.008 ? Math.hypot(end.x - recent.x, end.y - recent.y) / dt : 0
        const speed = Math.max(MOTE_FRICTION * moved, FLICK_GAIN * quick)
        ok = this.sim.flick(mote.id, { x: (dx / moved) * speed, y: (dy / moved) * speed })
      }
    }
    if (ok && mote) {
      this.session.kicks++
      const v = mote.vel ?? { x: 0, y: 0 }
      this.moteViews.get(mote.id)?.burst(mote.pos.x, mote.pos.y, lighten(colorForMote(mote.color), 0.12), mote.color === 'generic', 5, v.x * 0.25, v.y * 0.25)
      this.effects.ring(mote.pos, colorForMote(mote.color), 6, 22, 0.25, 1.5)
      this.sfx.kick()
    } else if (g.onPiece) {
      // A charging piece has nothing to do on tap.
      this.sfx.notReady()
    }
  }

  private detachGesture(): void {
    const g = this.gesture
    if (!g) return
    window.removeEventListener('pointermove', g.onMove)
    window.removeEventListener('pointerup', g.onEnd)
    window.removeEventListener('pointercancel', g.onCancel)
    this.gesture = null
  }

  private onRunePointerDown(runeId: string, e: FederatedPointerEvent): void {
    this.sfx.unlock() // must run inside a real gesture for iOS Safari
    const rune = this.sim.rune(runeId)
    if (!rune || this.sim.state.status !== 'playing') return
    if (rune.state === 'idle' && !this.drag && !this.flights.has(runeId)) this.beginDrag(runeId, e)
  }

  private onPiecePointerDown(pieceId: string, e: FederatedPointerEvent): void {
    this.sfx.unlock()
    const piece = this.sim.piece(pieceId)
    if (!piece || this.sim.state.status !== 'playing') return
    // A charging piece has nothing to do on tap, so the touch falls through
    // to the board (motes near a piece stay within reach). One in stasis
    // bursts only once its partner is there too.
    if (piece.state !== 'full') this.onBoardPointerDown(e, true)
    else if (!this.sim.detonate(pieceId)) {
      this.effects.ring(piece.pos, STASIS_RING, piece.layer.radius + 16, piece.layer.radius + 8, 0.25, 1.5)
      this.sfx.notReady()
    }
  }

  // Drag tracking uses window-level DOM pointer events, not Pixi per-object
  // events: on touch the rune hovers above the finger (so release is never
  // "over" it) and it is reparented mid-press, which made Pixi drop the
  // release on iPhone and leave the rune stuck until a second drag.
  private beginDrag(runeId: string, e: FederatedPointerEvent): void {
    const view = this.handViews.get(runeId)
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

// The color a piece of this glass pulls at `o`: the first shield still up
// there that it has a bowl for (none: it would not pull there).
function haulColor(glass: RuneLayerSpec, o: Obstacle): number | undefined {
  const sh = upShields(o).find((x) => glass.nodes.some((n) => n.catch === x.color))
  return sh ? hueColor(sh.color) : undefined
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - (a.x + dx * u), p.y - (a.y + dy * u))
}
