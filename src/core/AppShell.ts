import { Application, type Renderer } from 'pixi.js'
import { GameScene } from './GameScene'
import { LEVELS } from '../data/levels'
import { showMenu } from '../ui/Menu'
import { showLevelSelect } from '../ui/LevelSelect'
import { showHUD } from '../ui/HUD'
import { isLevelCompleted, markLevelCompleted } from '../ui/progress'

// Owns the single PIXI Application for the whole session (menu -> level ->
// menu round-trips reuse it, avoiding WebGL context churn) and the one
// ticker/resize subscription that drives whichever GameScene is current.
export class AppShell {
  private app = new Application()
  private scene: GameScene | null = null
  private currentLevelIndex = 0
  private overlay: HTMLElement | null = null

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

    this.app.ticker.add((ticker) => this.scene?.update(ticker.deltaMS / 1000))
    this.bindResize()

    this.showMenu()
  }

  showMenu(): void {
    this.teardownScene()
    this.clearOverlay()
    this.overlay = showMenu({ onPlay: () => this.showLevelSelect() })
  }

  showLevelSelect(): void {
    this.teardownScene()
    this.clearOverlay()
    this.overlay = showLevelSelect({
      levels: LEVELS,
      isCompleted: isLevelCompleted,
      onSelect: (index) => this.startLevel(index),
      onBack: () => this.showMenu(),
    })
  }

  startLevel(index: number): void {
    this.teardownScene()
    this.clearOverlay()
    this.currentLevelIndex = index
    const scene = new GameScene()
    scene.mount(this.app, LEVELS[index], {
      onWon: () => this.showResult('won'),
      onLost: () => this.showResult('lost'),
    })
    this.scene = scene
  }

  // Result HUD overlays the frozen final board rather than tearing the scene
  // down immediately — Retry/Next/Level Select each start fresh from there.
  private showResult(result: 'won' | 'lost'): void {
    if (result === 'won') markLevelCompleted(LEVELS[this.currentLevelIndex].id)
    const hasNext = this.currentLevelIndex < LEVELS.length - 1
    this.clearOverlay()
    this.overlay = showHUD(result, {
      onRetry: () => this.startLevel(this.currentLevelIndex),
      onNext: hasNext ? () => this.startLevel(this.currentLevelIndex + 1) : undefined,
      onLevelSelect: () => this.showLevelSelect(),
    })
  }

  private teardownScene(): void {
    this.scene?.destroy()
    this.scene = null
  }

  private clearOverlay(): void {
    this.overlay?.remove()
    this.overlay = null
  }

  private bindResize(): void {
    const relayout = () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight)
      this.scene?.relayout()
    }
    window.visualViewport?.addEventListener('resize', relayout)
    window.visualViewport?.addEventListener('scroll', relayout)

    const renderer = this.app.renderer as Renderer
    const suppress = (e: TouchEvent) => e.preventDefault()
    renderer.canvas.addEventListener('touchmove', suppress, { passive: false })
    renderer.canvas.addEventListener('gesturestart', suppress as EventListener, { passive: false })
  }
}
