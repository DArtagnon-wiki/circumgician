import './ui.css'

// Paged "How to play" overlay: one small diagram and a line or two per page.
// Diagrams are inline SVG drawn in the game's own visual language.

const RED = '#ff4757'
const BLUE = '#3742fa'
const GOLD = '#ffa502'
const BODY = '#d8d0f0'

const tri = (cx: number, cy: number, r: number, rot = -90) =>
  [0, 1, 2].map((i) => {
    const a = ((rot + i * 120) * Math.PI) / 180
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`
  }).join(' ')
const sq = (cx: number, cy: number, r: number) =>
  [0, 1, 2, 3].map((i) => {
    const a = ((-90 + i * 90) * Math.PI) / 180
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`
  }).join(' ')
const mote = (x: number, y: number, c: string) => `<circle cx="${x}" cy="${y}" r="9" fill="${c}" opacity=".18"/><circle cx="${x}" cy="${y}" r="4" fill="${c}"/>`
const node = (x: number, y: number, ring: string, dot: string, filled = false) =>
  `<circle cx="${x}" cy="${y}" r="5.5" fill="${filled ? ring : '#0d0718'}" stroke="${ring}" stroke-width="2.2"/><circle cx="${x}" cy="${y}" r="2.2" fill="${dot}"/>`
const hole = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="7" fill="#b89cff" opacity=".12"/><circle cx="${x}" cy="${y}" r="4.2" fill="none" stroke="#ffd9a0" stroke-width="1.3"/><circle cx="${x}" cy="${y}" r="3" fill="#000"/>`

// A rune: square outer with red nodes, triangle middle.
const rune = (cx: number, cy: number, filled: boolean) => {
  const pts = [0, 1, 2, 3].map((i) => {
    const a = ((-90 + i * 90) * Math.PI) / 180
    return [cx + Math.cos(a) * 30, cy + Math.sin(a) * 30]
  })
  return `<polygon points="${sq(cx, cy, 30)}" fill="${BODY}" fill-opacity=".06" stroke="${BODY}" stroke-width="2.5"/>
    <polygon points="${tri(cx, cy, 17)}" fill="${BODY}" opacity=".85"/>
    ${pts.map(([x, y]) => node(x, y, RED, GOLD, filled)).join('')}`
}

const PAGES: { title: string; text: string; svg: string }[] = [
  {
    title: 'Cast a rune',
    text: 'Drag a rune from your hand into the field. It spins, and each node on its rim catches motes of its ring color as it sweeps past.',
    svg: `${rune(110, 70, false)}
      <circle cx="110" cy="70" r="30" fill="none" stroke="#7cffb2" stroke-width="18" opacity=".08"/>
      ${mote(150, 62, RED)}${mote(84, 100, RED)}${mote(200, 40, BLUE)}`,
  },
  {
    title: 'Detonate',
    text: 'When every node holds a mote the rune glows. Tap it: its outer shape shatters and strikes the obstacle matching its inner shape, one blow per node.',
    svg: `<polygon points="${tri(190, 34, 22)}" fill="#4a3d6b" stroke="#fff" stroke-width="2"/>
      <line x1="110" y1="80" x2="186" y2="40" stroke="#fff" stroke-width="2" opacity=".5"/>
      <circle cx="110" cy="80" r="42" fill="#fff" opacity=".12"/>${rune(110, 80, true)}`,
  },
  {
    title: 'Transmute',
    text: "Each caught mote becomes the color of its node's inner dot and bursts outward. The rune returns to your hand one layer thinner.",
    svg: `<polygon points="${tri(110, 70, 22)}" fill="${BODY}" fill-opacity=".06" stroke="${BODY}" stroke-width="2.5" stroke-dasharray="6 5"/>
      ${mote(110, 12, GOLD)}${mote(160, 98, GOLD)}${mote(60, 98, GOLD)}
      <path d="M110 44 L110 22 M132 82 L152 94 M88 82 L68 94" stroke="${GOLD}" stroke-width="2" opacity=".5"/>`,
  },
  {
    title: 'Flick and push',
    text: 'Tap beside a mote to flick it away from your finger. Runes push stray motes out of their bodies, so nothing stays trapped inside.',
    svg: `${mote(120, 70, BLUE)}<path d="M120 70 L70 70" stroke="${BLUE}" stroke-width="3" opacity=".4"/>
      <circle cx="146" cy="70" r="12" fill="#fff" opacity=".15"/><circle cx="146" cy="70" r="4" fill="#fff" opacity=".7"/>
      <text x="146" y="100" fill="#cfc4ee" font-size="11" text-anchor="middle" font-family="Georgia">tap</text>`,
  },
  {
    title: 'Obstacles',
    text: "Black holes are an obstacle's strength: each blow swallows one. The outline around it is the shape it becomes next.",
    svg: `<polygon points="${sq(110, 70, 58)}" fill="#9b7bff" fill-opacity=".05" stroke="#d8c8ff" stroke-width="1.5" opacity=".6"/>
      <polygon points="${tri(110, 76, 36)}" fill="#4a3d6b" stroke="#fff" stroke-width="2"/>
      ${hole(110, 80)}${hole(98, 70)}${hole(122, 70)}${hole(110, 60)}`,
  },
  {
    title: 'Order matters',
    text: 'Every puzzle has a way through. Think about what each rune makes, where its motes will land, and what it leaves room for. Undo and restart are always there.',
    svg: `<circle cx="110" cy="70" r="40" fill="none" stroke="${BODY}" stroke-width="1.5" opacity=".4"/>
      <circle cx="110" cy="70" r="26" fill="none" stroke="${BODY}" stroke-width="1.5" opacity=".6"/>
      ${mote(110, 30, RED)}${mote(150, 70, BLUE)}${mote(110, 110, GOLD)}${mote(70, 70, RED)}`,
  },
  {
    title: 'Endless',
    text: 'One life, no undo. Obstacles and runes never run out and slowly grow stranger. Breaking a gilded boss reveals more of each rune’s future.',
    svg: `<polygon points="${tri(110, 72, 34)}" fill="#4a3d6b" stroke="#fff" stroke-width="2"/>
      <polygon points="${tri(110, 72, 40)}" fill="none" stroke="#ffc857" stroke-width="2.5"/>
      <circle cx="101" cy="22" r="2.5" fill="#ffc857"/><circle cx="110" cy="22" r="2.5" fill="#ffc857"/><circle cx="119" cy="22" r="2.5" fill="#ffc857"/>
      ${hole(110, 80)}${hole(100, 70)}${hole(120, 70)}`,
  },
]

export function showHowToPlay(onClose: () => void): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = 'howto'
  let page = 0

  const card = document.createElement('div')
  card.className = 'howto-card'
  const art = document.createElement('div')
  art.className = 'howto-art'
  const title = document.createElement('div')
  title.className = 'howto-title'
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
    art.innerHTML = `<svg viewBox="0 0 220 130" width="100%" height="100%">${p.svg}</svg>`
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
