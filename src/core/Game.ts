import { Application, Graphics, type Renderer } from 'pixi.js'
import { createLayers, type Layers } from '../render/Layers'
import { BACKGROUND_BOTTOM, BACKGROUND_TOP } from '../render/Theme'
import { ObstacleView } from '../render/ObstacleView'
import { RuneView } from '../render/RuneView'
import { MiasmaPuffView } from '../render/MiasmaPuffView'
import { clamp } from '../utils/math'
import { computeLayout, type FieldLayout } from './Layout'
import { loadLevel, type GameState } from './GameState'
import { LEVELS } from '../data/levels'

const OBSTACLE_MARGIN = 50

export class Game {
  app = new Application()
  layers!: Layers
  private layout!: FieldLayout
  private state!: GameState
  private obstacleViews: ObstacleView[] = []
  private runeViews: RuneView[] = []
  private puffViews = new Map<string, MiasmaPuffView>()

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
    this.state = loadLevel(LEVELS[0], this.layout.miasmaField.width, this.layout.miasmaField.height)

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
      this.obstacleViews.push(view)
    }
  }

  private buildRuneViews(): void {
    for (const rune of this.state.inventory.slots) {
      if (!rune) continue
      const view = new RuneView(rune)
      this.layers.inventory.addChild(view.container)
      this.runeViews.push(view)
    }
  }

  private buildPuffViews(): void {
    for (const puff of this.state.miasmaPuffs) {
      const view = new MiasmaPuffView()
      this.layers.miasmaField.addChild(view.graphic)
      this.puffViews.set(puff.id, view)
    }
  }

  private relayout(): void {
    this.layout = computeLayout(this.app.screen.width, this.app.screen.height, this.safeAreaBottom())
    const { obstacleArea, miasmaField, inventoryBar, inventoryContentHeight } = this.layout

    this.layers.miasmaField.position.set(miasmaField.x, miasmaField.y)

    const usableW = Math.max(1, obstacleArea.width - OBSTACLE_MARGIN * 2)
    const usableH = Math.max(1, obstacleArea.height - OBSTACLE_MARGIN * 2)
    this.state.obstacles.forEach((obstacle, i) => {
      const view = this.obstacleViews[i]
      view.setPosition(
        obstacleArea.x + OBSTACLE_MARGIN + obstacle.position.x * usableW,
        obstacleArea.y + OBSTACLE_MARGIN + obstacle.position.y * usableH,
      )
    })

    const capacity = this.state.inventory.capacity
    const filledSlots = this.state.inventory.slots
      .map((rune, slotIndex) => ({ rune, slotIndex }))
      .filter((s) => s.rune !== null)
    filledSlots.forEach((slot, i) => {
      const view = this.runeViews[i]
      view.setPosition(
        inventoryBar.x + ((slot.slotIndex + 0.5) / capacity) * inventoryBar.width,
        inventoryBar.y + inventoryContentHeight / 2,
      )
    })
  }

  private update(dt: number): void {
    const w = this.layout.miasmaField.width
    const h = this.layout.miasmaField.height
    for (const puff of this.state.miasmaPuffs) {
      puff.position.x = clamp(puff.position.x + puff.velocity.x * dt, 0, w)
      puff.position.y = clamp(puff.position.y + puff.velocity.y * dt, 0, h)
      if (puff.position.x <= 0 || puff.position.x >= w) puff.velocity.x *= -1
      if (puff.position.y <= 0 || puff.position.y >= h) puff.velocity.y *= -1

      this.puffViews.get(puff.id)?.sync(puff)
    }
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
