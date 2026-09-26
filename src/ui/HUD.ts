export type HUDResult = 'won' | 'lost'

export interface HUDActions {
  onRetry: () => void
  onNext?: () => void // omitted on the final level
  onLevelSelect: () => void
}

export function showHUD(result: HUDResult, actions: HUDActions): HTMLElement {
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

  const buttonRow = document.createElement('div')
  buttonRow.style.cssText = 'display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;'

  function makeButton(label: string, onClick: () => void, primary: boolean): HTMLButtonElement {
    const button = document.createElement('button')
    button.textContent = label
    button.style.cssText = `
      padding: 12px 22px; font-size: 15px; border-radius: 8px; border: none;
      cursor: pointer; font-weight: bold;
      background: ${primary ? 'white' : 'rgba(255,255,255,0.15)'};
      color: ${primary ? '#140a24' : 'white'};
    `
    button.addEventListener('click', onClick)
    return button
  }

  if (result === 'won' && actions.onNext) {
    buttonRow.append(makeButton('Next Level', actions.onNext, true))
    buttonRow.append(makeButton('Retry', actions.onRetry, false))
  } else {
    buttonRow.append(makeButton(result === 'won' ? 'Play Again' : 'Try Again', actions.onRetry, true))
  }
  buttonRow.append(makeButton('Level Select', actions.onLevelSelect, false))

  overlay.append(title, subtitle, buttonRow)
  document.body.appendChild(overlay)
  return overlay
}
