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

  private noise(duration: number, gainPeak: number, cutoff: number, delay = 0): void {
    const ctx = this.ensureContext()
    const len = Math.ceil(ctx.sampleRate * duration)
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    const gain = ctx.createGain()
    const start = ctx.currentTime + delay
    gain.gain.setValueAtTime(gainPeak, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    src.start(start)
  }

  private lastFill = 0

  pickUp(): void {
    this.tone(392, 0.08, 'triangle', 0.06)
  }

  place(): void {
    this.tone(523.25, 0.14, 'sine', 0.12)
    this.tone(784, 0.1, 'triangle', 0.05, 0.03)
  }

  notReady(): void {
    this.tone(160, 0.1, 'square', 0.04)
  }

  // Rising pentatonic plinks, throttled so a burst of catches stays musical.
  nodeFilled(): void {
    const ctx = this.ensureContext()
    if (ctx.currentTime - this.lastFill < 0.04) return
    this.lastFill = ctx.currentTime
    const scale = [659.25, 739.99, 880, 987.77, 1108.73]
    this.tone(scale[Math.floor(Math.random() * scale.length)], 0.12, 'triangle', 0.07)
  }

  ready(): void {
    this.tone(880, 0.25, 'sine', 0.08)
    this.tone(1318.5, 0.3, 'sine', 0.06, 0.06)
  }

  detonate(hit: boolean): void {
    this.noise(hit ? 0.45 : 0.3, hit ? 0.35 : 0.2, hit ? 1800 : 1200)
    this.tone(hit ? 110 : 150, 0.4, 'sawtooth', 0.14)
    this.tone(55, 0.5, 'sine', hit ? 0.25 : 0.12, 0.01)
  }

  obstacleCleared(cleared: boolean): void {
    this.noise(0.6, 0.3, 3200, 0.05)
    this.tone(659.25, 0.18, 'sine', 0.12, 0.05)
    this.tone(987.77, 0.24, 'sine', 0.12, 0.13)
    if (cleared) this.tone(1318.5, 0.4, 'sine', 0.1, 0.22)
  }

  undo(): void {
    this.tone(700, 0.08, 'sine', 0.07)
    this.tone(466, 0.12, 'sine', 0.07, 0.06)
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
