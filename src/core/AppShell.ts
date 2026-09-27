import { Application, type Renderer } from 'pixi.js'
import { GameScene } from './GameScene'
import { PACK, DEBUG_PACK } from '../data/levels/pack'
import type { LevelData } from '../sim/types'
import { showMenu } from '../ui/Menu'
import { showHowToPlay } from '../ui/HowToPlay'
import { showLevelSelect } from '../ui/LevelSelect'
import { showHUD, showRunOver } from '../ui/HUD'
import { endlessBest, isLevelCompleted, markLevelCompleted, recordEndlessRun } from '../ui/progress'
import { endlessLevel } from '../sim/endless'
import { isDebugMode } from '../debug/DebugPanel'

// Owns the single PIXI Application for the whole session (menu -> level ->
// menu round-trips reuse it, avoiding WebGL context churn) and the one
// ticker/resize subscription that drives whichever GameScene is current.
export class AppShell {
  private app = new Application()
  private scene: GameScene | null = null
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
    // `resizeTo` applies on the next animation frame — force the size now.
    this.app.renderer.resize(window.innerWidth, window.innerHeight)

    this.app.ticker.add((ticker) => this.scene?.update(ticker.deltaMS / 1000))
    this.bindResize()

    this.showMenu()
  }

  showMenu(): void {
    this.teardownScene()
    this.clearOverlay()
    this.overlay = showMenu({ onPlay: () => this.showLevelSelect(), onEndless: () => this.startEndless(), onHowToPlay: () => this.showHowToPlay() })
  }

  // Stacks above whatever screen is showing; closing returns to it.
  private showHowToPlay(): void {
    const el = showHowToPlay(() => el.remove())
  }

  startEndless(): void {
    this.teardownScene()
    this.clearOverlay()
    const seed = (Math.random() * 2 ** 31) >>> 0
    const scene = new GameScene()
    scene.mount(
      this.app,
      endlessLevel(seed),
      {
        onWon: () => {},
        onLost: () => {
          const { score, broken } = scene.sim.state
          const improved = recordEndlessRun(score, broken)
          const best = endlessBest()
          this.clearOverlay()
          this.overlay = showRunOver(
            { score, depth: broken, bestScore: best.score, bestDepth: best.depth, improved },
            { onAgain: () => this.startEndless(), onMenu: () => this.showMenu() },
          )
        },
        onMenu: () => this.showMenu(),
        onRestart: () => this.startEndless(),
      },
      { endless: true },
    )
    this.scene = scene
  }

  showLevelSelect(): void {
    this.teardownScene()
    this.clearOverlay()
    this.overlay = showLevelSelect({
      levels: PACK,
      isCompleted: isLevelCompleted,
      onSelect: (index) => this.startLevel(PACK, index),
      onBack: () => this.showMenu(),
      onHowToPlay: () => this.showHowToPlay(),
      debugLevels: isDebugMode() ? DEBUG_PACK : undefined,
      onSelectDebug: (index) => this.startLevel(DEBUG_PACK, index),
    })
  }

  // Debug fixtures run through the same path but never mark completion.
  startLevel(pack: LevelData[], index: number): void {
    this.teardownScene()
    this.clearOverlay()
    const level = pack[index]
    const isReal = pack === PACK
    const scene = new GameScene()
    scene.mount(this.app, level, {
      onWon: () => {
        if (isReal) markLevelCompleted(level.id)
        this.showResult('won', pack, index)
      },
      onLost: () => this.showResult('lost', pack, index),
      onMenu: () => this.showLevelSelect(),
    })
    this.scene = scene
  }

  // The result overlays the frozen board; Undo on a loss drops back into it.
  private showResult(result: 'won' | 'lost', pack: LevelData[], index: number): void {
    const hasNext = pack === PACK && index < pack.length - 1
    this.clearOverlay()
    this.overlay = showHUD(result, {
      onRetry: () => this.startLevel(pack, index),
      onNext: hasNext ? () => this.startLevel(pack, index + 1) : undefined,
      onUndo:
        result === 'lost' && this.scene?.sim.canUndo
          ? () => {
              this.clearOverlay()
              this.scene?.undo()
            }
          : undefined,
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
