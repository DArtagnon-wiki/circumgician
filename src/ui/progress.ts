// Simple completed-checkmark tracking for level select — no progression
// gating, purely cosmetic. Tolerant of storage being unavailable (private
// browsing, disabled storage) since this is non-critical decoration.
const STORAGE_KEY = 'circumgician:completedLevels'

function readCompleted(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function isLevelCompleted(levelId: string): boolean {
  return readCompleted().has(levelId)
}

export interface EndlessBest {
  score: number
  depth: number // obstacle layers broken in one run
}
const ENDLESS_KEY = 'circumgician:endlessBest'

export function endlessBest(): EndlessBest {
  try {
    const raw = localStorage.getItem(ENDLESS_KEY)
    const b = raw ? (JSON.parse(raw) as Partial<EndlessBest>) : {}
    return { score: Number(b.score) || 0, depth: Number(b.depth) || 0 }
  } catch {
    return { score: 0, depth: 0 }
  }
}

// Records a finished run; returns whether either best improved.
export function recordEndlessRun(score: number, depth: number): boolean {
  const best = endlessBest()
  const next = { score: Math.max(best.score, score), depth: Math.max(best.depth, depth) }
  const improved = next.score > best.score || next.depth > best.depth
  try {
    localStorage.setItem(ENDLESS_KEY, JSON.stringify(next))
  } catch {
    // cosmetic only
  }
  return improved
}

export function markLevelCompleted(levelId: string): void {
  const completed = readCompleted()
  completed.add(levelId)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]))
  } catch {
    // ignore — cosmetic state only
  }
}
