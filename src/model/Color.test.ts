import { describe, expect, it } from 'vitest'
import { moteMatchesCatch } from './Color'

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
})
