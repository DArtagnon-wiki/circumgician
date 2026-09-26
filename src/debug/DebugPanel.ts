import type { ShapeSides } from '../core/types'

export function isDebugMode(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

export interface DebugPanelActions {
  spawn: (inner: ShapeSides, outer: ShapeSides) => void
  forceDamageObstacles: () => void
  forceDetonateActive: () => void
}

// Orthogonal to the supply strategy (not a strategy itself) — lets you spawn
// any inner/outer shape combo on demand, and force-trigger the layer-collapse
// and detonation/promotion paths, to exercise them without grinding a real
// level turn by turn.
export function createDebugPanel(actions: DebugPanelActions): void {
  const panel = document.createElement('div')
  panel.style.cssText = `
    position: fixed; top: 8px; left: 8px; z-index: 1000;
    display: flex; gap: 6px; align-items: center; flex-wrap: wrap; max-width: 90vw;
    background: rgba(0,0,0,0.65); padding: 6px 8px; border-radius: 8px;
    font: 12px sans-serif; color: white;
  `

  const innerSelect = document.createElement('select')
  const outerSelect = document.createElement('select')
  for (const select of [innerSelect, outerSelect]) {
    for (let sides = 3; sides <= 8; sides++) {
      const opt = document.createElement('option')
      opt.value = String(sides)
      opt.textContent = `${sides}-gon`
      select.appendChild(opt)
    }
  }
  outerSelect.value = '4'

  const spawnButton = document.createElement('button')
  spawnButton.textContent = 'Spawn rune'
  spawnButton.style.cssText = 'cursor: pointer;'
  spawnButton.addEventListener('click', () => {
    actions.spawn(Number(innerSelect.value) as ShapeSides, Number(outerSelect.value) as ShapeSides)
  })

  const damageButton = document.createElement('button')
  damageButton.textContent = 'Force-damage obstacles'
  damageButton.style.cssText = 'cursor: pointer;'
  damageButton.addEventListener('click', () => actions.forceDamageObstacles())

  const detonateButton = document.createElement('button')
  detonateButton.textContent = 'Force-detonate active runes'
  detonateButton.style.cssText = 'cursor: pointer;'
  detonateButton.addEventListener('click', () => actions.forceDetonateActive())

  panel.append(innerSelect, outerSelect, spawnButton, damageButton, detonateButton)
  document.body.appendChild(panel)
}
