// A palette's hues (Theme.ts) are the only place color carries gameplay meaning —
// obstacles and rune bodies are a single neutral tone regardless of shape,
// so a mote/node color is never mistaken for a decorative shape-identity hint.
export type Hue = 'red' | 'blue' | 'gold' | 'teal' | 'violet'

// The color schemes a level can be drawn in. A palette changes how the five
// hues look and what they are called, never what they do (Theme.ts).
export const PALETTE_NAMES = ['jewel', 'cool', 'warm'] as const
export type PaletteName = (typeof PALETTE_NAMES)[number]

// A mote's color. Never 'annihilating' — that value only ever describes
// what a node does to a mote it already caught, not a mote's own identity.
// Besides the five hues, three kinds of mote go into any bowl:
//   generic (opal)  wild: counts toward the blow like the bowl's own color;
//   null            a blank: adds no power, and at the burst takes the
//                   bowl's output color like any mote;
//   void            adds no power and never changes; only an ash
//                   (annihilating) bowl gets rid of it.
export type MoteColor = Hue | 'generic' | 'null' | 'void'

// What a node turns its catch into at detonation — a normal mote color, or
// the special 'annihilating' value meaning the catch is destroyed instead.
export type ReleaseColor = MoteColor | 'annihilating'

export interface NodeColorSpec {
  catch: Hue // never 'generic' — an outer/catch node must always require a real hue
  release: ReleaseColor // release (and motes themselves) can still be generic
}

// Does this bowl hold a shield of this color down? One of its color that
// keeps what it catches: an ash cup burns its catch, so it can't.
export const holdsShield = (node: NodeColorSpec, color: Hue): boolean => node.catch === color && node.release !== 'annihilating'

// Motes any bowl takes, in the order a bowl takes them after its own color:
// the friendliest first, so a blank never beats a mote that counts.
export const ANY_BOWL = ['generic', 'null', 'void'] as const
export const takesAnyBowl = (c: MoteColor): boolean => c === 'generic' || c === 'null' || c === 'void'
export const addsPower = (c: MoteColor): boolean => c !== 'null' && c !== 'void'
export const isHue = (c: string): c is Hue => c === 'red' || c === 'blue' || c === 'gold' || c === 'teal' || c === 'violet'
// A bowl's preference: its own color (0), then opal, null, void.
export const catchRank = (c: MoteColor): number => (isHue(c) ? 0 : 1 + ANY_BOWL.indexOf(c))

export function moteMatchesCatch(moteColor: MoteColor, catchColor: MoteColor): boolean {
  return takesAnyBowl(moteColor) || moteColor === catchColor
}
