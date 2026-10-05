// A reading: three cards drawn at random from the deck, laid out as past,
// present and future, and played in turn. It is kept in storage until it is
// finished or drawn again, so leaving midway loses nothing. Tolerant of
// storage being unavailable (private browsing, disabled storage): the
// reading then lasts as long as the page.
export interface Reading {
  ids: string[] // level ids, in the order of the spread
  done: boolean[] // which have been won
}

export const READING_SIZE = 3
export const POSITIONS = ['Past', 'Present', 'Future'] as const

const STORAGE_KEY = 'circumgician:reading'
let unsaved: Reading | null = null // when storage is unavailable

// Draws distinct cards from the deck, uniformly.
export function drawReading(ids: readonly string[], random: () => number = Math.random): Reading {
  const left = [...ids]
  const picked: string[] = []
  while (picked.length < READING_SIZE && left.length) picked.push(left.splice(Math.floor(random() * left.length), 1)[0])
  return { ids: picked, done: picked.map(() => false) }
}

// The next card to play, in order; -1 once every card is won.
export const nextCard = (reading: Reading): number => reading.done.indexOf(false)

// The saved reading, if every card in it is still in the deck.
export function loadReading(inDeck: (id: string) => boolean): Reading | null {
  let reading = unsaved
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) reading = JSON.parse(raw) as Reading
  } catch {
    // fall back to the in-memory one
  }
  if (!reading || !Array.isArray(reading.ids) || !Array.isArray(reading.done)) return null
  if (!reading.ids.length || reading.ids.length !== reading.done.length || !reading.ids.every(inDeck)) return null
  return reading
}

export function saveReading(reading: Reading): void {
  unsaved = reading
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reading))
  } catch {
    // kept in memory only
  }
}

// Marks the card at this place in the spread as won.
export function markReadingCard(reading: Reading, place: number): Reading {
  const next = { ids: reading.ids, done: reading.done.map((d, i) => d || i === place) }
  saveReading(next)
  return next
}
