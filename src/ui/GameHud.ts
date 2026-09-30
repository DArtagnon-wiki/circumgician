import './ui.css'
import { createAudioControl } from './AudioControl'

export interface GameHudActions {
  onUndo?: () => void // omitted in endless (one life)
  onRestart: () => void
  onMenu: () => void
  showScore?: boolean
}

export interface GameHud {
  setUndoEnabled: (enabled: boolean) => void
  setScore: (score: number, layers: number) => void
  // A brief two-line banner over the board (a small kicker above a title in
  // `color`) that fades on its own and never takes input.
  announce: (kicker: string, title: string, color: string) => void
  remove: () => void
}

const ICONS = {
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7 4 12l5 5M4.5 12H15a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  restart:
    '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
}

// Small round glyph buttons pinned top-right, clear of the obstacle zone's
// usual content. Undo dims when there is nothing to undo. Endless adds a
// score readout top-left.
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
  const undo = actions.onUndo ? make(ICONS.undo, 'Undo', actions.onUndo) : null
  make(ICONS.restart, 'Restart', actions.onRestart)
  make(ICONS.menu, 'Menu', actions.onMenu)
  document.body.appendChild(bar)

  let score: HTMLElement | null = null
  if (actions.showScore) {
    score = document.createElement('div')
    score.className = 'endless-score gilt-text'
    document.body.appendChild(score)
  }

  const banners = new Set<HTMLElement>()
  let undoEnabled: boolean | null = null
  let shown = ''
  return {
    setUndoEnabled(enabled) {
      if (!undo || enabled === undoEnabled) return
      undoEnabled = enabled
      undo.disabled = !enabled
    },
    setScore(value, layers) {
      if (!score) return
      const text = `${value} · ${layers} layers`
      if (text === shown) return
      shown = text
      score.textContent = text
      score.classList.remove('bump')
      void score.offsetWidth // restart the bump animation
      score.classList.add('bump')
    },
    announce(kicker, title, color) {
      // A newer banner takes over: any still showing fades out from where it is.
      for (const old of banners) {
        old.style.opacity = getComputedStyle(old).opacity
        old.classList.add('leaving')
      }
      const el = document.createElement('div')
      el.className = 'hud-announce'
      el.style.setProperty('--hue', color)
      const k = document.createElement('div')
      k.className = 'kicker'
      k.textContent = kicker
      const t = document.createElement('div')
      t.className = 'title'
      t.textContent = title
      el.append(k, t)
      document.body.appendChild(el)
      banners.add(el)
      el.addEventListener('animationend', () => {
        el.remove()
        banners.delete(el)
      })
    },
    remove: () => {
      bar.remove()
      score?.remove()
      for (const el of banners) el.remove()
      banners.clear()
    },
  }
}
