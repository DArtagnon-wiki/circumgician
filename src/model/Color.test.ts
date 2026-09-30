import { describe, expect, it } from 'vitest'
import { addsPower, catchRank, moteMatchesCatch } from './Color'

describe('moteMatchesCatch', () => {
  it('a generic mote matches any catch requirement', () => {
    expect(moteMatchesCatch('generic', 'red')).toBe(true)
    expect(moteMatchesCatch('generic', 'generic')).toBe(true)
  })

  it('a hued mote matches only an identical catch requirement', () => {
    expect(moteMatchesCatch('red', 'red')).toBe(true)
    expect(moteMatchesCatch('red', 'blue')).toBe(false)
  })

  it('a hued mote does not match a generic-only catch requirement', () => {
    expect(moteMatchesCatch('red', 'generic')).toBe(false)
  })

  it('null and void motes go into any bowl, but only real colors and opal add power', () => {
    expect(moteMatchesCatch('null', 'red')).toBe(true)
    expect(moteMatchesCatch('void', 'teal')).toBe(true)
    expect(['red', 'generic', 'null', 'void'].map((c) => addsPower(c as 'red'))).toEqual([true, true, false, false])
  })

  it('a bowl prefers its own color, then opal, then null, then void', () => {
    expect(['void', 'red', 'null', 'generic'].sort((a, b) => catchRank(a as 'red') - catchRank(b as 'red'))).toEqual(['red', 'generic', 'null', 'void'])
  })
})
