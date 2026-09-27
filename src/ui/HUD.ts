export type HUDResult = 'won' | 'lost'

export interface HUDActions {
  onRetry: () => void
  onNext?: () => void // omitted on the final level
  onUndo?: () => void // offered on a loss
  onLevelSelect: () => void
}

export function showHUD(result: HUDResult, actions: HUDActions): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = `result-overlay ${result}`

  const title = document.createElement('div')
  title.className = 'result-title'
  title.textContent = result === 'won' ? 'Unraveled.' : '…retry?'

  const buttonRow = document.createElement('div')
  buttonRow.className = 'result-buttons'

  function makeButton(label: string, onClick: () => void, primary: boolean): HTMLButtonElement {
    const button = document.createElement('button')
    button.textContent = label
    button.className = primary ? 'btn primary' : 'btn'
    button.addEventListener('click', onClick)
    return button
  }

  if (result === 'won') {
    if (actions.onNext) buttonRow.append(makeButton('Next', actions.onNext, true))
    buttonRow.append(makeButton('Replay', actions.onRetry, !actions.onNext))
  } else {
    buttonRow.append(makeButton('Retry', actions.onRetry, true))
    if (actions.onUndo) buttonRow.append(makeButton('Undo', actions.onUndo, false))
  }
  buttonRow.append(makeButton('Levels', actions.onLevelSelect, false))

  overlay.append(title, buttonRow)
  document.body.appendChild(overlay)
  return overlay
}
