import './ui.css'
import type { LevelData } from '../sim/types'
import { addFiligree, divider } from './ornament'

export interface LevelSelectActions {
  levels: LevelData[]
  // Where each level sits in the deck: its section (a suit, or the Major
  // Arcana) and its mark there. Sections get a heading and a tab.
  places?: { section: { title: string }; mark: string }[]
  isCompleted: (id: string) => boolean
  onSelect: (index: number) => void
  onBack: () => void
  onHowToPlay: () => void
  // Guaranteed-fail fixtures for manually verifying the loss condition,
  // and sandboxes for trying out mechanics; only passed (non-empty) when
  // ?debug=1 is active. Renders as a small separate section, invisible in
  // the normal player experience.
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
  title.textContent = actions.places ? 'Draw a Card' : 'Select a Level'

  // The frame keeps its filigree still while the rows scroll inside it,
  // should they outgrow a short screen.
  const list = document.createElement('div')
  list.className = 'level-list panel'
  addFiligree(list)
  const rows = document.createElement('div')
  rows.className = 'level-rows'
  list.append(rows)
  // A tab per section scrolls its heading to the top of the list.
  const tabs = document.createElement('div')
  tabs.className = 'level-tabs'
  let section: { title: string } | undefined
  actions.levels.forEach((level, index) => {
    const place = actions.places?.[index]
    if (place && place.section !== section) {
      section = place.section
      const heading = document.createElement('div')
      heading.className = 'level-section gilt-text'
      heading.textContent = section.title
      rows.appendChild(heading)
      const tab = document.createElement('button')
      tab.className = 'level-tab'
      tab.textContent = section.title
      tab.addEventListener('click', () => rows.scrollTo({ top: rows.scrollTop + heading.getBoundingClientRect().top - rows.getBoundingClientRect().top, behavior: 'smooth' }))
      tabs.appendChild(tab)
    }
    const button = document.createElement('button')
    button.className = 'level-btn'
    const num = document.createElement('span')
    num.className = 'level-num'
    num.textContent = place?.mark ?? String(index + 1)
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
    rows.appendChild(button)
  })

  const debugSection = document.createElement('div')
  debugSection.className = 'levels-debug'
  if (actions.debugLevels && actions.debugLevels.length > 0 && actions.onSelectDebug) {
    const debugTitle = document.createElement('div')
    debugTitle.className = 'levels-debug-title'
    debugTitle.textContent = 'Debug: Tests and Sandboxes'
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

  overlay.append(title, divider(), ...(tabs.childElementCount ? [tabs] : []), list, debugSection, footer)
  document.body.appendChild(overlay)
  return overlay
}
