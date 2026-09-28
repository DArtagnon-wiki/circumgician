import './ui.css'
import { addFiligree, divider } from './ornament'

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
  const card = resultCard(overlay)

  const title = document.createElement('div')
  title.className = 'result-title gilt-text'
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

  card.append(title, divider(), buttonRow)
  document.body.appendChild(overlay)
  return overlay
}

// A frosted, filigreed card centered in the overlay.
function resultCard(overlay: HTMLElement): HTMLElement {
  const card = document.createElement('div')
  card.className = 'result-card panel'
  addFiligree(card)
  overlay.append(card)
  return card
}

export interface RunOverInfo {
  score: number
  depth: number
  bestScore: number
  bestDepth: number
  improved: boolean
}

// Endless: the single life is spent.
export function showRunOver(info: RunOverInfo, actions: { onAgain: () => void; onMenu: () => void }): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = 'result-overlay lost'
  const card = resultCard(overlay)
  const title = document.createElement('div')
  title.className = 'result-title gilt-text'
  title.textContent = info.improved ? 'A new height.' : 'The circle closes.'
  const stats = document.createElement('div')
  stats.className = 'result-stats'
  stats.innerHTML = `Score <b>${info.score}</b> &middot; ${info.depth} layers<br><span class="best">Best ${info.bestScore} &middot; ${info.bestDepth} layers</span>`
  const row = document.createElement('div')
  row.className = 'result-buttons'
  const again = document.createElement('button')
  again.className = 'btn primary'
  again.textContent = 'Again'
  again.addEventListener('click', actions.onAgain)
  const menu = document.createElement('button')
  menu.className = 'btn'
  menu.textContent = 'Menu'
  menu.addEventListener('click', actions.onMenu)
  row.append(again, menu)
  card.append(title, divider(), stats, row)
  document.body.appendChild(overlay)
  return overlay
}
