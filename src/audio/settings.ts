// Persisted audio settings. Storage failures (private mode) fall back to
// in-memory defaults.
export interface AudioSettings {
  muted: boolean
  volume: number // 0..1 master
}

const KEY = 'circumgician:settings'
const DEFAULTS: AudioSettings = { muted: false, volume: 0.8 }

export function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const s = JSON.parse(raw) as Partial<AudioSettings>
    return {
      muted: typeof s.muted === 'boolean' ? s.muted : DEFAULTS.muted,
      volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : DEFAULTS.volume,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: AudioSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // non-critical
  }
}
