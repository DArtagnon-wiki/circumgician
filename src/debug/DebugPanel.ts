export function isDebugMode(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

export interface DebugPanelActions {
  forceDetonate: () => void
  collapseObstacles: () => void
  toggleRings: () => void
  cycleTier: () => string // returns the new button label
  stats: () => string // refreshed a few times a second
}

// Only shown with ?debug=1. Exercises detonation and collapse paths without
// playing a level through, and can draw every placed rune's catch ring.
// It stays out of the way: a small gear in the corner, and the tools open
// only when asked for (the obstacles, and their details, sit right under
// where an open panel would be).
export function createDebugPanel(actions: DebugPanelActions): HTMLElement {
  const root = document.createElement('div')
  root.style.cssText = 'position: fixed; top: 6px; left: 6px; z-index: 1000; font: 12px sans-serif; color: white;'
  const gear = document.createElement('button')
  gear.textContent = '⚙'
  gear.title = 'Debug tools'
  gear.setAttribute('aria-label', 'Debug tools')
  gear.setAttribute('aria-expanded', 'false')
  gear.style.cssText = `
    cursor: pointer; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 13px;
    background: rgba(0,0,0,0.45); color: rgba(255,255,255,0.8); font-size: 16px; line-height: 26px;
  `
  const panel = document.createElement('div')
  panel.style.cssText = `
    display: none; flex-direction: column; align-items: stretch; gap: 6px; margin-top: 4px;
    max-width: 90vw; background: rgba(0,0,0,0.65); padding: 6px 8px; border-radius: 8px;
  `
  gear.addEventListener('click', () => {
    const open = panel.style.display === 'none'
    panel.style.display = open ? 'flex' : 'none'
    gear.setAttribute('aria-expanded', String(open))
  })
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
  const tier = document.createElement('button')
  tier.textContent = 'Detail: auto'
  tier.style.cssText = 'cursor: pointer;'
  tier.addEventListener('click', () => (tier.textContent = actions.cycleTier()))
  panel.appendChild(tier)
  const stats = document.createElement('div')
  stats.style.cssText = 'font: 11px monospace; opacity: 0.85;'
  panel.appendChild(stats)
  const timer = window.setInterval(() => {
    if (!root.isConnected) return window.clearInterval(timer)
    if (panel.style.display !== 'none') stats.textContent = actions.stats()
  }, 250)
  root.append(gear, panel)
  document.body.appendChild(root)
  return root
}
