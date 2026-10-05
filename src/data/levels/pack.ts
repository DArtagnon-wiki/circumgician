import { parseLevel } from '../../sim/validate'
import type { LevelData } from '../../sim/types'
import manifest from './manifest.json'

// Bundled statically: the deployed game never fetches level files at runtime.
const files = import.meta.glob<unknown>(['./*.json', './debug/*.json', '!./manifest.json'], { eager: true, import: 'default' })

function load(path: string): LevelData {
  const raw = files[path]
  if (raw === undefined) throw new Error(`Level file missing: ${path}`)
  try {
    return parseLevel(raw)
  } catch (e) {
    throw new Error(`${path}: ${(e as Error).message}`)
  }
}

// The pack is a tarot deck: each section (a suit, then the Major Arcana)
// takes the next `count` levels, marked by rank (A, 2 ... 10, P, Kn, Q, K)
// or by trump number in Roman numerals (0, I ... XXI).
export interface PackSection {
  title: string
  count: number
  marks: 'ranks' | 'roman'
}

export interface PackManifest {
  levels: string[]
  sections: PackSection[]
  debug: string[]
}

export const MANIFEST: PackManifest = manifest as PackManifest
export const PACK: LevelData[] = MANIFEST.levels.map((id) => load(`./${id}.json`))
export const DEBUG_PACK: LevelData[] = MANIFEST.debug.map((id) => load(`./debug/${id}.json`))

const RANK_MARKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'P', 'Kn', 'Q', 'K']
function roman(n: number): string {
  if (n === 0) return '0'
  const parts: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, s] of parts) {
    while (n >= v) {
      out += s
      n -= v
    }
  }
  return out
}

// Each pack level's section and its mark there, in pack order.
export const PACK_PLACES: { section: PackSection; mark: string }[] = MANIFEST.sections.flatMap((section) =>
  Array.from({ length: section.count }, (_, i) => ({ section, mark: section.marks === 'roman' ? roman(i) : (RANK_MARKS[i] ?? String(i + 1)) })),
)
