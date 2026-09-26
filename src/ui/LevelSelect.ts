import type { LevelConfig } from '../data/levels'

export interface LevelSelectActions {
  levels: LevelConfig[]
  isCompleted: (id: string) => boolean
  onSelect: (index: number) => void
  onBack: () => void
}

// All levels are unlocked from the start (curated gift pack, not a
// progression game) — the checkmark is pure feedback, never a gate.
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

  const backButton = document.createElement('button')
  backButton.textContent = 'Back'
  backButton.style.cssText = `
    margin-top: 8px; padding: 10px 28px; font-size: 14px; border-radius: 8px; border: none;
    cursor: pointer; background: transparent; color: white; opacity: 0.7;
  `
  backButton.addEventListener('click', actions.onBack)

  overlay.append(title, grid, backButton)
  document.body.appendChild(overlay)
  return overlay
}
