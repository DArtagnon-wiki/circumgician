import { loadSettings, saveSettings, type AudioSettings } from './settings'
import { Music } from './Music'

// One AudioContext for the whole session: master gain (volume/mute) feeding
// an SFX bus and a music bus. Created lazily inside a user gesture, which
// iOS Safari requires before any sound can play.
class AudioEngine {
  ctx: AudioContext | null = null
  sfxBus: GainNode | null = null
  private master: GainNode | null = null
  private music: Music | null = null
  settings: AudioSettings = loadSettings()
  private listeners = new Set<() => void>()

  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.connect(ctx.destination)
      this.sfxBus = ctx.createGain()
      this.sfxBus.connect(this.master)
      const musicBus = ctx.createGain()
      musicBus.gain.value = 0.55
      musicBus.connect(this.master)
      this.music = new Music(ctx, musicBus)
      this.applyGain()
      this.music.start()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void ctx.suspend()
        else void ctx.resume()
      })
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setMuted(muted: boolean): void {
    this.update({ ...this.settings, muted })
  }

  setVolume(volume: number): void {
    this.update({ ...this.settings, volume, muted: volume > 0 ? false : this.settings.muted })
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private update(s: AudioSettings): void {
    this.settings = s
    saveSettings(s)
    this.applyGain()
    this.listeners.forEach((fn) => fn())
  }

  private applyGain(): void {
    if (!this.ctx || !this.master) return
    const target = this.settings.muted ? 0 : this.settings.volume * this.settings.volume
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05)
  }
}

export const audio = new AudioEngine()
