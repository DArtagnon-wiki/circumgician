export function isDebugMode(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

export interface DebugPanelActions {
  forceDetonate: () => void
  collapseObstacles: () => void
  toggleRings: () => void
}

// Only shown with ?debug=1. Exercises detonation and collapse paths without
// playing a level through, and can draw every placed rune's catch ring.
export function createDebugPanel(actions: DebugPanelActions): HTMLElement {
  const panel = document.createElement('div')
  panel.style.cssText = `
    position: fixed; top: 8px; left: 8px; z-index: 1000; flex-direction: column; align-items: stretch;
    display: flex; gap: 6px; align-items: center; flex-wrap: wrap; max-width: 90vw;
    background: rgba(0,0,0,0.65); padding: 6px 8px; border-radius: 8px;
    font: 12px sans-serif; color: white;
  `
  const button = (label: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'cursor: pointer;'
    b.addEventListener('click', onClick)
    panel.appendChild(b)
  }
  button('Force-detonate placed', actions.forceDetonate)
  button('Collapse obstacle layers', actions.collapseObstacles)
  button('Toggle catch rings', actions.toggleRings)
  document.body.appendChild(panel)
  return panel
}
