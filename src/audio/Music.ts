// Generative arcane bed: slow minor-key pad chords under sparse, echoing
// bell notes. Scheduled ahead on the audio clock by a light timer, so it
// never repeats exactly and costs no audio files.
const D = 146.83 // D3
const semis = (n: number) => D * Math.pow(2, n / 12)
// i - VI - VII - v  in D minor, as semitone offsets from D3
const CHORDS = [
  [0, 7, 12, 15],
  [-4, 3, 8, 12],
  [-2, 5, 10, 14],
  [-5, 2, 7, 10],
]
const BELL_SCALE = [12, 15, 17, 19, 22, 24, 27, 29] // D minor pentatonic-ish, upper octaves
const BAR = 6 // seconds per chord

export class Music {
  private ctx: AudioContext
  private out: GainNode
  private echo: DelayNode
  private nextBar = 0
  private nextBell = 0
  private bar = 0
  private timer: number | null = null

  constructor(ctx: AudioContext, out: GainNode) {
    this.ctx = ctx
    this.out = out
    // Feedback echo for the bells: a small, dark "hall".
    this.echo = ctx.createDelay(1)
    this.echo.delayTime.value = 0.42
    const fb = ctx.createGain()
    fb.gain.value = 0.38
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 2200
    this.echo.connect(tone)
    tone.connect(fb)
    fb.connect(this.echo)
    tone.connect(out)
  }

  start(): void {
    if (this.timer !== null) return
    this.nextBar = this.ctx.currentTime + 0.1
    this.nextBell = this.ctx.currentTime + 2
    this.timer = window.setInterval(() => this.schedule(), 250)
  }

  private schedule(): void {
    const horizon = this.ctx.currentTime + 1
    while (this.nextBar < horizon) {
      this.pad(CHORDS[this.bar % CHORDS.length], this.nextBar)
      this.bar++
      this.nextBar += BAR
    }
    while (this.nextBell < horizon) {
      const chord = CHORDS[(this.bar + CHORDS.length - 1) % CHORDS.length]
      const pool = Math.random() < 0.6 ? chord.map((n) => n + 24) : BELL_SCALE
      this.bell(semis(pool[Math.floor(Math.random() * pool.length)]), this.nextBell)
      this.nextBell += 1.1 + Math.random() * 2.6
    }
  }

  private pad(chord: number[], at: number): void {
    const ctx = this.ctx
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(380, at)
    filter.frequency.linearRampToValueAtTime(900, at + BAR * 0.5)
    filter.frequency.linearRampToValueAtTime(420, at + BAR * 1.3)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.07, at + 2)
    gain.gain.linearRampToValueAtTime(0, at + BAR * 1.35)
    filter.connect(gain)
    gain.connect(this.out)
    for (const n of chord) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = semis(n)
        osc.detune.value = detune
        osc.connect(filter)
        osc.start(at)
        osc.stop(at + BAR * 1.4)
      }
    }
  }

  private bell(freq: number, at: number): void {
    const ctx = this.ctx
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.05, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.2)
    gain.connect(this.out)
    gain.connect(this.echo)
    // Sine plus an inharmonic partial for a glassy bell.
    for (const [mult, level] of [
      [1, 1],
      [2.76, 0.25],
    ]) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      g.gain.value = level
      osc.frequency.value = freq * mult
      osc.connect(g)
      g.connect(gain)
      osc.start(at)
      osc.stop(at + 2.3)
    }
  }
}
