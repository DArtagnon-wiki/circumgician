// HUE_COLORS (Theme.ts) is the only place color carries gameplay meaning —
// obstacles and rune bodies are a single neutral tone regardless of shape,
// so a mote/node color is never mistaken for a decorative shape-identity hint.
export type Hue = 'red' | 'blue' | 'gold' | 'teal' | 'violet'

// A real mote's color. Never 'annihilating' — that value only ever describes
// what a node does to a mote it already caught, not a mote's own identity.
export type MoteColor = Hue | 'generic'

// What a node turns its catch into at detonation — a normal mote color, or
// the special 'annihilating' value meaning the catch is destroyed instead.
export type ReleaseColor = MoteColor | 'annihilating'

export interface NodeColorSpec {
  catch: Hue // never 'generic' — an outer/catch node must always require a real hue
  release: ReleaseColor // release (and motes themselves) can still be generic
}

export function moteMatchesCatch(moteColor: MoteColor, catchColor: MoteColor): boolean {
  return moteColor === 'generic' || moteColor === catchColor
}
