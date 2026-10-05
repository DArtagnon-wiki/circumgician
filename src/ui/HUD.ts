import './ui.css'
import { addFiligree, divider } from './ornament'
import type { BoardStats, LossReason } from '../sim/types'

export type HUDResult = 'won' | 'lost'

// Everything the result screens report about an attempt.
export interface Recap extends BoardStats {
  time: number // seconds of play
  kicks: number
  undos: number
  strengthLeft: number // HP still standing, all layers (curated levels)
  lostBecause?: LossReason
}

type StatKey = 'time' | 'detonations' | 'landed' | 'wasted' | 'kicks' | 'undos' | 'strengthLeft'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const STATS: Record<StatKey, { label: string; value: (r: Recap) => string }> = {
  time: { label: 'time', value: (r) => clock(r.time) },
  detonations: { label: 'detonations', value: (r) => `${r.detonations}` },
  landed: { label: 'blows landed', value: (r) => `${r.landed}` },
  wasted: { label: 'blows wasted', value: (r) => `${r.wasted}` },
  kicks: { label: 'flicks', value: (r) => `${r.kicks}` },
  undos: { label: 'undos', value: (r) => `${r.undos}` },
  strengthLeft: { label: 'strength left', value: (r) => `${r.strengthLeft}` },
}

// A grid of numbers, then a line for the rarer things that happened.
// Wasted blows are the one stat to watch: rose when any, gilt when a win
// wasted none.
function recapBlock(recap: Recap, keys: StatKey[], won: boolean): HTMLElement[] {
  const grid = document.createElement('div')
  grid.className = 'recap'
  for (const key of keys) {
    const stat = document.createElement('div')
    stat.className = 'recap-stat'
    if (key === 'wasted' && recap.wasted) stat.classList.add('waste')
    if (key === 'wasted' && !recap.wasted && won) stat.classList.add('clean')
    const value = document.createElement('span')
    value.className = 'recap-value'
    value.textContent = STATS[key].value(recap)
    const label = document.createElement('span')
    label.className = 'recap-label'
    label.textContent = STATS[key].label
    stat.append(value, label)
    grid.append(stat)
  }
  const notes = [
    recap.unlinked ? `${plural(recap.unlinked, 'detonation')} struck nothing` : '',
    recap.burned ? `${plural(recap.burned, 'rune')} burned` : '',
    recap.destroyed ? `${plural(recap.destroyed, 'mote')} destroyed` : '',
  ].filter(Boolean)
  if (!notes.length) return [grid]
  const note = document.createElement('div')
  note.className = 'recap-note'
  note.textContent = notes.join(' · ')
  return [grid, note]
}

function subtitle(text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'result-sub'
  el.textContent = text
  return el
}

const LOSS_LINES: Record<LossReason, string> = {
  stuck: 'No moves left: nothing can fill, and nothing is ready to burst.',
}

export interface HUDActions {
  onRetry: () => void
  onNext?: () => void // omitted on the final level
  nextLabel?: string // 'Next' unless said
  onUndo?: () => void // offered on a loss
  onLevelSelect: () => void
  backLabel?: string // 'Levels' unless said (a reading goes back to its spread)
  onViewBoard?: (viewing: boolean) => void // the board brightens while viewed
}

// Put the card aside to study the board as it ended; a tap anywhere (or the
// bar's button) brings it back. The overlay stays up, so the board can be
// looked at but not played.
function addBoardView(overlay: HTMLElement, card: HTMLElement, caption: string, onView?: (viewing: boolean) => void): void {
  const view = document.createElement('button')
  view.className = 'btn ghost small result-view'
  view.textContent = 'View board'
  const bar = document.createElement('div')
  bar.className = 'result-peek panel'
  const text = document.createElement('span')
  text.textContent = caption
  const back = document.createElement('button')
  back.className = 'btn small'
  back.textContent = 'Back'
  bar.append(text, back)
  const set = (viewing: boolean) => {
    overlay.classList.toggle('viewing', viewing)
    onView?.(viewing)
    ;(viewing ? back : view).focus({ preventScroll: true })
  }
  view.addEventListener('click', () => set(true))
  overlay.addEventListener('click', (e) => {
    if (overlay.classList.contains('viewing') && e.target !== view) set(false)
  })
  card.append(view)
  overlay.append(bar)
}

export function showHUD(result: HUDResult, actions: HUDActions, recap?: Recap): HTMLElement {
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
    if (actions.onNext) buttonRow.append(makeButton(actions.nextLabel ?? 'Next', actions.onNext, true))
    buttonRow.append(makeButton('Replay', actions.onRetry, !actions.onNext))
  } else {
    buttonRow.append(makeButton('Retry', actions.onRetry, true))
    if (actions.onUndo) buttonRow.append(makeButton('Undo', actions.onUndo, false))
  }
  buttonRow.append(makeButton(actions.backLabel ?? 'Levels', actions.onLevelSelect, false))

  card.append(title)
  if (recap && result === 'won' && recap.wasted === 0) card.append(subtitle('Not a blow wasted.'))
  if (recap && result === 'lost' && recap.lostBecause) card.append(subtitle(LOSS_LINES[recap.lostBecause]))
  card.append(divider())
  if (recap) {
    const keys: StatKey[] = result === 'won' ? ['time', 'detonations', 'landed', 'wasted', 'kicks', 'undos'] : ['strengthLeft', 'detonations', 'landed', 'wasted', 'kicks', 'undos']
    card.append(...recapBlock(recap, keys, result === 'won'))
  }
  card.append(buttonRow)
  addBoardView(overlay, card, result === 'won' ? 'The board as you left it' : 'The board as it ended', actions.onViewBoard)
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
  recap?: Recap
}

// Endless: the single life is spent.
export function showRunOver(info: RunOverInfo, actions: { onAgain: () => void; onMenu: () => void; onViewBoard?: (viewing: boolean) => void }): HTMLElement {
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
  card.append(title, divider(), stats)
  if (info.recap) card.append(...recapBlock(info.recap, ['time', 'detonations', 'wasted'], false))
  card.append(row)
  addBoardView(overlay, card, 'The board as it ended', actions.onViewBoard)
  document.body.appendChild(overlay)
  return overlay
}
