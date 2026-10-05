import { describe, expect, it } from 'vitest'
import { PACK } from '../data/levels/pack'
import { drawReading, loadReading, markReadingCard, nextCard, READING_SIZE, saveReading } from './reading'

// A seeded stand-in for Math.random.
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('a reading', () => {
  const ids = PACK.map((level) => level.id)

  it('draws three different cards from the deck', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const reading = drawReading(ids, seeded(seed))
      expect(reading.ids).toHaveLength(READING_SIZE)
      expect(new Set(reading.ids).size).toBe(READING_SIZE)
      for (const id of reading.ids) expect(ids).toContain(id)
      expect(reading.done).toEqual([false, false, false])
    }
  })

  it('reaches every card of the deck', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 2000; seed++) for (const id of drawReading(ids, seeded(seed)).ids) seen.add(id)
    expect(seen.size).toBe(ids.length)
  })

  it('is played in turn, and kept until it is drawn again', () => {
    let reading = drawReading(ids, seeded(7))
    saveReading(reading)
    expect(loadReading((id) => ids.includes(id))).toEqual(reading)
    expect(nextCard(reading)).toBe(0)
    reading = markReadingCard(reading, 0)
    expect(nextCard(reading)).toBe(1)
    reading = markReadingCard(reading, 2) // a card can be played out of turn
    expect(nextCard(reading)).toBe(1)
    reading = markReadingCard(reading, 1)
    expect(nextCard(reading)).toBe(-1)
    expect(loadReading((id) => ids.includes(id))?.done).toEqual([true, true, true])
  })

  it('is dropped once a card in it has left the deck', () => {
    saveReading(drawReading(ids, seeded(3)))
    expect(loadReading(() => false)).toBeNull()
  })
})
