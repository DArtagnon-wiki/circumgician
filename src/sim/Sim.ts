import { createSimBus, type SimBus } from './events'
import { loadLevel } from './loadLevel'
import { kickMote, updateCatching, updateMotion } from './motion'
import { isCertainLoss, isWon } from './progress'
import { canPlace, damageObstacle, detonateRune, findLink, placeRune, relinkAll, type EnsureLayers } from './rules'
import type { LevelData, Obstacle, Rune, SimState, Vec2 } from './types'

const LOSS_CHECK_INTERVAL = 0.25

export interface SimOptions {
  seed?: number
  // Endless: grow rune/obstacle stacks on demand (pure, keyed by seed+depth).
  ensureLayers?: EnsureLayers
  // Off for mechanics tests and editor sandboxes on unwinnable boards.
  lossCheck?: boolean
}

// The whole rules engine, render-free. The scene (or a headless test) calls
// step() every frame and place()/detonate()/undo() on player input, and
// listens on `bus` for animation cues. `state` is plain data throughout.
export class Sim {
  state: SimState
  readonly bus: SimBus = createSimBus()
  private readonly level: LevelData
  private readonly opts: SimOptions
  private history: SimState[] = []
  private sinceLossCheck = 0

  constructor(level: LevelData, opts: SimOptions = {}) {
    this.level = level
    this.opts = opts
    this.state = loadLevel(level, opts.seed ?? 1)
    opts.ensureLayers?.(this.state)
  }

  rune(id: string): Rune | undefined {
    return this.state.runes.find((r) => r.id === id)
  }

  get canUndo(): boolean {
    return this.history.length > 0
  }

  step(dt: number): void {
    const s = this.state
    s.time += dt
    updateMotion(s, this.bus, dt)
    if (s.status !== 'playing') return
    updateCatching(s, this.bus)
    this.sinceLossCheck += dt
    if (this.sinceLossCheck >= LOSS_CHECK_INTERVAL) {
      this.sinceLossCheck = 0
      this.checkLoss()
    }
  }

  canPlace(runeId: string, pos: Vec2): boolean {
    const rune = this.rune(runeId)
    return !!rune && this.state.status === 'playing' && canPlace(this.state, rune, pos)
  }

  previewLink(runeId: string, pos: Vec2): Obstacle | null {
    const rune = this.rune(runeId)
    return rune ? findLink(this.state, rune, pos) : null
  }

  place(runeId: string, pos: Vec2): boolean {
    const rune = this.rune(runeId)
    if (!rune || !this.canPlace(runeId, pos)) return false
    this.snapshot()
    placeRune(this.state, this.bus, rune, pos)
    return true
  }

  // `force` (debug only) detonates a charging rune as if it were full.
  detonate(runeId: string, force = false): boolean {
    const rune = this.rune(runeId)
    if (!rune || this.state.status !== 'playing') return false
    if (rune.state !== 'full' && !(force && rune.state === 'charging')) return false
    this.snapshot()
    detonateRune(this.state, this.bus, rune, this.opts.ensureLayers)
    this.afterAction()
    return true
  }

  private afterAction(): void {
    if (isWon(this.state)) {
      this.state.status = 'won'
      this.bus.emit('sim:won')
    } else {
      this.checkLoss()
    }
  }

  // The player's tap near a mote shoves it away from the touch point. Not an
  // undo step (it only moves a mote, and undo restores whole boards anyway).
  kick(moteId: string, from: Vec2): boolean {
    if (this.state.status !== 'playing') return false
    const mote = this.state.motes.find((m) => m.id === moteId)
    return !!mote && kickMote(mote, from)
  }

  // Debug: collapse the current layer of every obstacle.
  debugCollapseAll(): void {
    if (this.state.status !== 'playing') return
    this.snapshot()
    for (const o of this.state.obstacles) if (!o.cleared) damageObstacle(this.state, this.bus, o, o.hp, this.opts.ensureLayers)
    relinkAll(this.state, this.bus)
    this.afterAction()
  }

  // Restores the board exactly as it was before the last action, but keeps
  // the current RNG state so drift plays out fresh.
  undo(): boolean {
    const prev = this.history.pop()
    if (!prev) return false
    prev.rng = this.state.rng
    this.state = prev
    this.sinceLossCheck = 0
    this.bus.emit('sim:restored')
    return true
  }

  restart(seed = this.state.rng): void {
    this.history = []
    this.state = loadLevel(this.level, seed)
    this.opts.ensureLayers?.(this.state)
    this.sinceLossCheck = 0
    this.bus.emit('sim:restored')
  }

  checkLoss(): void {
    if (this.opts.lossCheck === false) return
    if (this.state.status === 'playing' && isCertainLoss(this.state)) {
      this.state.status = 'lost'
      this.bus.emit('sim:lost')
    }
  }

  private snapshot(): void {
    this.history.push(structuredClone(this.state))
  }
}
