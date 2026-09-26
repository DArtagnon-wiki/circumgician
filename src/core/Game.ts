import { Application, Graphics, type Container, type Renderer } from 'pixi.js'
import { createLayers, type Layers } from '../render/Layers'
import { BACKGROUND_BOTTOM, BACKGROUND_TOP, colorForSides } from '../render/Theme'
import { ObstacleView } from '../render/ObstacleView'
import { RuneView } from '../render/RuneView'
import { MiasmaPuffView } from '../render/MiasmaPuffView'
import { computeLayout, type FieldLayout } from './Layout'
import { loadLevel, type GameState } from './GameState'
import { LEVELS } from '../data/levels'
import { createEventBus, type EventBus } from './EventBus'
import { InputSelectionSystem } from '../systems/InputSelectionSystem'
import { MiasmaFieldSystem } from '../systems/MiasmaFieldSystem'
import { AttractionFillSystem } from '../systems/AttractionFillSystem'
import { DetonationSystem } from '../systems/DetonationSystem'
import { ObstacleHealthSystem } from '../systems/ObstacleHealthSystem'
import type { Id, Vec2 } from './types'
import type { Rune } from '../model/Rune'
import type { Obstacle } from '../model/Obstacle'

type Animation = (dt: number) => boolean // return false when finished

const OBSTACLE_MARGIN = 50

export class Game {
  app = new Application()
  layers!: Layers
  private layout!: FieldLayout
  private state!: GameState
  private bus!: EventBus
  private inputSystem!: InputSelectionSystem
  private miasmaFieldSystem = new MiasmaFieldSystem()
  private attractionSystem!: AttractionFillSystem
  private obstacleViews = new Map<Id, ObstacleView>()
  private runeViews = new Map<Id, RuneView>()
  private puffViews = new Map<Id, MiasmaPuffView>()
  // World-space (root layer) positions, refreshed every relayout — shared by
  // systems that need to reason about distance (selection, later targeting).
  private viewPositions = new Map<Id, Vec2>()
  private linkTargets = new Map<Id, Id>() // runeId -> obstacleId
  private linkGraphics = new Map<Id, Graphics>() // runeId -> line graphic
  private animations: Animation[] = []

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

    this.layout = computeLayout(this.app.screen.width, this.app.screen.height, this.safeAreaBottom())
    this.state = loadLevel(LEVELS[0], this.layout.miasmaField)
    this.bus = createEventBus()
    this.inputSystem = new InputSelectionSystem(this.state, this.bus, (id) => this.viewPositions.get(id))
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

    this.drawBackground()
    this.buildObstacleViews()
    this.buildRuneViews()
    this.buildPuffViews()
    this.relayout()

    this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000))
    this.bindResize()
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
      view.container.on('pointertap', () => this.inputSystem.trySelect(rune))
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

  private onRuneActivated(rune: Rune, obstacle: Obstacle): void {
    this.runeViews.get(rune.id)?.setActive(true)
    this.linkTargets.set(rune.id, obstacle.id)
    this.drawLinkLine(rune.id)
  }

  private onNodeFilled(rune: Rune, nodeIndex: number): void {
    this.runeViews.get(rune.id)?.syncNodes()
    const puffId = rune.nodes[nodeIndex].puffId
    if (puffId) this.puffViews.get(puffId)?.hide()
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
  }

  private onRuneDetonated(rune: Rune): void {
    this.runeViews.get(rune.id)?.setActive(false)
    this.runeViews.get(rune.id)?.syncNodes()
    this.linkTargets.delete(rune.id)
    const line = this.linkGraphics.get(rune.id)
    if (line) {
      this.layers.effects.removeChild(line)
      line.destroy()
      this.linkGraphics.delete(rune.id)
    }
  }

  private spawnBurst(position: Vec2, color: number): void {
    const g = new Graphics()
    this.layers.effects.addChild(g)
    let elapsed = 0
    const duration = 0.35
    this.animations.push((dt) => {
      elapsed += dt
      const t = Math.min(1, elapsed / duration)
      g.clear()
      g.circle(position.x, position.y, 10 + t * 40).stroke({ color, width: 3, alpha: 1 - t })
      if (t >= 1) {
        this.layers.effects.removeChild(g)
        g.destroy()
        return false
      }
      return true
    })
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
    line.clear()
    line.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: 0xffffff, width: 2, alpha: 0.35 })
  }

  private relayout(): void {
    this.layout = computeLayout(this.app.screen.width, this.app.screen.height, this.safeAreaBottom())
    const { obstacleArea, inventoryBar, inventoryContentHeight } = this.layout

    const usableW = Math.max(1, obstacleArea.width - OBSTACLE_MARGIN * 2)
    const usableH = Math.max(1, obstacleArea.height - OBSTACLE_MARGIN * 2)
    for (const obstacle of this.state.obstacles) {
      const x = obstacleArea.x + OBSTACLE_MARGIN + obstacle.position.x * usableW
      const y = obstacleArea.y + OBSTACLE_MARGIN + obstacle.position.y * usableH
      this.obstacleViews.get(obstacle.id)?.setPosition(x, y)
      this.viewPositions.set(obstacle.id, { x, y })
    }

    const capacity = this.state.inventory.capacity
    this.state.inventory.slots.forEach((rune, slotIndex) => {
      if (!rune) return
      const x = inventoryBar.x + ((slotIndex + 0.5) / capacity) * inventoryBar.width
      const y = inventoryBar.y + inventoryContentHeight / 2
      this.runeViews.get(rune.id)?.setPosition(x, y)
      this.viewPositions.set(rune.id, { x, y })
    })

    for (const runeId of this.linkTargets.keys()) {
      this.drawLinkLine(runeId)
    }
  }

  private update(dt: number): void {
    this.miasmaFieldSystem.update(this.state.miasmaPuffs, dt, this.layout.miasmaField)
    this.attractionSystem.update(dt)

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
