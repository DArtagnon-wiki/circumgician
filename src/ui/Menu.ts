import { audio } from '../audio/engine'
import { createAudioControl } from './AudioControl'

export interface MenuActions {
  onPlay: () => void
}

export function showMenu(actions: MenuActions): HTMLElement {
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2000;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 20px;
    background: radial-gradient(circle at 50% 30%, #2a1550, #140a24 70%);
    color: white; font-family: sans-serif; text-align: center;
    padding: 24px;
  `

  const title = document.createElement('div')
  title.style.cssText = 'font-size: 40px; font-weight: bold; letter-spacing: 1px;'
  title.textContent = 'Circumgician'

  const subtitle = document.createElement('div')
  subtitle.style.cssText = 'font-size: 15px; opacity: 0.7; max-width: 280px;'
  subtitle.textContent = 'Layer your runes, catch the miasma, unravel every obstacle.'

  const playButton = document.createElement('button')
  playButton.textContent = 'Play'
  playButton.style.cssText = `
    padding: 14px 40px; font-size: 18px; border-radius: 10px; border: none;
    cursor: pointer; background: white; color: #140a24; font-weight: bold;
  `
  playButton.addEventListener('click', () => {
    audio.unlock() // first real gesture: start the music bed
    actions.onPlay()
  })

  const sound = createAudioControl()
  sound.classList.add('corner')

  overlay.append(title, subtitle, playButton, sound)
  document.body.appendChild(overlay)
  return overlay
}
