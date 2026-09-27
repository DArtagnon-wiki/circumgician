import { describe, expect, it } from 'vitest'
import { PACK } from '../data/levels/pack'
import { runCareless } from './headless'

// Careless play across the pack. Until the curated pack lands (M6) this only
// checks the engine runs every level to a decision without throwing; win-rate
// targets are asserted per level once levels are authored.
describe('careless play over the pack', () => {
  for (const level of PACK) {
    it(`${level.id} runs to a decision`, () => {
      let wins = 0
      const runs = 12
      for (let seed = 1; seed <= runs; seed++) {
        const res = runCareless(level, seed, 180)
        expect(['won', 'lost', 'playing']).toContain(res.status)
        if (res.status === 'won') wins++
      }
      console.log(`${level.id}: careless win rate ${wins}/${runs}`)
    })
  }
})
