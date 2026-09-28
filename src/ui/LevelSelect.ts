import './ui.css'
import type { LevelData } from '../sim/types'
import { addFiligree, divider } from './ornament'

export interface LevelSelectActions {
  levels: LevelData[]
  isCompleted: (id: string) => boolean
  onSelect: (index: number) => void
  onBack: () => void
  onHowToPlay: () => void
  // Guaranteed-fail fixtures for manually verifying the loss condition,
  // only passed (non-empty) when ?debug=1 is active; renders as a small
  // separate section, invisible in the normal player experience.
  debugLevels?: LevelData[]
  onSelectDebug?: (index: number) => void
}

// A small gilt seal for completed levels.
const SEAL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="9.5" stroke-width="1.2"/><circle cx="12" cy="12" r="7" stroke-width=".7" opacity=".6"/>' +
  '<path d="M8.2 12.3l2.5 2.5 5-5.4" stroke-width="1.8"/></svg>'

// All levels are unlocked from the start (curated pack, not a
// progression game); the seal is pure feedback, never a gate.
export function showLevelSelect(actions: LevelSelectActions): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = 'screen levels'

  const title = document.createElement('h2')
  title.className = 'levels-title gilt-text'
  title.textContent = 'Select a Level'

  const list = document.createElement('div')
  list.className = 'level-list panel'
  addFiligree(list)
  actions.levels.forEach((level, index) => {
    const button = document.createElement('button')
    button.className = 'level-btn'
    const num = document.createElement('span')
    num.className = 'level-num'
    num.textContent = String(index + 1)
    const name = document.createElement('span')
    name.className = 'level-name'
    name.textContent = level.name
    button.append(num, name)
    if (actions.isCompleted(level.id)) {
      const seal = document.createElement('span')
      seal.className = 'level-seal'
      seal.setAttribute('aria-label', 'completed')
      seal.innerHTML = SEAL
      button.append(seal)
    }
    button.addEventListener('click', () => actions.onSelect(index))
    list.appendChild(button)
  })

  const debugSection = document.createElement('div')
  debugSection.className = 'levels-debug'
  if (actions.debugLevels && actions.debugLevels.length > 0 && actions.onSelectDebug) {
    const debugTitle = document.createElement('div')
    debugTitle.className = 'levels-debug-title'
    debugTitle.textContent = 'Debug: Fail Tests'
    debugSection.append(debugTitle)
    actions.debugLevels.forEach((level, index) => {
      const button = document.createElement('button')
      button.className = 'level-btn'
      button.textContent = level.name
      button.addEventListener('click', () => actions.onSelectDebug?.(index))
      debugSection.appendChild(button)
    })
  }

  const footer = document.createElement('div')
  footer.className = 'levels-footer'
  const howButton = document.createElement('button')
  howButton.className = 'btn ghost'
  howButton.textContent = 'How to play'
  howButton.addEventListener('click', actions.onHowToPlay)
  const backButton = document.createElement('button')
  backButton.className = 'btn ghost'
  backButton.textContent = 'Back'
  backButton.addEventListener('click', actions.onBack)
  footer.append(howButton, backButton)

  overlay.append(title, divider(), list, debugSection, footer)
  document.body.appendChild(overlay)
  return overlay
}
