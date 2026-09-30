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
  <radialGradient id="glass" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".04"/><stop offset=".72" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".45"/></radialGradient>
</defs>`

// A luminous heart shedding a curl of smoke.
const mote = (x: number, y: number, c: string) =>
  `<circle cx="${x}" cy="${y}" r="9" fill="${c}" opacity=".32" filter="url(#softer)"/>
   <ellipse cx="${x + 3}" cy="${y - 7}" rx="4" ry="6" fill="${c}" opacity=".35" filter="url(#soft)"/>
   <circle cx="${x}" cy="${y}" r="3.8" fill="${c}"/><circle cx="${x}" cy="${y}" r="1.5" fill="#fff" opacity=".7"/>`

// Glass bowl tinted with its catch color; liquid if something is held.
const bowl = ([x, y]: P, c: string, liquid?: string) =>
  (liquid ? `<circle cx="${f(x)}" cy="${f(y)}" r="9" fill="${liquid}" opacity=".45" filter="url(#soft)"/>` : '') +
  `<circle cx="${f(x)}" cy="${f(y)}" r="6" fill="url(#glass)" stroke="${c}" stroke-width="1.6"/>` +
  (liquid ? `<circle cx="${f(x)}" cy="${f(y)}" r="4.3" fill="${liquid}"/>` : '') +
  `<ellipse cx="${f(x - 2)}" cy="${f(y - 2.4)}" rx="1.8" ry="1.1" fill="#fff" opacity=".85"/>`

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

const label = (x: number, y: number, text: string, anchor = 'start') =>
  `<text x="${x}" y="${y}" fill="#efe8ff" fill-opacity=".85" font-size="10.5" font-style="italic" font-family="Cormorant Garamond, Georgia, serif" text-anchor="${anchor}">${text}</text>`
const leader = (x1: number, y1: number, x2: number, y2: number) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${GILT}" stroke-opacity=".7" stroke-width=".7"/><circle cx="${x2}" cy="${y2}" r="1.3" fill="${GILT}"/>`

const allRuby = (held?: string): RuneNode[] => Array.from({ length: 4 }, () => ({ c: RUBY, r: RUBY, held }))

const PAGES: { title: string; text: string; svg: string }[] = [
  {
    title: 'Cast a rune',
    text: 'Drag a rune into the field: its next layer comes to your hand at once. The cast layer spins, and each glass bowl on its rim catches motes of its own color as it sweeps past.',
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
    text: 'Tap beside a mote to flick it away from your finger. Runes push stray motes out of their bodies, so nothing stays trapped inside.',
    svg: `<ellipse cx="92" cy="70" rx="30" ry="6" fill="${SAPPHIRE}" opacity=".35" filter="url(#softer)"/>
      <ellipse cx="72" cy="69" rx="16" ry="4" fill="${SAPPHIRE}" opacity=".3" filter="url(#soft)"/>
      ${mote(120, 70, SAPPHIRE)}
      <circle cx="148" cy="70" r="12" fill="#fff" opacity=".12"/><circle cx="148" cy="70" r="4" fill="#fff" opacity=".75"/>
      ${label(148, 98, 'tap', 'middle')}`,
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
