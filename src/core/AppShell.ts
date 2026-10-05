import { Application, type Renderer } from 'pixi.js'
import { GameScene } from './GameScene'
import { PACK, DEBUG_PACK, PACK_PLACES } from '../data/levels/pack'
import type { LevelData } from '../sim/types'
import { showMenu } from '../ui/Menu'
import { showHowToPlay } from '../ui/HowToPlay'
import { showLevelSelect } from '../ui/LevelSelect'
import { showSpread } from '../ui/Spread'
import { drawReading, loadReading, markReadingCard, nextCard, saveReading } from '../ui/reading'
import { showHUD, showRunOver } from '../ui/HUD'
import { endlessBest, isLevelCompleted, markLevelCompleted, recordEndlessRun } from '../ui/progress'
import { endlessLevel } from '../sim/endless'
import { isDebugMode } from '../debug/DebugPanel'
import { textures, texturesReady } from '../render/textures'
import { MenuBackdrop } from '../render/ZoneBackground'
import { governor, quality } from '../render/Quality'

// Where each pack level sits, by id (a reading names its cards by id).
const PACK_INDEX = new Map(PACK.map((level, i) => [level.id, i]))
const inDeck = (id: string) => PACK_INDEX.has(id)

// A level played as one card of a reading: its place in the spread.
interface PlayContext {
  reading?: number
}

// Owns the single PIXI Application for the whole session (menu -> level ->
// menu round-trips reuse it, avoiding WebGL context churn) and the one
// ticker/resize subscription that drives whichever GameScene is current.
export class AppShell {
  private app = new Application()
  private scene: GameScene | null = null
  private overlay: HTMLElement | null = null
  private backdrop: MenuBackdrop | null = null // the sky behind menus
  private clock = 0

  async mount(container: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: window,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio, quality.settings.maxResolution),
      backgroundAlpha: 0,
      antialias: true,
    })
    container.appendChild(this.app.canvas)
    // `resizeTo` applies on the next animation frame — force the size now.
    this.app.renderer.resize(window.innerWidth, window.innerHeight)

    this.app.ticker.add((ticker) => {
      const dt = Math.min(ticker.deltaMS / 1000, 1 / 20)
      this.clock += dt
      if (this.scene) governor.sample(ticker.deltaMS)
      this.scene?.update(ticker.deltaMS / 1000)
      this.backdrop?.update(dt, this.clock)
    })
    governor.onChange = () => {
      this.applyResolution()
      this.scene?.applyQuality()
    }
    this.bindResize()

    this.showMenu()
    // Paint the shared textures while the (DOM) menu is up, so the first
    // level doesn't hitch on it; the menu's sky fades in once they exist.
    window.setTimeout(() => {
      textures()
      if (!this.scene) this.showBackdrop()
    }, 50)
  }

  showMenu(): void {
    this.teardownScene()
    this.clearOverlay()
    this.showBackdrop()
    this.overlay = showMenu({
      onPlay: () => this.showLevelSelect(),
      onReading: () => this.showReading(false, true),
      onEndless: () => this.startEndless(),
      onHowToPlay: () => this.showHowToPlay(),
    })
  }

  // Stacks above whatever screen is showing; closing returns to it.
  private showHowToPlay(): void {
    const el = showHowToPlay(() => el.remove())
  }

  startEndless(): void {
    this.teardownScene()
    this.clearOverlay()
    this.hideBackdrop()
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
            { score, depth: broken, bestScore: best.score, bestDepth: best.depth, improved, recap: scene.recap() },
            { onAgain: () => this.startEndless(), onMenu: () => this.showMenu(), onViewBoard: (v) => scene.setViewing(v) },
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
    this.showBackdrop()
    this.overlay = showLevelSelect({
      levels: PACK,
      places: PACK_PLACES,
      isCompleted: isLevelCompleted,
      onSelect: (index) => this.startLevel(PACK, index),
      onBack: () => this.showMenu(),
      onHowToPlay: () => this.showHowToPlay(),
      debugLevels: isDebugMode() ? DEBUG_PACK : undefined,
      onSelectDebug: (index) => this.startLevel(DEBUG_PACK, index),
    })
  }

  // The reading in progress (or a new one, drawn now), laid out as a spread.
  // From the menu, a reading already finished gives way to a new one.
  showReading(fresh = false, drawIfDone = false): void {
    let reading = loadReading(inDeck)
    if (!reading || (drawIfDone && nextCard(reading) < 0)) {
      reading = drawReading(PACK.map((level) => level.id))
      saveReading(reading)
      fresh = true
    }
    this.teardownScene()
    this.clearOverlay()
    this.showBackdrop()
    const cards = reading.ids.map((id, place) => {
      const index = PACK_INDEX.get(id)!
      return { level: PACK[index], mark: PACK_PLACES[index]?.mark ?? String(index + 1), section: PACK_PLACES[index]?.section.title ?? '', done: reading.done[place] }
    })
    this.overlay = showSpread({
      cards,
      next: nextCard(reading),
      fresh,
      onPlay: (place) => this.playReadingCard(place),
      onDraw: () => {
        saveReading(drawReading(PACK.map((level) => level.id)))
        this.showReading(true)
      },
      onBack: () => this.showMenu(),
    })
  }

  private playReadingCard(place: number): void {
    const reading = loadReading(inDeck)
    if (!reading) return this.showReading()
    this.startLevel(PACK, PACK_INDEX.get(reading.ids[place])!, { reading: place })
  }

  // Debug fixtures run through the same path but never mark completion.
  startLevel(pack: LevelData[], index: number, context: PlayContext = {}): void {
    this.teardownScene()
    this.clearOverlay()
    this.hideBackdrop()
    const level = pack[index]
    const isReal = pack === PACK
    const scene = new GameScene()
    scene.mount(this.app, level, {
      onWon: () => {
        if (isReal) markLevelCompleted(level.id)
        const reading = context.reading !== undefined ? loadReading(inDeck) : null
        if (reading && context.reading !== undefined) markReadingCard(reading, context.reading)
        this.showResult('won', pack, index, context)
      },
      onLost: () => this.showResult('lost', pack, index, context),
      onMenu: () => (context.reading !== undefined ? this.showReading() : this.showLevelSelect()),
    })
    this.scene = scene
  }

  // The result overlays the frozen board; Undo on a loss drops back into it.
  // In a reading, Next goes to the next card still to win (or back to the
  // spread once all are), and the way back is to the spread.
  private showResult(result: 'won' | 'lost', pack: LevelData[], index: number, context: PlayContext = {}): void {
    const hasNext = pack === PACK && index < pack.length - 1
    const reading = context.reading !== undefined ? loadReading(inDeck) : null
    const nextPlace = reading ? nextCard(reading) : -1
    const next = reading
      ? { onNext: nextPlace >= 0 ? () => this.playReadingCard(nextPlace) : () => this.showReading(), nextLabel: nextPlace >= 0 ? 'Next card' : 'Finish the reading' }
      : { onNext: hasNext ? () => this.startLevel(pack, index + 1) : undefined }
    this.clearOverlay()
    this.overlay = showHUD(
      result,
      {
        onRetry: () => this.startLevel(pack, index, context),
        ...next,
        onUndo:
          result === 'lost' && this.scene?.sim.canUndo
            ? () => {
                this.clearOverlay()
                this.scene?.undo()
              }
            : undefined,
        onLevelSelect: () => (reading ? this.showReading() : this.showLevelSelect()),
        ...(reading ? { backLabel: 'Reading' } : {}),
        onViewBoard: (v) => this.scene?.setViewing(v),
      },
      this.scene?.recap(),
    )
  }

  private teardownScene(): void {
    this.scene?.destroy()
    this.scene = null
    governor.restart() // the next scene's first moments are uploads and JIT
  }

  // The lowest detail tier also caps the render resolution: fill rate is
  // what a phone GPU runs out of first.
  private applyResolution(): void {
    const res = Math.min(window.devicePixelRatio, quality.settings.maxResolution)
    if (res !== this.app.renderer.resolution) this.app.renderer.resize(window.innerWidth, window.innerHeight, res)
  }

  private clearOverlay(): void {
    this.overlay?.remove()
    this.overlay = null
    this.scene?.setViewing(false)
  }

  // Only once the textures exist (mount paints them just after the menu
  // appears); until then the menu sits on the plain page background.
  private showBackdrop(): void {
    if (this.backdrop || !texturesReady()) return
    this.backdrop = new MenuBackdrop()
    this.backdrop.fit(window.innerWidth, window.innerHeight)
    this.app.stage.addChildAt(this.backdrop.container, 0)
  }

  private hideBackdrop(): void {
    this.backdrop?.container.destroy({ children: true })
    this.backdrop = null
  }

  private bindResize(): void {
    const relayout = () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight)
      this.scene?.relayout()
      this.backdrop?.fit(window.innerWidth, window.innerHeight)
    }
    window.visualViewport?.addEventListener('resize', relayout)
    window.visualViewport?.addEventListener('scroll', relayout)

    const renderer = this.app.renderer as Renderer
    const suppress = (e: TouchEvent) => e.preventDefault()
    renderer.canvas.addEventListener('touchmove', suppress, { passive: false })
    renderer.canvas.addEventListener('gesturestart', suppress as EventListener, { passive: false })
  }
}
