import { loadLevel, type GameState } from './GameState'
import type { LevelConfig } from '../data/levels/level1'
import { createEventBus } from './EventBus'
import { computeLayout, type Rect } from './Layout'
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './VirtualScreen'
import { OBSTACLE_MARGIN } from './GameScene'
import { DragPlacementSystem } from '../systems/DragPlacementSystem'
import { MiasmaFieldSystem } from '../systems/MiasmaFieldSystem'
import { AttractionFillSystem } from '../systems/AttractionFillSystem'
import { DetonationSystem } from '../systems/DetonationSystem'
import { ObstacleHealthSystem } from '../systems/ObstacleHealthSystem'
import { ObstacleGrowthSystem } from '../systems/ObstacleGrowthSystem'
import { RuneGrowthSystem } from '../systems/RuneGrowthSystem'
import { RuneSupplySystem } from '../systems/RuneSupplySystem'
import { WinFailSystem, type GameOutcome } from '../systems/WinFailSystem'
import { createStrategy } from '../supply'
import type { Id } from './types'

export interface HeadlessAgentContext {
  state: GameState
  dragSystem: DragPlacementSystem
  fieldBounds: Rect
}

export interface HeadlessSimOptions {
  // Called once per tick before systems update — a test-supplied "player"
  // (e.g. the random-play agent) acts on `ctx` here via dragSystem.tryPlace.
  agent?: (ctx: HeadlessAgentContext, dt: number, elapsedSeconds: number) => void
  maxSeconds?: number
  dt?: number
}

export interface HeadlessSimResult {
  outcome: GameOutcome
  elapsedSeconds: number
  state: GameState
}

// Render-free reproduction of GameScene's system wiring and per-tick update
// order (mount()/update()) — same systems, same sequence, just no PixiJS
// views. Lets tests (and this simulation) exercise a level exactly as real
// play would, including obstacle/rune world positions (which several
// systems depend on via a position-lookup callback), without a browser.
export function runHeadlessSim(level: LevelConfig, options: HeadlessSimOptions = {}): HeadlessSimResult {
  const { agent, maxSeconds = 300, dt = 1 / 30 } = options

  const layout = computeLayout(VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
  const obstacleGrowth = new ObstacleGrowthSystem()
  const runeGrowth = new RuneGrowthSystem()
  const state = loadLevel(level, layout.miasmaField, obstacleGrowth)
  const bus = createEventBus()
  const viewPositions = new Map<Id, { x: number; y: number }>()

  const dragSystem = new DragPlacementSystem(state, bus, (id) => viewPositions.get(id))
  const attractionSystem = new AttractionFillSystem(state, bus, (id) => viewPositions.get(id))
  new DetonationSystem(state, bus, () => layout.miasmaField, runeGrowth, (id) => viewPositions.get(id))
  new ObstacleHealthSystem(state, bus, obstacleGrowth, (id) => viewPositions.get(id))
  const supplySystem = new RuneSupplySystem(state, level, bus, createStrategy(level.supply), runeGrowth)
  const winFailSystem = new WinFailSystem(state, bus, supplySystem, dragSystem, () => layout.miasmaField)
  const miasmaFieldSystem = new MiasmaFieldSystem()

  // Mirrors GameScene.relayout()'s geometry exactly (obstacle positions from
  // normalized coords within the obstacle area; idle runes at their
  // inventory slot; active runes at their frozen field position) so systems
  // that resolve distances (placement, attraction targeting) see the same
  // world the real renderer would show.
  const refreshViewPositions = (): void => {
    const { obstacleArea, inventoryBar } = layout
    const usableW = Math.max(1, obstacleArea.width - OBSTACLE_MARGIN * 2)
    const usableH = Math.max(1, obstacleArea.height - OBSTACLE_MARGIN * 2)
    for (const obstacle of state.obstacles) {
      viewPositions.set(obstacle.id, {
        x: obstacleArea.x + OBSTACLE_MARGIN + obstacle.position.x * usableW,
        y: obstacleArea.y + OBSTACLE_MARGIN + obstacle.position.y * usableH,
      })
    }
    const capacity = state.inventory.capacity
    state.inventory.slots.forEach((rune, slotIndex) => {
      if (!rune) return
      if (rune.state === 'idle') {
        viewPositions.set(rune.id, {
          x: inventoryBar.x + ((slotIndex + 0.5) / capacity) * inventoryBar.width,
          y: inventoryBar.y + inventoryBar.height / 2,
        })
      } else if (rune.fieldPosition) {
        viewPositions.set(rune.id, rune.fieldPosition)
      }
    })
  }

  const agentCtx: HeadlessAgentContext = { state, dragSystem, fieldBounds: layout.miasmaField }

  let elapsedSeconds = 0
  while (winFailSystem.outcome === 'playing' && elapsedSeconds < maxSeconds) {
    refreshViewPositions()
    agent?.(agentCtx, dt, elapsedSeconds)
    miasmaFieldSystem.update(state.miasmaPuffs, dt, layout.miasmaField)
    attractionSystem.update(dt)
    supplySystem.update(dt)
    winFailSystem.update()
    elapsedSeconds += dt
  }

  return { outcome: winFailSystem.outcome, elapsedSeconds, state }
}
