import type { LevelData } from '../sim/types'

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

// All levels are unlocked from the start (curated pack, not a
// progression game); the checkmark is pure feedback, never a gate.
export function showLevelSelect(actions: LevelSelectActions): HTMLElement {
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2000;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px;
    background: radial-gradient(circle at 50% 30%, #2a1550, #140a24 70%);
    color: white; font-family: sans-serif; text-align: center;
    padding: 24px;
  `

  const title = document.createElement('div')
  title.style.cssText = 'font-size: 24px; font-weight: bold; margin-bottom: 8px;'
  title.textContent = 'Select a Level'

  const grid = document.createElement('div')
  grid.style.cssText = 'display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 320px;'

  actions.levels.forEach((level, index) => {
    const button = document.createElement('button')
    button.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 18px; font-size: 16px; border-radius: 10px; border: none;
      cursor: pointer; background: rgba(255,255,255,0.1); color: white; text-align: left;
    `
    const label = document.createElement('span')
    label.textContent = `${index + 1}. ${level.name}`
    const check = document.createElement('span')
    check.textContent = actions.isCompleted(level.id) ? '✓' : ''
    check.style.cssText = 'color: #7cffb2; font-weight: bold; font-size: 18px;'
    button.append(label, check)
    button.addEventListener('click', () => actions.onSelect(index))
    grid.appendChild(button)
  })

  const debugSection = document.createElement('div')
  if (actions.debugLevels && actions.debugLevels.length > 0 && actions.onSelectDebug) {
    const debugTitle = document.createElement('div')
    debugTitle.style.cssText = 'font-size: 13px; opacity: 0.6; margin-top: 12px;'
    debugTitle.textContent = 'Debug: Fail Tests'

    const debugGrid = document.createElement('div')
    debugGrid.style.cssText = 'display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 320px; margin-top: 6px;'

    actions.debugLevels.forEach((level, index) => {
      const button = document.createElement('button')
      button.textContent = level.name
      button.style.cssText = `
        padding: 10px 16px; font-size: 14px; border-radius: 8px; border: 1px dashed rgba(255,255,255,0.3);
        cursor: pointer; background: rgba(255,80,80,0.08); color: white; text-align: left;
      `
      button.addEventListener('click', () => actions.onSelectDebug?.(index))
      debugGrid.appendChild(button)
    })

    debugSection.append(debugTitle, debugGrid)
  }

  const backButton = document.createElement('button')
  backButton.textContent = 'Back'
  backButton.style.cssText = `
    margin-top: 8px; padding: 10px 28px; font-size: 14px; border-radius: 8px; border: none;
    cursor: pointer; background: transparent; color: white; opacity: 0.7;
  `
  backButton.addEventListener('click', actions.onBack)

  const howButton = document.createElement('button')
  howButton.textContent = 'How to play'
  howButton.style.cssText = backButton.style.cssText
  howButton.addEventListener('click', actions.onHowToPlay)

  overlay.append(title, grid, debugSection, howButton, backButton)
  document.body.appendChild(overlay)
  return overlay
}
