import type { ShapeSides } from '../core/types'

export function isDebugMode(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

// Orthogonal to the supply strategy (not a strategy itself) — lets you spawn
// any inner/outer shape combo on demand to test the real strategy plus
// manual spawns together, bypassing pool/capacity constraints entirely.
export function createDebugPanel(onSpawn: (inner: ShapeSides, outer: ShapeSides) => void): void {
  const panel = document.createElement('div')
  panel.style.cssText = `
    position: fixed; top: 8px; left: 8px; z-index: 1000;
    display: flex; gap: 6px; align-items: center;
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

  const button = document.createElement('button')
  button.textContent = 'Spawn rune'
  button.style.cssText = 'cursor: pointer;'
  button.addEventListener('click', () => {
    onSpawn(Number(innerSelect.value) as ShapeSides, Number(outerSelect.value) as ShapeSides)
  })

  panel.append(innerSelect, outerSelect, button)
  document.body.appendChild(panel)
}
