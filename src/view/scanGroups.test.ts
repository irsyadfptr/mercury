import { describe, expect, it } from 'vitest'
import { groupScan, rulePips, swingGroup } from './scanGroups'
import { COLOR } from './tokens'

const five = [1, 2, 3, 4, 5]

describe('swingGroup', () => {
  it('puts full passes in the buy zone first, paused when Defensive', () => {
    expect(swingGroup({ score: 5, rules: five, zone: 'in' }, false)).toBe('buy')
    expect(swingGroup({ score: 5, rules: five, zone: 'in' }, true)).toBe('paused')
  })
  it('waits for the price when every rule passes outside the zone', () => {
    expect(swingGroup({ score: 5, rules: five, zone: 'extended' }, false)).toBe('wait')
  })
  it('marks one rule short as close, the rest as none', () => {
    expect(swingGroup({ score: 4, rules: five, zone: 'none' }, false)).toBe('close')
    expect(swingGroup({ score: 2, rules: five, zone: 'none' }, false)).toBe('none')
  })
})

describe('groupScan', () => {
  it('groups in a fixed order, skips empty groups and sorts by score then symbol', () => {
    const rows = [
      { symbol: 'B', score: 3, g: 'none' },
      { symbol: 'A', score: 3, g: 'none' },
      { symbol: 'C', score: 4, g: 'none' },
      { symbol: 'D', score: 5, g: 'buy' },
    ] as const
    const out = groupScan(rows, (r) => r.g)
    expect(out.map((g) => g.group)).toEqual(['buy', 'none'])
    expect(out[1].rows.map((r) => r.symbol)).toEqual(['C', 'A', 'B'])
  })
})

describe('rulePips', () => {
  it('fills passes, empties fails, outlines unknowns', () => {
    expect(rulePips([{ pass: true }, { pass: false }, { pass: undefined }])).toEqual([{ bg: COLOR.up }, { bg: COLOR.empty }, { bg: 'transparent', edge: COLOR.muted }])
  })
})
