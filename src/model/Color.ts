// Miasma/node colors are deliberately a separate palette from Theme.ts's
// SHAPE_COLORS (which governs obstacle/shape-matching visuals) — mote color
// must never be mistaken for a shape-identity hint.
export type Hue = 'red' | 'blue' | 'gold' | 'teal' | 'violet'

// A real mote's color. Never 'annihilating' — that value only ever describes
// what a node does to a mote it already caught, not a mote's own identity.
export type MoteColor = Hue | 'generic'

// What a node turns its catch into at detonation — a normal mote color, or
// the special 'annihilating' value meaning the catch is destroyed instead.
export type ReleaseColor = MoteColor | 'annihilating'

export interface NodeColorSpec {
  catch: MoteColor
  release: ReleaseColor
}

export function moteMatchesCatch(moteColor: MoteColor, catchColor: MoteColor): boolean {
  return moteColor === 'generic' || moteColor === catchColor
}
