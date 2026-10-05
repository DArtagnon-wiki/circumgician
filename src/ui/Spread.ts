import './ui.css'
import type { LevelData } from '../sim/types'
import { divider } from './ornament'
import { POSITIONS } from './reading'

export interface SpreadCard {
  level: LevelData
  mark: string // its rank or trump number
  section: string // its suit, or the Major Arcana
  done: boolean
}

export interface SpreadActions {
  cards: SpreadCard[]
  next: number // the card to play next; -1 once the reading is complete
  fresh: boolean // just drawn: the cards turn over one by one
  onPlay: (place: number) => void
  onDraw: () => void
  onBack: () => void
}

// The same gilt seal as the level list's.
const SEAL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="9.5" stroke-width="1.2"/><circle cx="12" cy="12" r="7" stroke-width=".7" opacity=".6"/>' +
  '<path d="M8.2 12.3l2.5 2.5 5-5.4" stroke-width="1.8"/></svg>'

// A reading laid out as three cards: past, present, future. The next card to
// play glows; any card can be tapped to play it; the button plays the next.
export function showSpread(actions: SpreadActions): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = 'screen reading'

  const title = document.createElement('h2')
  title.className = 'levels-title gilt-text'
  title.textContent = 'Your Reading'

  const spread = document.createElement('div')
  spread.className = 'spread'
  actions.cards.forEach((card, place) => {
    const el = document.createElement('button')
    el.className = 'tarot-card panel'
    if (card.done) el.classList.add('done')
    if (place === actions.next) el.classList.add('next')
    if (actions.fresh) {
      el.classList.add('fresh')
      el.style.animationDelay = `${0.2 + place * 0.35}s`
    }
    const position = document.createElement('span')
    position.className = 'card-position'
    position.textContent = POSITIONS[place] ?? ''
    const mark = document.createElement('span')
    mark.className = 'card-mark gilt-text'
    mark.textContent = card.mark
    const name = document.createElement('span')
    name.className = 'card-name'
    name.textContent = card.level.name
    const section = document.createElement('span')
    section.className = 'card-suit'
    section.textContent = card.section
    el.append(position, mark, name, section)
    if (card.done) {
      const seal = document.createElement('span')
      seal.className = 'level-seal card-seal'
      seal.setAttribute('aria-label', 'won')
      seal.innerHTML = SEAL
      el.append(seal)
    }
    el.addEventListener('click', () => actions.onPlay(place))
    spread.append(el)
  })

  const line = document.createElement('div')
  line.className = 'menu-sub reading-line'
  const won = actions.cards.filter((c) => c.done).length
  line.textContent =
    actions.next < 0 ? 'The reading is complete.' : won === 0 ? 'Play the cards in turn: the past, the present, then the future.' : `${won} of ${actions.cards.length} cards won.`

  const buttons = document.createElement('div')
  buttons.className = 'menu-buttons'
  const button = (label: string, kind: string, fn: () => void) => {
    const b = document.createElement('button')
    b.className = `btn ${kind}`
    b.textContent = label
    b.addEventListener('click', fn)
    return b
  }
  if (actions.next >= 0) {
    buttons.append(button(won === 0 ? 'Begin the reading' : 'Continue', 'wide primary', () => actions.onPlay(actions.next)), button('Draw again', 'wide', actions.onDraw))
  } else {
    buttons.append(button('Draw again', 'wide primary', actions.onDraw))
  }
  buttons.append(button('Back', 'ghost', actions.onBack))

  overlay.append(title, divider(), spread, line, buttons)
  document.body.appendChild(overlay)
  return overlay
}
