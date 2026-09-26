// Lightweight synthesized SFX via Web Audio oscillators — no asset files
// to keep the initial load small, and no asset loading step to get wrong.
export class Sfx {
  private ctx: AudioContext | null = null

  // Call synchronously from within a real user-gesture handler (pointerdown)
  // so iOS Safari's autoplay policy actually lets the context run — sounds
  // triggered later from async game events reuse this already-unlocked context.
  unlock(): void {
    this.ensureContext()
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'sine', gainPeak = 0.15, delay = 0): void {
    const ctx = this.ensureContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    const start = ctx.currentTime + delay
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(gainPeak, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  place(): void {
    this.tone(520, 0.12, 'sine', 0.12)
  }

  nodeFilled(): void {
    this.tone(880, 0.08, 'triangle', 0.08)
  }

  detonate(): void {
    this.tone(180, 0.25, 'sawtooth', 0.18)
    this.tone(90, 0.3, 'sine', 0.12, 0.02)
  }

  obstacleCleared(): void {
    this.tone(660, 0.12, 'sine', 0.12)
    this.tone(880, 0.16, 'sine', 0.12, 0.08)
  }

  win(): void {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.12, i * 0.08))
  }

  lose(): void {
    ;[400, 320, 240].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.12, i * 0.12))
  }

  // Called when a scene owning this Sfx instance is torn down, so repeated
  // level restarts don't accumulate suspended AudioContexts.
  close(): void {
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close()
    this.ctx = null
  }
}
