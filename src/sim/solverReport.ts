import { moveLabel, type Blow, type LevelProfile } from './solver'
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
