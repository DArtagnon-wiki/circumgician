import { moveLabel, type Blow, type LevelProfile, type TensionPoint } from './solver'
import type { LevelData } from './types'

// Plain-text decision profile of a level, for `npm run analyze-levels`.

const SHAPES: Record<number, string> = { 3: 'tri', 4: 'sq', 5: 'pent', 6: 'hex', 7: 'hept', 8: 'oct' }
const shape = (sides: number) => SHAPES[sides] ?? `${sides}-gon`

function percent(x: number): string {
  if (x > 0 && x < 0.005) return '<1%'
  if (x < 1 && x > 0.995) return '>99%'
  return `${Math.round(x * 100)}%`
}

const blowLabel = (b: Blow) => moveLabel({ kind: 'fire', rune: b.rune, layer: b.layer, target: b.target })

export function formatProfile(level: LevelData, p: LevelProfile, maxTraps = 8): string {
  const out = [`${level.name} (${level.id})`]
  out.push(`  obstacles  ${level.obstacles.map((o, i) => `O${i} ${o.layers.map((l) => `${shape(l.sides)} ${l.hp}`).join(' > ')}`).join(' | ')}`)
  if (!p.winnable) {
    out.push('  UNWINNABLE: no order of fills and detonations clears every obstacle')
    return out.join('\n')
  }
  out.push(`  plans      ${p.plans.length}${p.morePlans ? '+' : ''} (random legal moves win ${percent(p.blindLuck)} of the time; the cleanest win wastes ${p.cleanest})`)
  for (const plan of p.plans.slice(0, 4)) {
    const notes = [plan.wasted ? `wastes ${plan.wasted}` : '', plan.unlinked ? `${plan.unlinked} unlinked` : ''].filter(Boolean)
    out.push(`    ${plan.blows.map(blowLabel).join('  ')}${notes.length ? `   (${notes.join(', ')})` : ''}`)
  }
  if (p.plans.length > 4) out.push(`    ...and ${p.plans.length - 4}${p.morePlans ? '+' : ''} more`)
  const hidden = p.traps.filter((t) => t.revealedAfter >= 2).length
  const deepest = p.traps.reduce((d, t) => Math.max(d, t.revealedAfter), 0)
  out.push(`  decisions  ${p.decisions} of ${p.states} winning-line states have a losing move (${p.forced} with one way on)`)
  out.push(`  traps      ${p.traps.length}, ${hidden} hidden for 2+ moves, deepest ${deepest}`)
  for (const t of p.traps.slice(0, maxTraps)) {
    const when = t.revealedAfter === 0 ? 'lost at once' : `lost ${t.revealedAfter} move${t.revealedAfter === 1 ? '' : 's'} later`
    out.push(`    after ${t.after.length ? t.after.join(', ') : 'nothing'}: ${t.move} -> ${when}`)
  }
  if (p.traps.length > maxTraps) out.push(`    ...and ${p.traps.length - maxTraps} more`)
  return out.join('\n')
}

const SPARK = ' ▁▂▃▄▅▆▇█'
const two = (x: number) => x.toFixed(2).replace(/^0/, '')

// Releases: drops of at least RELEASE from a peak of at least PEAK, before
// the win itself (always the last release).
const RELEASE = 0.3
const PEAK = 0.5

export function tensionShape(points: TensionPoint[]): { peaks: number[]; releases: number } {
  const peaks: number[] = []
  let high = 0
  for (const p of points.slice(0, -1)) {
    const t = p.tension.tension
    if (t > high) high = t
    else if (high >= PEAK && t <= high - RELEASE) {
      peaks.push(high)
      high = t
    }
  }
  const releases = peaks.length
  if (high >= PEAK) peaks.push(high)
  return { peaks, releases }
}

// Tension along a line of moves, one row per state, for pacing levels.
export function formatTension(points: TensionPoint[], title = 'the intended line'): string {
  const curve = points.map((p) => SPARK[Math.round(p.tension.tension * 8)]).join('')
  const { peaks, releases } = tensionShape(points)
  const out = [`  tension    ${curve}  along ${title} (peaks ${peaks.map(two).join(' ') || 'none'}; ${releases} release${releases === 1 ? '' : 's'} before the win)`]
  for (const p of points) {
    const t = p.tension
    const bar = '█'.repeat(Math.round(t.tension * 10)).padEnd(10, '·')
    const label = (p.after ? moveLabel(p.after) : 'start').padEnd(16)
    const notes = [
      t.moves ? `${t.losing}/${t.moves} moves lose` : '',
      t.tight ? (t.margin === 0 ? `not one ${t.tight} to spare` : `${t.margin} ${t.tight} to spare`) : '',
    ].filter(Boolean)
    out.push(`    ${label} ${bar} ${two(t.tension)}  ${notes.join(', ')}`)
  }
  return out.join('\n')
}
