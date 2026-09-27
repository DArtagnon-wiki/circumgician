import { audio } from '../audio/engine'
import { createAudioControl } from './AudioControl'
import { endlessBest } from './progress'

export interface MenuActions {
  onPlay: () => void
  onEndless: () => void
}

export function showMenu(actions: MenuActions): HTMLElement {
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2000;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px;
    background: radial-gradient(circle at 50% 30%, #2a1550, #140a24 70%);
    color: white; font-family: Georgia, 'Times New Roman', serif; text-align: center;
    padding: 24px;
  `

  const title = document.createElement('div')
  title.style.cssText = 'font-size: 42px; font-style: italic; letter-spacing: 1px; text-shadow: 0 0 24px rgba(190,160,255,0.8); margin-bottom: 8px;'
  title.textContent = 'Circumgician'

  const subtitle = document.createElement('div')
  subtitle.style.cssText = 'font-size: 15px; opacity: 0.7; max-width: 280px; margin-bottom: 12px;'
  subtitle.textContent = 'Layer your runes, catch the miasma, unravel every obstacle.'

  const start = (fn: () => void) => () => {
    audio.unlock() // first real gesture: start the music bed
    fn()
  }
  const playButton = document.createElement('button')
  playButton.className = 'btn primary'
  playButton.style.cssText = 'min-width: 180px; font-size: 18px;'
  playButton.textContent = 'Play'
  playButton.addEventListener('click', start(actions.onPlay))

  const endlessButton = document.createElement('button')
  endlessButton.className = 'btn'
  endlessButton.style.cssText = 'min-width: 180px; font-size: 18px;'
  endlessButton.textContent = 'Endless'
  endlessButton.addEventListener('click', start(actions.onEndless))

  const best = endlessBest()
  const bestLine = document.createElement('div')
  bestLine.style.cssText = 'font-size: 13px; opacity: 0.6; min-height: 1em;'
  bestLine.textContent = best.score > 0 ? `Endless best: ${best.score} (${best.depth} layers)` : ''

  const sound = createAudioControl()
  sound.classList.add('corner')

  overlay.append(title, subtitle, playButton, endlessButton, bestLine, sound)
  document.body.appendChild(overlay)
  return overlay
}
