import { Application, Graphics, type Renderer } from 'pixi.js'
import { createLayers, type Layers } from '../render/Layers'
import { BACKGROUND_BOTTOM, BACKGROUND_TOP, MIASMA_COLOR } from '../render/Theme'
import { clamp, randRange } from '../utils/math'

// Day-0 placeholder ambient puff: purely decorative until MiasmaPuff/AttractionFillSystem land.
interface AmbientPuff {
  graphic: Graphics
  x: number
  y: number
  vx: number
  vy: number
}

export class Game {
  app = new Application()
  layers!: Layers
  private puffs: AmbientPuff[] = []

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
    // force the correct size now so the first draw isn't sized off a stale default canvas.
    this.app.renderer.resize(window.innerWidth, window.innerHeight)

    this.layers = createLayers()
    this.app.stage.addChild(this.layers.root)

    this.drawBackground()
    this.spawnAmbientPuffs(18)

    this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000))
    this.bindResize()
  }

  private drawBackground(): void {
    const draw = () => {
      const w = this.fieldWidth()
      const h = this.fieldHeight()
      this.layers.background.removeChildren()
      const g = new Graphics()
      g.rect(0, 0, w, h).fill({ color: BACKGROUND_TOP })
      // Cheap vertical gradient: layered translucent bands rather than a shader.
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

  private spawnAmbientPuffs(count: number): void {
    for (let i = 0; i < count; i++) {
      const graphic = new Graphics()
      this.layers.miasmaField.addChild(graphic)
      this.puffs.push({
        graphic,
        x: randRange(0, this.fieldWidth()),
        y: randRange(0, this.fieldHeight()),
        vx: randRange(-12, 12),
        vy: randRange(-12, 12),
      })
    }
  }

  private fieldWidth(): number {
    return this.app.screen.width
  }

  private fieldHeight(): number {
    return this.app.screen.height
  }

  private update(dt: number): void {
    const w = this.fieldWidth()
    const h = this.fieldHeight()
    for (const puff of this.puffs) {
      puff.x = clamp(puff.x + puff.vx * dt, 0, w)
      puff.y = clamp(puff.y + puff.vy * dt, 0, h)
      if (puff.x <= 0 || puff.x >= w) puff.vx *= -1
      if (puff.y <= 0 || puff.y >= h) puff.vy *= -1

      // Cheap glow: a large low-alpha circle behind a crisp small one, no filters.
      puff.graphic.clear()
      puff.graphic
        .circle(puff.x, puff.y, 18)
        .fill({ color: MIASMA_COLOR, alpha: 0.12 })
        .circle(puff.x, puff.y, 6)
        .fill({ color: MIASMA_COLOR, alpha: 0.85 })
    }
  }

  private bindResize(): void {
    const relayout = () => this.app.renderer.resize(window.innerWidth, window.innerHeight)
    window.visualViewport?.addEventListener('resize', relayout)
    window.visualViewport?.addEventListener('scroll', relayout)

    const renderer = this.app.renderer as Renderer
    const suppress = (e: TouchEvent) => e.preventDefault()
    renderer.canvas.addEventListener('touchmove', suppress, { passive: false })
    renderer.canvas.addEventListener('gesturestart', suppress as EventListener, { passive: false })
  }
}
