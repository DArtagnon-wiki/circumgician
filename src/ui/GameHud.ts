import './ui.css'
import { createAudioControl } from './AudioControl'

export interface GameHudActions {
  onUndo: () => void
  onRestart: () => void
  onMenu: () => void
}

export interface GameHud {
  setUndoEnabled: (enabled: boolean) => void
  remove: () => void
}

const ICONS = {
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7 4 12l5 5M4.5 12H15a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  restart:
    '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
}

// Small round glyph buttons pinned top-right, clear of the obstacle zone's
// usual content. Undo dims when there is nothing to undo.
export function createGameHud(actions: GameHudActions): GameHud {
  const bar = document.createElement('div')
  bar.className = 'game-hud'
  const make = (icon: string, label: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.innerHTML = icon
    b.setAttribute('aria-label', label)
    b.addEventListener('click', onClick)
    bar.appendChild(b)
    return b
  }
  bar.appendChild(createAudioControl())
  const undo = make(ICONS.undo, 'Undo', actions.onUndo)
  make(ICONS.restart, 'Restart', actions.onRestart)
  make(ICONS.menu, 'Menu', actions.onMenu)
  document.body.appendChild(bar)

  let undoEnabled: boolean | null = null
  return {
    setUndoEnabled(enabled) {
      if (enabled === undoEnabled) return
      undoEnabled = enabled
      undo.disabled = !enabled
    },
    remove: () => bar.remove(),
  }
}
