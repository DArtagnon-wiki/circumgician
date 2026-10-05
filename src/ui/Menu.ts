import './ui.css'
import { audio } from '../audio/engine'
import { createAudioControl } from './AudioControl'
import { divider } from './ornament'
import { endlessBest } from './progress'

export interface MenuActions {
  onPlay: () => void
  onReading: () => void
  onEndless: () => void
  onHowToPlay: () => void
}

export function showMenu(actions: MenuActions): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = 'screen menu'

  const title = document.createElement('h1')
  title.className = 'menu-title gilt-text'
  title.textContent = 'Circumgician'

  const subtitle = document.createElement('div')
  subtitle.className = 'menu-sub'
  subtitle.textContent = 'Layer your runes, catch the miasma, unravel every obstacle.'

  const start = (fn: () => void) => () => {
    audio.unlock() // first real gesture: start the music bed
    fn()
  }
  const button = (label: string, kind: string, fn: () => void) => {
    const b = document.createElement('button')
    b.className = `btn wide ${kind}`
    b.textContent = label
    b.addEventListener('click', start(fn))
    return b
  }
  const buttons = document.createElement('div')
  buttons.className = 'menu-buttons'
  buttons.append(
    button('Play', 'primary', actions.onPlay),
    button('Draw your reading', '', actions.onReading),
    button('Endless', '', actions.onEndless),
    button('How to play', 'ghost', actions.onHowToPlay),
  )

  const best = endlessBest()
  const bestLine = document.createElement('div')
  bestLine.className = 'menu-best'
  bestLine.textContent = best.score > 0 ? `Endless best: ${best.score} (${best.depth} layers)` : ''

  const sound = createAudioControl()
  sound.classList.add('corner')

  overlay.append(title, divider(), subtitle, buttons, bestLine, sound)
  document.body.appendChild(overlay)
  return overlay
}
