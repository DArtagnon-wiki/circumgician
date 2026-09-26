import { Application, Graphics, type Container, type FederatedPointerEvent, type Renderer } from 'pixi.js'
import { createLayers, type Layers } from '../render/Layers'
import { BACKGROUND_BOTTOM, BACKGROUND_TOP, colorForSides } from '../render/Theme'
import { ObstacleView } from '../render/ObstacleView'
import { RuneView } from '../render/RuneView'
import { MiasmaPuffView } from '../render/MiasmaPuffView'
import { computeLayout, type FieldLayout } from './Layout'
import { loadLevel, type GameState } from './GameState'
import { LEVELS } from '../data/levels'
import type { LevelConfig } from '../data/levels'
import { createEventBus, type EventBus } from './EventBus'
import { DragPlacementSystem } from '../systems/DragPlacementSystem'
import { MiasmaFieldSystem } from '../systems/MiasmaFieldSystem'
import { AttractionFillSystem } from '../systems/AttractionFillSystem'
import { DetonationSystem } from '../systems/DetonationSystem'
import { ObstacleHealthSystem } from '../systems/ObstacleHealthSystem'
import { RuneSupplySystem } from '../systems/RuneSupplySystem'
import { WinFailSystem } from '../systems/WinFailSystem'
import { createStrategy } from '../supply'
import { showHUD } from '../ui/HUD'
import { Sfx } from '../audio/Sfx'
import type { Id, ShapeSides, Vec2 } from './types'
import { createRune } from '../model/Rune'
import type { Rune } from '../model/Rune'
import { radiusForSides } from '../model/Polygon'
import type { Obstacle } from '../model/Obstacle'
import { makeId } from './id'
import { randRange } from '../utils/math'

type Animation = (dt: number) => boolean // return false when finished

const OBSTACLE_MARGIN = 50

interface DragState {
  rune: Rune
  view: RuneView
  onMove: (e: FederatedPointerEvent) => void
  onEnd: (e: FederatedPointerEvent) => void
}

export class Game {
  app = new Application()
  layers!: Layers
  private layout!: FieldLayout
  private state!: GameState
  private bus!: EventBus
  private dragSystem!: DragPlacementSystem
  private miasmaFieldSystem = new MiasmaFieldSystem()
  private attractionSystem!: AttractionFillSystem
  private supplySystem!: RuneSupplySystem
  private winFailSystem!: WinFailSystem
  private obstacleViews = new Map<Id, ObstacleView>()
  private runeViews = new Map<Id, RuneView>()
  private puffViews = new Map<Id, MiasmaPuffView>()
  // World-space (root layer) positions, refreshed whenever something moves —
  // shared by systems that need to reason about distance (placement, targeting).
  private viewPositions = new Map<Id, Vec2>()
  private linkTargets = new Map<Id, Id>() // runeId -> obstacleId
  private linkGraphics = new Map<Id, Graphics>() // runeId -> confirmed link line
  private previewLine = new Graphics()
  private dragState: DragState | null = null
  private animations: Animation[] = []
  private particlePool: Graphics[] = []
  private sfx = new Sfx()

  async mount(container: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: window,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      backgroundAlpha: 0,
      antialias: true,
    })
    container.appendChild(this.app.canvas)
    // `resizeTo` applies on the next animation frame, not synchronously during init() —
    // force the correct size now so the first layout isn't computed off a stale default canvas.
    this.app.renderer.resize(window.innerWidth, window.innerHeight)

    this.layers = createLayers()
    this.app.stage.addChild(this.layers.root)
    this.layers.effects.addChild(this.previewLine)

    const level = this.selectLevel()
    this.layout = computeLayout(this.app.screen.width, this.app.screen.height, this.safeAreaBottom())
    this.state = loadLevel(level, this.layout.miasmaField)
    this.bus = createEventBus()
    this.dragSystem = new DragPlacementSystem(this.state, this.bus, (id) => this.viewPositions.get(id))
    this.attractionSystem = new AttractionFillSystem(this.state, this.bus, (id) => this.viewPositions.get(id))
    // Both systems are purely event-driven (subscribe in their constructor) —
    // the bus keeps them alive, no need to hold a reference on Game.
    new DetonationSystem(this.state, this.bus, () => this.layout.miasmaField)
    new ObstacleHealthSystem(this.state, this.bus)
    this.bus.on('rune:activated', ({ rune, obstacle }) => this.onRuneActivated(rune, obstacle))
    this.bus.on('node:filled', ({ rune, nodeIndex }) => this.onNodeFilled(rune, nodeIndex))
    this.bus.on('obstacle:damaged', ({ obstacle }) => this.onObstacleDamaged(obstacle))
    this.bus.on('obstacle:cleared', ({ obstacle }) => this.onObstacleCleared(obstacle))
    this.bus.on('rune:detonated', ({ rune }) => this.onRuneDetonated(rune))
    this.bus.on('rune:added', ({ rune }) => this.onRuneAdded(rune))
    // Populates the inventory via the level's configured strategy — must run
    // before buildRuneViews() so there's something to build views for.
    this.supplySystem = new RuneSupplySystem(this.state, level, this.bus, createStrategy(level.supply))
    this.winFailSystem = new WinFailSystem(
      this.state,
      this.bus,
      this.supplySystem,
      this.dragSystem,
      () => this.layout.miasmaField,
    )
    this.bus.on('game:won', () => {
      this.sfx.win()
      showHUD('won', () => window.location.reload())
    })
    this.bus.on('game:lost', () => {
      this.sfx.lose()
      showHUD('lost', () => window.location.reload())
    })

    this.drawBackground()
    this.buildObstacleViews()
    this.buildRuneViews()
    this.buildPuffViews()
    this.relayout()

    this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000))
    this.bindResize()
  }

  // `?level=N` (1-indexed) is a minimal test/dev hook for picking a level
  // ahead of a real level-select UI — not wired to any in-game menu yet.
  private selectLevel(): LevelConfig {
    const requested = Number(new URLSearchParams(window.location.search).get('level'))
    const index = Number.isInteger(requested) && requested >= 1 && requested <= LEVELS.length ? requested - 1 : 0
    return LEVELS[index]
  }

  private safeAreaBottom(): number {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-bottom')
    return parseFloat(raw) || 0
  }

  private drawBackground(): void {
    const draw = () => {
      const w = this.app.screen.width
      const h = this.app.screen.height
      this.layers.background.removeChildren()
      const g = new Graphics()
      g.rect(0, 0, w, h).fill({ color: BACKGROUND_TOP })
      const bands = 24
      for (let i = 0; i < bands; i++) {
        const t = i / (bands - 1)
        g.rect(0, (h * i) / bands, w, h / bands + 1).fill({
          color: BACKGROUND_BOTTOM,
          alpha: t * 0.75,
        })
      }
      this.layers.background.addChild(g)
    }
    draw()
    this.app.renderer.on('resize', draw)
  }

  private buildObstacleViews(): void {
    for (const obstacle of this.state.obstacles) {
      const view = new ObstacleView(obstacle)
      this.layers.obstacles.addChild(view.container)
      this.obstacleViews.set(obstacle.id, view)
    }
  }

  private buildRuneViews(): void {
    for (const rune of this.state.inventory.slots) {
      if (!rune) continue
      const view = new RuneView(rune)
      view.container.on('pointerdown', (e) => this.beginDrag(rune, view, e))
      this.layers.inventory.addChild(view.container)
      this.runeViews.set(rune.id, view)
    }
  }

  private buildPuffViews(): void {
    for (const puff of this.state.miasmaPuffs) {
      const view = new MiasmaPuffView()
      this.layers.miasmaField.addChild(view.graphic)
      this.puffViews.set(puff.id, view)
    }
  }

  private inventorySlotPosition(slotIndex: number): Vec2 {
    const { inventoryBar, inventoryContentHeight } = this.layout
    const capacity = this.state.inventory.capacity
    return {
      x: inventoryBar.x + ((slotIndex + 0.5) / capacity) * inventoryBar.width,
      y: inventoryBar.y + inventoryContentHeight / 2,
    }
  }

  private beginDrag(rune: Rune, view: RuneView, e: FederatedPointerEvent): void {
    if (rune.state !== 'idle' || this.dragState) return
    this.sfx.unlock() // must run synchronously inside a real gesture for iOS Safari

    // 'globalpointermove' fires regardless of hit-testing (unlike plain
    // 'pointermove', which only fires while the pointer is over the object) —
    // exactly what a drag needs since the pointer leaves the rune's own
    // bounds immediately. 'pointerupoutside' likewise fires on this object
    // even when the release happens elsewhere, so no stage-wide hit area or
    // global listener hijacking is needed (that approach was tried and
    // discovered to silently break ALL hit-testing into stage children —
    // assigning `hitArea` on a container short-circuits its child hit-tests).
    const onMove = (ev: FederatedPointerEvent) => this.onDragMove(ev)
    const onEnd = (ev: FederatedPointerEvent) => this.onDragEnd(ev)
    this.dragState = { rune, view, onMove, onEnd }
    view.container.on('globalpointermove', onMove)
    view.container.on('pointerup', onEnd)
    view.container.on('pointerupoutside', onEnd)

    this.layers.effects.addChild(view.container) // draw above everything while dragging
    view.setPosition(e.global.x, e.global.y)
  }

  private onDragMove(e: FederatedPointerEvent): void {
    if (!this.dragState) return
    const { rune, view } = this.dragState
    const pos = { x: e.global.x, y: e.global.y }
    view.setPosition(pos.x, pos.y)

    const target = this.dragSystem.findNearestMatch(rune, pos)
    const fits = target ? this.dragSystem.fitsInField(rune, pos, this.layout.miasmaField) : false
    this.drawPreviewLine(pos, target, fits)
  }

  private onDragEnd(e: FederatedPointerEvent): void {
    if (!this.dragState) return
    const { rune, view, onMove, onEnd } = this.dragState
    view.container.off('globalpointermove', onMove)
    view.container.off('pointerup', onEnd)
    view.container.off('pointerupoutside', onEnd)

    const pos = { x: e.global.x, y: e.global.y }
    this.previewLine.clear()

    const result = this.dragSystem.tryPlace(rune, pos, this.layout.miasmaField)
    if (!result.ok) {
      const slotPos = this.inventorySlotPosition(rune.slotIndex)
      this.layers.inventory.addChild(view.container)
      this.animateMove(view, pos, slotPos)
    }
    // On success, 'rune:activated' (emitted by tryPlace) drives the rest via onRuneActivated.

    this.dragState = null
  }

  private drawPreviewLine(from: Vec2, obstacle: Obstacle | null, fits: boolean): void {
    this.previewLine.clear()
    if (!obstacle) return
    const to = this.viewPositions.get(obstacle.id)
    if (!to) return
    this.previewLine
      .moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ color: fits ? 0xffffff : 0xff5d5d, width: 2, alpha: 0.3 })
  }

  private animateMove(view: RuneView, from: Vec2, to: Vec2): void {
    let elapsed = 0
    const duration = 0.2
    this.animations.push((dt) => {
      elapsed += dt
      const t = Math.min(1, elapsed / duration)
      view.setPosition(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)
      return t < 1
    })
  }

  private onRuneActivated(rune: Rune, obstacle: Obstacle): void {
    this.runeViews.get(rune.id)?.setActive(true)
    if (rune.fieldPosition) this.viewPositions.set(rune.id, rune.fieldPosition)
    this.linkTargets.set(rune.id, obstacle.id)
    this.drawLinkLine(rune.id)
    this.sfx.place()
  }

  private onNodeFilled(rune: Rune, nodeIndex: number): void {
    this.runeViews.get(rune.id)?.syncNodes()
    const puffId = rune.nodes[nodeIndex].puffId
    if (puffId) this.puffViews.get(puffId)?.hide()
    this.sfx.nodeFilled()
  }

  private onObstacleDamaged(obstacle: Obstacle): void {
    this.obstacleViews.get(obstacle.id)?.updateHp(obstacle.hp)
    const pos = this.viewPositions.get(obstacle.id)
    if (pos) this.spawnBurst(pos, colorForSides(obstacle.shape.sides))
  }

  private onObstacleCleared(obstacle: Obstacle): void {
    const view = this.obstacleViews.get(obstacle.id)
    if (view) {
      this.fadeOut(view.container, () => {
        this.layers.obstacles.removeChild(view.container)
        view.container.destroy({ children: true })
      })
    }
    this.obstacleViews.delete(obstacle.id)
    this.viewPositions.delete(obstacle.id)
    this.sfx.obstacleCleared()
  }

  // The rune is consumed on detonation (removed from its inventory slot by
  // DetonationSystem) — its view goes away with it. Whatever the supply
  // strategy adds to fill the vacated slot arrives as a separate 'rune:added'.
  private onRuneDetonated(rune: Rune): void {
    this.sfx.detonate()
    this.linkTargets.delete(rune.id)
    const line = this.linkGraphics.get(rune.id)
    if (line) {
      this.layers.effects.removeChild(line)
      line.destroy()
      this.linkGraphics.delete(rune.id)
    }

    const view = this.runeViews.get(rune.id)
    if (view) {
      view.container.parent?.removeChild(view.container)
      view.container.destroy({ children: true })
    }
    this.runeViews.delete(rune.id)
    this.viewPositions.delete(rune.id)
  }

  private onRuneAdded(rune: Rune): void {
    const view = new RuneView(rune)
    view.container.on('pointerdown', (e) => this.beginDrag(rune, view, e))
    this.layers.inventory.addChild(view.container)
    this.runeViews.set(rune.id, view)
    this.relayout() // capacity may have grown (debug force-add), reflow slots
  }

  debugSpawnRune(inner: ShapeSides, outer: ShapeSides): void {
    const outerRadius = radiusForSides(outer)
    const rune = createRune(
      makeId('rune'),
      { sides: inner, radius: outerRadius * 0.5 },
      { sides: outer, radius: outerRadius },
    )
    const placed = this.state.inventory.forceAddRune(rune)
    this.bus.emit('rune:added', { rune: placed })
  }

  private acquireParticle(): Graphics {
    return this.particlePool.pop() ?? new Graphics()
  }

  private releaseParticle(g: Graphics): void {
    g.clear()
    this.layers.effects.removeChild(g)
    this.particlePool.push(g)
  }

  private spawnBurst(position: Vec2, color: number): void {
    const ring = new Graphics()
    this.layers.effects.addChild(ring)
    let elapsed = 0
    const ringDuration = 0.35
    this.animations.push((dt) => {
      elapsed += dt
      const t = Math.min(1, elapsed / ringDuration)
      ring.clear()
      ring.circle(position.x, position.y, 10 + t * 40).stroke({ color, width: 3, alpha: 1 - t })
      if (t >= 1) {
        this.layers.effects.removeChild(ring)
        ring.destroy()
        return false
      }
      return true
    })

    const particleCount = 10
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + randRange(-0.2, 0.2)
      const speed = randRange(70, 150)
      const particle = this.acquireParticle()
      this.layers.effects.addChild(particle)
      let pElapsed = 0
      const pDuration = 0.4
      this.animations.push((dt) => {
        pElapsed += dt
        const t = Math.min(1, pElapsed / pDuration)
        const dist = speed * t
        const x = position.x + Math.cos(angle) * dist
        const y = position.y + Math.sin(angle) * dist
        particle.clear()
        particle.circle(x, y, 3 * (1 - t)).fill({ color, alpha: 1 - t })
        if (t >= 1) {
          this.releaseParticle(particle)
          return false
        }
        return true
      })
    }
  }

  private fadeOut(container: Container, onDone: () => void): void {
    let elapsed = 0
    const duration = 0.3
    this.animations.push((dt) => {
      elapsed += dt
      const t = Math.min(1, elapsed / duration)
      container.alpha = 1 - t
      container.scale.set(1 - t * 0.3)
      if (t >= 1) {
        onDone()
        return false
      }
      return true
    })
  }

  private drawLinkLine(runeId: Id): void {
    const obstacleId = this.linkTargets.get(runeId)
    if (!obstacleId) return
    const from = this.viewPositions.get(runeId)
    const to = this.viewPositions.get(obstacleId)
    if (!from || !to) return

    let line = this.linkGraphics.get(runeId)
    if (!line) {
      line = new Graphics()
      this.layers.effects.addChild(line)
      this.linkGraphics.set(runeId, line)
    }
    const obstacle = this.state.obstacles.find((o) => o.id === obstacleId)
    const color = obstacle ? colorForSides(obstacle.shape.sides) : 0xffffff
    line.clear()
    line.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, width: 3, alpha: 0.55 })
  }

  private relayout(): void {
    this.layout = computeLayout(this.app.screen.width, this.app.screen.height, this.safeAreaBottom())
    const { obstacleArea } = this.layout

    const usableW = Math.max(1, obstacleArea.width - OBSTACLE_MARGIN * 2)
    const usableH = Math.max(1, obstacleArea.height - OBSTACLE_MARGIN * 2)
    for (const obstacle of this.state.obstacles) {
      const x = obstacleArea.x + OBSTACLE_MARGIN + obstacle.position.x * usableW
      const y = obstacleArea.y + OBSTACLE_MARGIN + obstacle.position.y * usableH
      this.obstacleViews.get(obstacle.id)?.setPosition(x, y)
      this.viewPositions.set(obstacle.id, { x, y })
    }

    // Idle runes live at their inventory slot; active/dragging runes keep
    // whatever field position they were placed at (or their drag position).
    this.state.inventory.slots.forEach((rune, slotIndex) => {
      if (!rune || rune.state !== 'idle') return
      if (this.dragState?.rune.id === rune.id) return
      const pos = this.inventorySlotPosition(slotIndex)
      this.runeViews.get(rune.id)?.setPosition(pos.x, pos.y)
      this.viewPositions.set(rune.id, pos)
    })

    for (const runeId of this.linkTargets.keys()) {
      this.drawLinkLine(runeId)
    }
  }

  private update(dt: number): void {
    this.miasmaFieldSystem.update(this.state.miasmaPuffs, dt, this.layout.miasmaField)
    this.attractionSystem.update(dt)
    this.supplySystem.update(dt)
    this.winFailSystem.update()

    for (const puff of this.state.miasmaPuffs) {
      if (puff.state === 'consumed') continue
      this.puffViews.get(puff.id)?.sync(puff)
    }

    this.animations = this.animations.filter((animate) => animate(dt))
  }

  private bindResize(): void {
    const relayout = () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight)
      this.relayout()
    }
    window.visualViewport?.addEventListener('resize', relayout)
    window.visualViewport?.addEventListener('scroll', relayout)

    const renderer = this.app.renderer as Renderer
    const suppress = (e: TouchEvent) => e.preventDefault()
    renderer.canvas.addEventListener('touchmove', suppress, { passive: false })
    renderer.canvas.addEventListener('gesturestart', suppress as EventListener, { passive: false })
  }
}
