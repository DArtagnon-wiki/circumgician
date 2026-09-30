import { audio } from './engine'

// Synthesized SFX in the game's materials (glass, liquid, smoke,
// obsidian) via Web Audio: no asset files. Routed through the shared
// engine's SFX bus (volume/mute); silent until a real gesture unlocks the
// engine. Glassy sounds also feed a small synthetic reverb.

// D minor pentatonic, to sit with the music bed; catches climb it as a
// rune fills.
const D5 = 587.33
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17].map((s) => D5 * Math.pow(2, s / 12))
// Inharmonic partials of a struck glass (ratios and relative levels).
const GLASS = [
  [1, 1],
  [2.32, 0.42],
  [4.25, 0.22],
  [6.63, 0.1],
] as const

interface Shared {
  noise: AudioBuffer
  reverb: ConvolverNode
}
const shared = new WeakMap<AudioContext, Shared>()

// One white-noise buffer and one reverb per context, made on first use.
function sharedFor(ctx: AudioContext, out: AudioNode): Shared {
  let s = shared.get(ctx)
  if (s) return s
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  // A soft glass hall: 1.6s of decaying, gently darkened noise.
  const len = Math.floor(ctx.sampleRate * 1.6)
  const ir = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c)
    let lp = 0
    for (let i = 0; i < len; i++) {
      lp += (Math.random() * 2 - 1 - lp) * 0.35
      ch[i] = lp * Math.pow(1 - i / len, 2.6)
    }
  }
  const reverb = ctx.createConvolver()
  reverb.buffer = ir
  const wet = ctx.createGain()
  wet.gain.value = 0.55
  reverb.connect(wet)
  wet.connect(out)
  s = { noise, reverb }
  shared.set(ctx, s)
  return s
}

interface NoiseOpts {
  type: BiquadFilterType
  freq: number
  to?: number // filter sweep target
  q?: number
  peak: number
  attack?: number
  swell?: boolean // rise to the peak and cut off (a reversed hit)
  reverb?: number
}

export class Sfx {
  private lastFill = -1 // audio time of the last catch sound (throttle)

  // Call synchronously from within a real user-gesture handler (pointerdown)
  // so iOS Safari's autoplay policy actually lets the context run.
  unlock(): void {
    audio.unlock()
  }

  private get ready(): { ctx: AudioContext; out: AudioNode; fx: Shared } | null {
    const ctx = audio.ctx
    const out = audio.sfxBus
    if (!ctx || !out) return null
    return { ctx, out, fx: sharedFor(ctx, out) }
  }

  // An oscillator with an attack/decay envelope, optionally gliding.
  private tone(freq: number, dur: number, peak: number, delay = 0, type: OscillatorType = 'sine', glideTo?: number, reverb = 0): void {
    const r = this.ready
    if (!r) return
    const { ctx, out } = r
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.8)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g)
    g.connect(out)
    if (reverb) this.send(g, reverb)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  // A struck glass: the fundamental plus inharmonic partials that die
  // away faster the higher they are.
  private ping(freq: number, dur: number, peak: number, delay = 0, reverb = 0.35): void {
    const nyquist = (audio.ctx?.sampleRate ?? 44100) / 2
    for (const [ratio, level] of GLASS) {
      if (freq * ratio < nyquist * 0.9) this.tone(freq * ratio, dur / (1 + ratio * 0.35), peak * level, delay, 'sine', undefined, reverb)
    }
  }

  private noise(dur: number, o: NoiseOpts, delay = 0): void {
    const r = this.ready
    if (!r) return
    const { ctx, out, fx } = r
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = fx.noise
    src.loop = true // a random offset plus a long duration may pass the end
    const filter = ctx.createBiquadFilter()
    filter.type = o.type
    filter.Q.value = o.q ?? 0.8
    filter.frequency.setValueAtTime(o.freq, t)
    if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + dur)
    const g = ctx.createGain()
    if (o.swell) {
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(o.peak, t + dur)
      g.gain.linearRampToValueAtTime(0, t + dur + 0.02)
    } else {
      const a = o.attack ?? 0.004
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(o.peak, t + a)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    }
    src.connect(filter)
    filter.connect(g)
    g.connect(out)
    if (o.reverb) this.send(g, o.reverb)
    src.start(t, Math.random() * 1.2, dur + 0.05)
  }

  private send(node: AudioNode, amount: number): void {
    const r = this.ready
    if (!r) return
    const s = r.ctx.createGain()
    s.gain.value = amount
    node.connect(s)
    s.connect(r.fx.reverb)
  }

  // Airy smoke whoosh: band-passed noise sweeping up.
  kick(): void {
    this.noise(0.28, { type: 'bandpass', freq: 480 + Math.random() * 120, to: 2800, q: 1.1, peak: 0.3, attack: 0.04 })
  }

  // Glass clink as a rune leaves the hand.
  pickUp(): void {
    this.ping(2350 + Math.random() * 120, 0.22, 0.05)
    this.noise(0.02, { type: 'highpass', freq: 5000, peak: 0.03 })
  }

  // Set down: a clink over a soft thud.
  place(): void {
    this.ping(1760, 0.4, 0.07)
    this.ping(2640, 0.25, 0.03, 0.03)
    this.tone(190, 0.1, 0.08, 0, 'sine', 110)
  }

  // A dull glass tock: nothing to do here.
  notReady(): void {
    this.tone(420, 0.09, 0.06, 0, 'triangle', 300)
    this.noise(0.05, { type: 'lowpass', freq: 900, peak: 0.03 })
  }

  // Liquid drip into glass: a blip that drops in pitch, then the bowl's
  // ping. `count` is how many of the rune's bowls are now full, so a
  // filling rune climbs the scale.
  nodeFilled(count = 1): void {
    const ctx = audio.ctx
    if (!ctx) return
    if (ctx.currentTime - this.lastFill < 0.04) return
    this.lastFill = ctx.currentTime
    const f = SCALE[Math.min(SCALE.length - 1, Math.max(0, count - 1))]
    this.tone(1500, 0.08, 0.09, 0, 'sine', 520)
    this.ping(f * 2, 0.6, 0.045, 0.03)
  }

  // Glass resonance: a rubbed-rim chord that blooms and hangs.
  full(): void {
    const r = this.ready
    if (!r) return
    const { ctx, out } = r
    const t = ctx.currentTime
    ;[D5, D5 * 1.5, D5 * 2, D5 * 2.378].forEach((f, i) => {
      const osc = ctx.createOscillator()
      osc.frequency.value = f
      const vib = ctx.createOscillator()
      vib.frequency.value = 5 + i * 0.7
      const depth = ctx.createGain()
      depth.gain.value = f * 0.004
      vib.connect(depth)
      depth.connect(osc.frequency)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.045 / (1 + i * 0.3), t + 0.06)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5)
      osc.connect(g)
      g.connect(out)
      this.send(g, 0.6)
      for (const o of [osc, vib]) {
        o.start(t)
        o.stop(t + 1.6)
      }
    })
    this.noise(0.5, { type: 'highpass', freq: 6000, peak: 0.012, attack: 0.1, reverb: 0.5 })
  }

  // Implosion, in step with the picture: noise swells while the liquid
  // gathers, the glass shatters when the tubes burst (`burst` s), and a low
  // thump lands with the orb (`impact` s), or at the burst with no target.
  detonate(burst: number, impact: number | null): void {
    this.noise(burst, { type: 'lowpass', freq: 260, to: 3200, q: 0.7, peak: 0.22, swell: true })
    this.noise(0.4, { type: 'highpass', freq: 2600, peak: 0.2, reverb: 0.4 }, burst)
    for (let k = 0; k < 5; k++) this.ping(1900 + Math.random() * 3600, 0.18 + Math.random() * 0.25, 0.035, burst + k * 0.013 + Math.random() * 0.03)
    const at = impact ?? burst
    const hit = impact !== null
    this.tone(hit ? 95 : 130, 0.45, hit ? 0.32 : 0.14, at, 'sine', 38)
    this.noise(0.25, { type: 'lowpass', freq: 240, peak: hit ? 0.22 : 0.08 }, at)
  }

  // Frost: a brittle crackle climbing into high glassy chimes, over a dull
  // thud as the piece locks.
  // A piece latches into stasis: a soft clasp, and glass ringing held still.
  stasis(): void {
    this.noise(0.06, { type: 'lowpass', freq: 1400, peak: 0.08 })
    this.tone(330, 0.5, 0.05, 0, 'sine', 247, 0.3)
    this.ping(1318, 0.9, 0.03, 0.03, 0.5)
  }

  // Both of a two-shape layer's places are held: the pair is armed.
  armed(): void {
    this.ping(988, 0.8, 0.035, 0, 0.5)
    this.ping(1480, 1.0, 0.035, 0.09, 0.6)
  }

  freeze(): void {
    this.noise(0.35, { type: 'highpass', freq: 3000, to: 7000, q: 0.9, peak: 0.12, reverb: 0.3 })
    for (let k = 0; k < 6; k++) this.ping(2600 + k * 380 + Math.random() * 200, 0.3, 0.025, k * 0.035, 0.4)
    this.tone(160, 0.25, 0.12, 0, 'sine', 90)
  }

  // A fuse running low: a short hiss of sparks.
  fuseLow(): void {
    this.noise(0.3, { type: 'highpass', freq: 3800, to: 6000, q: 0.7, peak: 0.06 })
    for (let k = 0; k < 4; k++) this.noise(0.012, { type: 'bandpass', freq: 2500 + Math.random() * 2500, q: 2, peak: 0.08 }, 0.03 + k * 0.06 + Math.random() * 0.03)
  }

  // A piece burning away: a whoosh of flame, the crackle of fire, a dull
  // thump and the glass giving way in the heat.
  burn(): void {
    this.noise(0.4, { type: 'bandpass', freq: 260, to: 1600, q: 0.8, peak: 0.2, swell: true })
    this.noise(0.9, { type: 'lowpass', freq: 900, to: 200, peak: 0.1, attack: 0.05, reverb: 0.2 }, 0.3)
    for (let k = 0; k < 10; k++) this.noise(0.01 + Math.random() * 0.02, { type: 'bandpass', freq: 1500 + Math.random() * 3000, q: 1.5, peak: 0.08 + Math.random() * 0.1 }, 0.25 + Math.random() * 0.7)
    this.tone(95, 0.35, 0.12, 0.3, 'sine', 48)
    this.ping(1500 + Math.random() * 200, 0.25, 0.03, 0.34, 0.3)
  }

  // Deep obsidian crack: a sharp snap over a falling rumble, and stone
  // chips; clearing an obstacle adds a rising glass flourish.
  // Ice giving way: a bright crack, then shards tinkling down and a breath
  // of released cold.
  iceBreak(): void {
    this.noise(0.07, { type: 'bandpass', freq: 4200, q: 1.8, peak: 0.24 })
    this.noise(0.55, { type: 'highpass', freq: 2600, to: 900, q: 0.7, peak: 0.07, reverb: 0.4 })
    for (let k = 0; k < 7; k++) this.ping(3300 - k * 240 + Math.random() * 160, 0.35, 0.028, 0.03 + k * 0.045, 0.45)
    this.tone(220, 0.3, 0.07, 0, 'sine', 140)
  }

  obstacleCleared(cleared: boolean): void {
    this.noise(0.06, { type: 'bandpass', freq: 1300, q: 2.5, peak: 0.3 })
    this.noise(0.9, { type: 'lowpass', freq: 180, to: 60, peak: 0.24, attack: 0.01 })
    this.tone(118, 0.7, 0.2, 0.01, 'triangle', 44)
    for (let k = 0; k < 4; k++) this.tone(320 + Math.random() * 380, 0.09, 0.05, 0.02 + k * 0.035, 'triangle')
    if (cleared) [0, 4, 7].forEach((s, i) => this.ping(SCALE[s] * 2, 0.9, 0.05, 0.18 + i * 0.09, 0.5))
  }

  // Glass rewind: a warbling sweep up with a reversed ping.
  undo(): void {
    const r = this.ready
    if (!r) return
    const { ctx, out } = r
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(420, t)
    osc.frequency.exponentialRampToValueAtTime(980, t + 0.28)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 13
    const depth = ctx.createGain()
    depth.gain.value = 28
    lfo.connect(depth)
    depth.connect(osc.frequency)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.24)
    g.gain.linearRampToValueAtTime(0, t + 0.3)
    osc.connect(g)
    g.connect(out)
    this.send(g, 0.4)
    for (const o of [osc, lfo]) {
      o.start(t)
      o.stop(t + 0.32)
    }
    this.noise(0.28, { type: 'bandpass', freq: 3000, to: 900, q: 1.5, peak: 0.03, swell: true })
  }

  // A new color: a glass run sparkling up the pentatonic, landing on a bright
  // major chord high above the bed, with a shimmer. Short: play goes on.
  discover(): void {
    SCALE.forEach((f, i) => this.ping(f, 0.35, 0.03, i * 0.045, 0.5))
    const top = 0.4
    ;[12, 16, 19, 24].forEach((s, i) => this.ping(D5 * Math.pow(2, s / 12), 1.5, 0.05 - i * 0.006, top + i * 0.012, 0.65))
    this.noise(0.9, { type: 'highpass', freq: 5000, to: 9000, peak: 0.028, attack: 0.25, reverb: 0.6 }, top - 0.1)
  }

  // Win resolves the minor bed to its major: a glass arpeggio and a bloom.
  win(): void {
    const major = [0, 4, 7, 12, 16].map((s) => D5 * Math.pow(2, s / 12))
    major.forEach((f, i) => this.ping(f, 1.2, 0.07, i * 0.09, 0.55))
    this.full()
  }

  // Loss: dull glass tones falling through the minor, over a low sigh.
  lose(): void {
    ;[0, -5, -9, -12].forEach((s, i) => this.tone(D5 * Math.pow(2, s / 12), 0.7, 0.07, i * 0.16, 'triangle', undefined, 0.3))
    this.noise(1, { type: 'lowpass', freq: 400, to: 120, peak: 0.08, attack: 0.3 })
  }
}
