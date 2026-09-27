import { audio } from '../audio/engine'

const SPEAKER =
  '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path class="waves" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path class="cross" d="m16 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'

// Speaker button; tapping it opens a small panel with a volume slider and a
// mute toggle. Settings persist through the audio engine.
export function createAudioControl(): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'audio-control'
  const button = document.createElement('button')
  button.className = 'audio-button'
  button.innerHTML = SPEAKER
  button.setAttribute('aria-label', 'Sound')

  const panel = document.createElement('div')
  panel.className = 'audio-panel'
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = '1'
  slider.step = '0.05'
  slider.setAttribute('aria-label', 'Volume')
  const mute = document.createElement('button')
  mute.className = 'btn small'
  panel.append(slider, mute)

  const render = () => {
    const { muted, volume } = audio.settings
    wrap.classList.toggle('muted', muted || volume === 0)
    slider.value = String(volume)
    mute.textContent = muted ? 'Unmute' : 'Mute'
  }
  button.addEventListener('click', () => {
    audio.unlock()
    wrap.classList.toggle('open')
  })
  mute.addEventListener('click', () => audio.setMuted(!audio.settings.muted))
  slider.addEventListener('input', () => {
    audio.unlock()
    audio.setVolume(Number(slider.value))
  })
  const off = audio.onChange(() => (wrap.isConnected ? render() : off()))

  wrap.append(panel, button)
  render()
  return wrap
}
