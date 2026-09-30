import './ui.css'
import { addFiligree } from './ornament'

// Paged "How to play" overlay: one small diagram and a line or two per page.
// Diagrams are inline SVG drawn in the game's own visual language: smoky
// motes, glass runes (bowl = what a node catches, tube = what its mote
// becomes, cracked grey tube = destroyed) and obsidian obstacles.

const RUBY = '#ec2a52'
const SAPPHIRE = '#2f6bff'
const AMBER = '#ffb02e'
const ASH = '#8a847d'
const GLASS = '#ece6ff'
const GILT = '#d9b872'
const FROST = '#9fd4ff'
const RIME = '#eaf7ff'
const GARNET = '#d90037'
const CITRINE = '#ecd64e'
const FLAME = '#ffa53a'
const EMBER = '#ff5a1f'
const SPARK = '#ffe7a0'
const NULL = '#d9dee8'
const VOID = '#140c20'
const VOID_RIM = '#a596d6'
const STASIS = '#c9d4ff'

type P = [number, number]
const f = (n: number) => n.toFixed(1)
const pts = (list: P[]) => list.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')
const ngon = (cx: number, cy: number, r: number, sides: number, rot = -90): P[] =>
  Array.from({ length: sides }, (_, i) => {
    const a = ((rot + (i * 360) / sides) * Math.PI) / 180
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  })

const DEFS = `<defs>
  <filter id="soft" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="softer" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>`

// A luminous heart shedding a curl of smoke.
const mote = (x: number, y: number, c: string) =>
  `<circle cx="${x}" cy="${y}" r="9" fill="${c}" opacity=".32" filter="url(#softer)"/>
   <ellipse cx="${x + 3}" cy="${y - 7}" rx="4" ry="6" fill="${c}" opacity=".35" filter="url(#soft)"/>
   <circle cx="${x}" cy="${y}" r="3.8" fill="${c}"/><circle cx="${x}" cy="${y}" r="1.5" fill="#fff" opacity=".7"/>`

// A bowl of stained glass in its catch color: a vivid wall round a dim
// hollow. Holding a mote, it fills with bright liquid that glows and glints.
const bowl = ([x, y]: P, c: string, liquid?: string) =>
  (liquid ? `<circle cx="${f(x)}" cy="${f(y)}" r="10" fill="${liquid}" opacity=".5" filter="url(#soft)"/>` : '') +
  `<circle cx="${f(x)}" cy="${f(y)}" r="5.8" fill="${c}" fill-opacity=".3" stroke="${c}" stroke-width="2.6"/>` +
  (liquid ? `<circle cx="${f(x)}" cy="${f(y)}" r="5" fill="${liquid}"/><circle cx="${f(x)}" cy="${f(y)}" r="5" fill="#fff" opacity=".28"/>` : '') +
  `<ellipse cx="${f(x - 2)}" cy="${f(y - 2.4)}" rx="1.8" ry="1.1" fill="#fff" opacity=".85"/>` +
  (liquid ? glint(x - 3.2, y - 3.6) : '')

// A four-point flare of light.
const glint = (x: number, y: number, r = 6.5) => {
  const w = r * 0.14
  return `<path d="M${f(x)} ${f(y - r)}L${f(x + w)} ${f(y - w)}L${f(x + r)} ${f(y)}L${f(x + w)} ${f(y + w)}L${f(x)} ${f(y + r)}L${f(x - w)} ${f(y + w)}L${f(x - r)} ${f(y)}L${f(x - w)} ${f(y - w)}Z" fill="#fff" opacity=".9"/>`
}

// Half a glass tube from a bowl to the edge midpoint, full of `c`, or
// cracked and ash-grey when that node destroys its mote.
function halfTube([x1, y1]: P, [x2, y2]: P, c: string | null): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  const [ux, uy] = [dx / len, dy / len]
  const [nx, ny] = [-uy, ux]
  const at = (t: number, o = 0): P => [x1 + dx * t + nx * o, y1 + dy * t + ny * o]
  const line = (a: P, b: P, attrs: string) => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" ${attrs}/>`
  let s = line(at(0.12), at(1), `stroke="${c ? '#fff' : '#3a3531'}" stroke-opacity="${c ? 0.12 : 0.5}" stroke-width="6.5"`)
  s += line(at(0.12, -3.2), at(1, -3.2), `stroke="${GLASS}" stroke-opacity=".5" stroke-width=".7"`)
  if (c) {
    s += line(at(0.12, 3.2), at(1, 3.2), `stroke="${GLASS}" stroke-opacity=".5" stroke-width=".7"`)
    return s + line(at(0.15), at(0.98), `stroke="${c}" stroke-width="3" stroke-linecap="round"`)
  }
  s += line(at(0.12, 3.2), at(0.5, 3.2), `stroke="${GLASS}" stroke-opacity=".5" stroke-width=".7"`)
  s += line(at(0.64, 3.2), at(1, 3.2), `stroke="${GLASS}" stroke-opacity=".5" stroke-width=".7"`)
  s += line(at(0.15), at(0.46), `stroke="${ASH}" stroke-width="3" stroke-linecap="round"`)
  const z = [at(0.52, -3.2), at(0.6, -1), at(0.53, 1), at(0.58, 3.2)]
  return s + `<polyline points="${pts(z)}" fill="none" stroke="#f4f0ea" stroke-width=".8"/>`
}

interface RuneNode {
  c: string // catch
  r: string | null // release, null = annihilating
  held?: string
}

// A glass rune: tubes between bowls, a frosted middle plate.
function rune(cx: number, cy: number, R: number, nodes: RuneNode[], middleSides: number, glow = false): string {
  const v = ngon(cx, cy, R, nodes.length)
  let s = glow ? `<circle cx="${cx}" cy="${cy}" r="${R + 14}" fill="#eadfff" opacity=".18" filter="url(#softer)"/>` : ''
  s += `<polygon points="${pts(ngon(cx, cy, R * 0.6, middleSides))}" fill="#d8d0f0" fill-opacity=".16" stroke="${GLASS}" stroke-opacity=".85" stroke-width="1.4"/>`
  nodes.forEach((n, i) => {
    const a = v[i]
    const b = v[(i + 1) % v.length]
    const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    s += halfTube(a, mid, n.r) + halfTube(b, mid, nodes[(i + 1) % nodes.length].r)
  })
  nodes.forEach((n, i) => (s += bowl(v[i], n.c, n.held)))
  return s
}

// Faceted obsidian with black holes; bosses are veined with gold, frost
// layers with ice.
function obsidian(cx: number, cy: number, R: number, sides: number, holes: P[], boss = false, frost = false): string {
  const v = ngon(cx, cy, R, sides)
  const t = ngon(cx, cy, R * 0.45, sides)
  const shades = ['#3d2f63', '#1c1432', '#2b2149', '#110b1f', '#241a3d', '#150e26']
  let s = ''
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides
    s += `<polygon points="${pts([v[i], v[j], t[j], t[i]])}" fill="${shades[i % shades.length]}"/>`
  }
  s += `<polygon points="${pts(t)}" fill="#0e0a1a"/>`
  if (boss || frost) {
    const vein = boss ? GILT : FROST
    s += t.map((p, i) => `<polyline points="${pts([p, [(p[0] + v[i][0]) / 2 + 2, (p[1] + v[i][1]) / 2 - 1], v[i]])}" fill="none" stroke="${vein}" stroke-width="1.2"/>`).join('')
  }
  if (frost) s += `<polygon points="${pts(v)}" fill="none" stroke="${FROST}" stroke-opacity=".45" stroke-width="3"/>`
  s += `<polygon points="${pts(v)}" fill="none" stroke="${boss ? GILT : frost ? RIME : '#cdbbff'}" stroke-opacity=".8" stroke-width="1.2"/>`
  for (const [x, y] of holes) {
    s += `<circle cx="${x}" cy="${y}" r="5.5" fill="#ffb46e" opacity=".35" filter="url(#soft)"/>
      <circle cx="${x}" cy="${y}" r="3.9" fill="none" stroke="#e6dcff" stroke-opacity=".7" stroke-width="1"/>
      <circle cx="${x}" cy="${y}" r="3" fill="#000"/>`
  }
  return s
}

// Ice: glazed obsidian rimed in frost, with motes glowing inside.
function ice(cx: number, cy: number, R: number, sides: number, motes: string[]): string {
  const v = ngon(cx, cy, R, sides)
  let s = obsidian(cx, cy, R, sides, [])
  s += `<polygon points="${pts(v)}" fill="${FROST}" fill-opacity=".2" stroke="${FROST}" stroke-opacity=".85" stroke-width="2.2"/>`
  s += v.map(([x, y]) => `<line x1="${f(cx + (x - cx) * 0.9)}" y1="${f(cy + (y - cy) * 0.9)}" x2="${f(cx + (x - cx) * 0.5)}" y2="${f(cy + (y - cy) * 0.5)}" stroke="${RIME}" stroke-opacity=".5" stroke-width="1"/>`).join('')
  ngon(cx, cy, R * 0.78, sides).forEach(([x, y], i) => {
    const c = motes[i]
    if (c) s += `<circle cx="${f(x)}" cy="${f(y)}" r="5.5" fill="${c}" opacity=".45" filter="url(#soft)"/><circle cx="${f(x)}" cy="${f(y)}" r="2.8" fill="${c}"/>`
  })
  return s
}

// A burning fuse around a cast rune: the charred ring, the length still to
// burn (clockwise from the top), and the spark at its tip.
function fuse(cx: number, cy: number, r: number, left: number): string {
  const a = ((-90 + left * 360) * Math.PI) / 180
  const [tx, ty] = [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  const large = left > 0.5 ? 1 : 0
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#4a140c" stroke-width="1.4" opacity=".8"/>
    <path d="M${cx} ${cy - r} A${r} ${r} 0 ${large} 1 ${f(tx)} ${f(ty)}" fill="none" stroke="${FLAME}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="${f(tx)}" cy="${f(ty)}" r="6" fill="${FLAME}" opacity=".6" filter="url(#soft)"/><circle cx="${f(tx)}" cy="${f(ty)}" r="2.6" fill="${SPARK}"/>
    ${[[-6, -9], [5, -13], [-2, -18]].map(([dx, dy]) => `<circle cx="${f(tx + dx)}" cy="${f(ty + dy)}" r="1" fill="${SPARK}" opacity=".8"/>`).join('')}`
}

// What a burned rune leaves: charred, cracked glass, embers and rising ash.
function burned(cx: number, cy: number, R: number, sides: number): string {
  const v = ngon(cx, cy, R, sides)
  let s = `<circle cx="${cx}" cy="${cy}" r="${R + 6}" fill="${EMBER}" opacity=".22" filter="url(#softer)"/>`
  s += `<polygon points="${pts(v)}" fill="#2b1c16" fill-opacity=".55" stroke="#5a3a2c" stroke-width="2.4" stroke-dasharray="14 5 6 7"/>`
  s += `<polyline points="${pts([[cx - R * 0.5, cy - R * 0.2], [cx - R * 0.1, cy + R * 0.05], [cx + R * 0.15, cy - R * 0.25], [cx + R * 0.45, cy + R * 0.1]])}" fill="none" stroke="${FLAME}" stroke-opacity=".7" stroke-width="1"/>`
  for (const [dx, dy, r] of [[-8, -R - 6, 7], [6, -R - 16, 9], [-2, -R - 30, 11]]) s += `<circle cx="${cx + dx}" cy="${cy + dy}" r="${r}" fill="${ASH}" opacity=".3" filter="url(#soft)"/>`
  for (const [dx, dy] of [[-R * 0.6, R * 0.5], [R * 0.4, R * 0.7], [R * 0.2, -R * 0.9], [-R * 0.3, -R * 1.2]]) s += `<circle cx="${f(cx + dx)}" cy="${f(cy + dy)}" r="1.4" fill="${EMBER}"/>`
  return s
}

// The next shape's outline, dotted with its strength (as ObstacleView).
function ghost(cx: number, cy: number, R: number, sides: number, hp = 0): string {
  const v = ngon(cx, cy, R, sides)
  let s = `<polygon points="${pts(v)}" fill="#05030a" fill-opacity=".25" stroke="#05030a" stroke-opacity=".6" stroke-width="3.5"/>
   <polygon points="${pts(v)}" fill="none" stroke="#b9a2ff" stroke-opacity=".75" stroke-width="1"/>`
  for (let k = 0; k < hp; k++) {
    const u = ((k + 0.5) / hp) * sides
    const i = Math.floor(u)
    const [ax, ay] = v[i]
    const [bx, by] = v[(i + 1) % sides]
    const x = ax + (bx - ax) * (u - i)
    const y = ay + (by - ay) * (u - i)
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="3.6" fill="#cdb8ff" fill-opacity=".6"/><circle cx="${f(x)}" cy="${f(y)}" r="2.6" fill="#030108"/>`
  }
  return s
}

// A null: a hollow silver bead. A void: a dark hole ringed in violet.
const nullMote = (x: number, y: number) =>
  `<circle cx="${x}" cy="${y}" r="8" fill="${NULL}" opacity=".14" filter="url(#softer)"/>
   <circle cx="${x}" cy="${y}" r="4.4" fill="${NULL}" fill-opacity=".25" stroke="#f4f6fb" stroke-width="1.3"/>`
const voidMote = (x: number, y: number) =>
  `<circle cx="${x}" cy="${y}" r="9" fill="${VOID_RIM}" opacity=".22" filter="url(#soft)"/>
   <circle cx="${x}" cy="${y}" r="5" fill="${VOID}" stroke="${VOID_RIM}" stroke-width="1.4"/>`

// A bowl holding a null (clear, unlit) or a void (ink).
const blankBowl = ([x, y]: P, c: string, kind: 'null' | 'void') =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="5.8" fill="${c}" fill-opacity=".3" stroke="${c}" stroke-width="2.6"/>` +
  `<circle cx="${f(x)}" cy="${f(y)}" r="4.6" fill="${kind === 'void' ? VOID : NULL}" fill-opacity="${kind === 'void' ? 1 : 0.6}"/>`

// Clamps over a rune's bowls where a fuse would burn: it is locked on.
const clamps = (cx: number, cy: number, r: number, sides: number, color: string) =>
  ngon(cx, cy, r, sides)
    .map(([x, y]) => {
      const a = Math.atan2(y - cy, x - cx)
      const [a0, a1] = [a - 0.3, a + 0.3]
      const p = (t: number, rr: number): P => [cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]
      const [s0, e0, e1, s1] = [p(a0, r - 4), p(a0, r), p(a1, r), p(a1, r - 4)]
      return `<path d="M${f(s0[0])} ${f(s0[1])}L${f(e0[0])} ${f(e0[1])}A${r} ${r} 0 0 1 ${f(e1[0])} ${f(e1[1])}L${f(s1[0])} ${f(s1[1])}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>`
    })
    .join('')

// An arc of a shield round (cx, cy) from angle a0 to a1 (degrees), its
// strength in pips, the first `pulled` of them hollow.
function shieldArc(cx: number, cy: number, r: number, a0: number, a1: number, color: string, strength: number, pulled: number): string {
  const p = (deg: number): P => [cx + Math.cos((deg * Math.PI) / 180) * r, cy + Math.sin((deg * Math.PI) / 180) * r]
  const [s, e] = [p(a0), p(a1)]
  const large = a1 - a0 > 180 ? 1 : 0
  const d = `M${f(s[0])} ${f(s[1])}A${r} ${r} 0 ${large} 1 ${f(e[0])} ${f(e[1])}`
  let out = `<path d="${d}" fill="none" stroke="${color}" stroke-width="8" opacity=".22" filter="url(#soft)"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.2"/>`
  for (let k = 0; k < strength; k++) {
    const [x, y] = p(a0 + ((a1 - a0) * (k + 0.5)) / strength)
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="3.3" fill="#0c0616"/>`
    out += k < pulled ? `<circle cx="${f(x)}" cy="${f(y)}" r="2.1" fill="none" stroke="${color}" stroke-width="1"/>` : `<circle cx="${f(x)}" cy="${f(y)}" r="2.4" fill="#fff" opacity=".85"/>`
  }
  return out
}

// A thread from a rune to what it is locked onto: a taut double wire (or,
// hauling on a shield, one in the shield's color).
const wire = (x1: number, y1: number, x2: number, y2: number, color: string, double = true) => {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const [nx, ny] = [(-(y2 - y1) / len) * 1.6, ((x2 - x1) / len) * 1.6]
  const line = (o: number) => `<line x1="${f(x1 + nx * o)}" y1="${f(y1 + ny * o)}" x2="${f(x2 + nx * o)}" y2="${f(y2 + ny * o)}" stroke="${color}" stroke-opacity=".6" stroke-width="1"/>`
  return double ? line(1) + line(-1) : line(0)
}

const label = (x: number, y: number, text: string, anchor = 'start') =>
  `<text x="${x}" y="${y}" fill="#efe8ff" fill-opacity=".85" font-size="10.5" font-style="italic" font-family="Cormorant Garamond, Georgia, serif" text-anchor="${anchor}">${text}</text>`
const leader = (x1: number, y1: number, x2: number, y2: number) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${GILT}" stroke-opacity=".7" stroke-width=".7"/><circle cx="${x2}" cy="${y2}" r="1.3" fill="${GILT}"/>`

const allRuby = (held?: string): RuneNode[] => Array.from({ length: 4 }, () => ({ c: RUBY, r: RUBY, held }))

const PAGES: { title: string; text: string; svg: string }[] = [
  {
    title: 'Cast a rune',
    text: 'Drag a rune into the field: its next layer comes to your hand at once. Motes it can hold that lie inside it flow straight into its bowls. Then it spins, and each glass bowl on its rim catches motes of its own color as it sweeps past.',
    svg: `<circle cx="110" cy="68" r="31" fill="none" stroke="#7cffb2" stroke-width="16" opacity=".06"/>
      ${rune(110, 68, 31, allRuby(), 3)}
      ${mote(150, 58, RUBY)}${mote(82, 100, RUBY)}${mote(196, 34, SAPPHIRE)}`,
  },
  {
    title: 'Detonate',
    text: 'When every bowl is full it glows. Tap it: the glass implodes, and the gathered liquid strikes the nearest obstacle matching the shape of light inside, one blow per bowl. A thread shows which.',
    svg: `<line x1="72" y1="86" x2="178" y2="34" stroke="#e6dcff" stroke-opacity=".5" stroke-width="1"/>
      ${[0.3, 0.52, 0.74].map((k) => `<circle cx="${f(72 + 106 * k)}" cy="${f(86 - 52 * k)}" r="2" fill="#f1e9ff" opacity=".85"/>`).join('')}
      ${obsidian(182, 34, 21, 3, [[182, 38], [176, 31], [188, 31]])}
      <circle cx="140" cy="54" r="9" fill="${RUBY}" opacity=".6" filter="url(#softer)"/><circle cx="140" cy="54" r="4.6" fill="#ff9fb3"/>
      ${rune(72, 86, 30, allRuby(RUBY), 3, true)}`,
  },
  {
    title: 'Transmute',
    text: 'Bowl color is what a node catches; tube color is what its mote becomes when the glass breaks. A cracked grey tube destroys its mote instead. A shape drawn only in light is never cast: it is what the layer around it strikes.',
    svg: `${rune(78, 70, 36, [
      { c: RUBY, r: AMBER },
      { c: RUBY, r: null },
      { c: RUBY, r: AMBER },
    ], 4)}
      ${leader(150, 27, 84.5, 33)}${label(153, 30, 'catches')}
      ${leader(150, 55, 89.5, 52)}${label(153, 58, 'becomes')}
      ${leader(150, 91, 103, 75)}${label(153, 94, 'destroyed')}`,
  },
  {
    title: 'Flick and push',
    text: 'Swipe a mote to flick it that way: it travels at least as far as your swipe, farther the quicker you flick. Flicked into a rune, it flies to a bowl that can hold it; a rune pushes out the motes it can’t hold. Opal motes are wild: any bowl takes one, so keep them clear of runes that shouldn’t spend them.',
    svg: `<path d="M44 92 Q70 84 96 74" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="16" stroke-linecap="round"/>
      <path d="M52 89 Q72 83 96 74" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>
      <circle cx="96" cy="74" r="4" fill="#fff" opacity=".75"/>
      <ellipse cx="128" cy="62" rx="26" ry="5" transform="rotate(-18 128 62)" fill="${SAPPHIRE}" opacity=".35" filter="url(#softer)"/>
      ${mote(158, 52, SAPPHIRE)}
      <path d="M172 47 L196 39" stroke="${GLASS}" stroke-opacity=".6" stroke-width="1.2" stroke-dasharray="3 3"/>
      <path d="M190 36 L197 39 L192 45" fill="none" stroke="${GLASS}" stroke-opacity=".6" stroke-width="1.2"/>
      ${label(70, 110, 'swipe', 'middle')}`,
  },
  {
    title: 'Obstacles',
    text: "Black holes are an obstacle's strength: each blow swallows one. The ghostly outline is the shape it becomes next, dotted with its strength. Blows left over when a shape breaks are wasted: they never carry into the next.",
    svg: `${ghost(110, 72, 60, 4, 6)}
      ${obsidian(110, 76, 37, 3, [[110, 82], [101, 73], [119, 73], [110, 64]])}`,
  },
  {
    title: 'Ice and frost',
    text: 'Ice takes up room: nothing can be cast over it. A blow of its shape breaks it and frees any motes inside. A frost-veined layer freezes a rune whose blow leaves it standing: the rune turns to ice with its motes locked inside, until that ice breaks or the frost layer falls.',
    svg: `${[0.2, 0.35, 0.5, 0.65, 0.8].map((k) => `<circle cx="${f(72 + 88 * k)}" cy="${f(84 - 44 * k)}" r="1.3" fill="${FROST}" opacity=".7"/>`).join('')}
      ${obsidian(166, 40, 28, 3, [[166, 46], [158, 37], [174, 37]], false, true)}
      ${ice(66, 86, 30, 4, [RUBY, SAPPHIRE, RUBY])}
      ${label(166, 90, 'frost', 'middle')}${label(66, 128, 'ice', 'middle')}`,
  },
  {
    title: 'Fire and fuses',
    text: 'In the fire levels every rune you cast has a fuse. Fill it and burst it before the fuse burns down, or it burns: the motes it holds turn to ash, and its shape is gone without a blow. Gather its motes first and cast it onto them, and it fills at once. Letting a layer you don’t need burn is one way past it.',
    svg: `${fuse(70, 62, 44, 0.62)}
      ${rune(70, 62, 29, [
      { c: GARNET, r: CITRINE, held: GARNET },
      { c: GARNET, r: CITRINE, held: GARNET },
      { c: GARNET, r: CITRINE },
      { c: GARNET, r: CITRINE },
    ], 3)}
      ${burned(168, 70, 25, 4)}
      ${label(70, 124, 'fuse', 'middle')}${label(168, 124, 'burned', 'middle')}`,
  },
  {
    title: 'Nulls and voids',
    text: 'A null, a hollow silver bead, fills any bowl but adds nothing to the blow; it comes out in its tube’s color. A void, a dark hole, fills any bowl and adds nothing, and it comes out a void. Only a cracked grey tube gets rid of one. Bowls take their own color first. Some runes arrive with cups already full.',
    svg: `${rune(70, 68, 33, [
      { c: RUBY, r: AMBER, held: RUBY },
      { c: RUBY, r: AMBER, held: RUBY },
      { c: RUBY, r: null },
      { c: RUBY, r: AMBER },
    ], 3)}
      ${blankBowl(ngon(70, 68, 33, 4)[2], RUBY, 'void')}${blankBowl(ngon(70, 68, 33, 4)[3], RUBY, 'null')}
      ${nullMote(150, 40)}${voidMote(178, 86)}
      ${label(162, 44, 'null')}${label(190, 90, 'void')}`,
  },
  {
    title: 'Two shapes',
    text: 'An obstacle of two shapes woven together takes a pair of blows at once: one of each shape. A full rune linked to it waits, still, with no fuse, for the other. With both there, tap either: they strike together, their power combined.',
    svg: `${wire(58, 98, 108, 48, STASIS)}${wire(162, 98, 112, 48, STASIS)}
      <polygon points="${pts(ngon(110, 40, 26, 3))}" fill="#1c1432" stroke="#cdbbff" stroke-width="1.6"/>
      <polygon points="${pts(ngon(110, 40, 21, 4, -75))}" fill="#241a3d" fill-opacity=".85" stroke="#cdbbff" stroke-width="1.6"/>
      <polygon points="${pts(ngon(110, 40, 26, 3))}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.4"/>
      ${clamps(58, 98, 32, 4, STASIS)}${rune(58, 98, 22, allRuby(RUBY), 3, true)}
      ${clamps(162, 98, 30, 3, STASIS)}${rune(162, 98, 20, [
      { c: SAPPHIRE, r: SAPPHIRE, held: SAPPHIRE },
      { c: SAPPHIRE, r: SAPPHIRE, held: SAPPHIRE },
      { c: SAPPHIRE, r: SAPPHIRE, held: SAPPHIRE },
    ], 4, true)}`,
  },
  {
    title: 'Shields',
    text: 'A colored arc is a shield: while one is up, nothing strikes that obstacle. A rune with bowls of its color (ash cups aside) latches on, with no fuse, and pulls it down with the motes of that color it holds, full or not. Its pips go hollow as it gives. When the obstacle’s shape breaks, the pullers go free.',
    svg: `${wire(62, 92, 150, 44, RUBY, false)}
      ${obsidian(150, 44, 24, 5, [[150, 48], [143, 41], [157, 41]])}
      ${shieldArc(150, 44, 36, -80, 80, RUBY, 2, 1)}${shieldArc(150, 44, 36, 100, 260, SAPPHIRE, 2, 0)}
      ${clamps(62, 92, 34, 4, RUBY)}${rune(62, 92, 24, [
      { c: RUBY, r: RUBY, held: RUBY },
      { c: RUBY, r: RUBY },
      { c: AMBER, r: AMBER },
      { c: AMBER, r: AMBER },
    ], 3)}`,
  },
  {
    title: 'Order matters',
    text: 'Every puzzle has a way through. Think about what each rune makes, where its motes will land, and what it leaves room for. Undo and restart are always there.',
    svg: `<circle cx="110" cy="68" r="42" fill="none" stroke="${GLASS}" stroke-width="1" opacity=".35"/>
      <circle cx="110" cy="68" r="27" fill="none" stroke="${GLASS}" stroke-width="1" opacity=".55" stroke-dasharray="3 4"/>
      ${mote(110, 27, RUBY)}${mote(151, 68, SAPPHIRE)}${mote(110, 109, AMBER)}${mote(69, 68, RUBY)}`,
  },
  {
    title: 'Endless',
    text: 'One life, no undo. Runes and obstacles never run out. A cast layer has ten seconds to detonate, or it freezes into ice holding its motes until broken. Gold-veined bosses reveal more of each rune’s future.',
    svg: `${ghost(110, 72, 52, 5)}
      ${obsidian(110, 74, 36, 3, [[110, 80], [101, 71], [119, 71]], true)}`,
  },
]

export function showHowToPlay(onClose: () => void): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = 'howto'
  let page = 0

  const card = document.createElement('div')
  card.className = 'howto-card panel'
  addFiligree(card)
  const art = document.createElement('div')
  art.className = 'howto-art'
  const title = document.createElement('div')
  title.className = 'howto-title gilt-text'
  const text = document.createElement('div')
  text.className = 'howto-text'
  const dots = document.createElement('div')
  dots.className = 'howto-dots'
  const nav = document.createElement('div')
  nav.className = 'result-buttons'
  const prev = document.createElement('button')
  prev.className = 'btn'
  prev.textContent = 'Back'
  const next = document.createElement('button')
  next.className = 'btn primary'
  const close = document.createElement('button')
  close.className = 'howto-close'
  close.textContent = '✕'
  close.setAttribute('aria-label', 'Close')

  const render = () => {
    const p = PAGES[page]
    art.innerHTML = `<svg viewBox="0 0 220 130" width="100%" height="100%">${DEFS}${p.svg}</svg>`
    title.textContent = p.title
    text.textContent = p.text
    dots.innerHTML = PAGES.map((_, i) => `<span class="${i === page ? 'on' : ''}"></span>`).join('')
    prev.style.visibility = page === 0 ? 'hidden' : 'visible'
    next.textContent = page === PAGES.length - 1 ? 'Begin' : 'Next'
  }
  const go = (d: number) => {
    page = Math.max(0, Math.min(PAGES.length - 1, page + d))
    render()
  }
  prev.addEventListener('click', () => go(-1))
  next.addEventListener('click', () => (page === PAGES.length - 1 ? onClose() : go(1)))
  close.addEventListener('click', onClose)

  // Horizontal swipe to page.
  let startX: number | null = null
  card.addEventListener('pointerdown', (e) => (startX = e.clientX))
  card.addEventListener('pointerup', (e) => {
    if (startX === null) return
    const dx = e.clientX - startX
    startX = null
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
  })

  nav.append(prev, next)
  card.append(close, art, title, text, dots, nav)
  overlay.append(card)
  document.body.appendChild(overlay)
  render()
  return overlay
}
