export type HUDResult = 'won' | 'lost'

export function showHUD(result: HUDResult, onRestart: () => void): void {
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2000;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px;
    background: rgba(10, 5, 20, 0.85);
    color: white; font-family: sans-serif; text-align: center;
    padding: 24px;
  `

  const title = document.createElement('div')
  title.style.cssText = 'font-size: 32px; font-weight: bold;'
  title.textContent = result === 'won' ? 'Level Cleared!' : 'No More Moves'

  const subtitle = document.createElement('div')
  subtitle.style.cssText = 'font-size: 16px; opacity: 0.8; max-width: 320px;'
  subtitle.textContent =
    result === 'won'
      ? 'Every obstacle has been cleared.'
      : 'No rune can be introduced or placed while obstacles remain.'

  const button = document.createElement('button')
  button.textContent = result === 'won' ? 'Play Again' : 'Try Again'
  button.style.cssText = `
    padding: 12px 24px; font-size: 16px; border-radius: 8px; border: none;
    cursor: pointer; background: white; color: #140a24; font-weight: bold;
  `
  button.addEventListener('click', onRestart)

  overlay.append(title, subtitle, button)
  document.body.appendChild(overlay)
}
