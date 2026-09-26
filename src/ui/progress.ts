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

export function markLevelCompleted(levelId: string): void {
  const completed = readCompleted()
  completed.add(levelId)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]))
  } catch {
    // ignore — cosmetic state only
  }
}
