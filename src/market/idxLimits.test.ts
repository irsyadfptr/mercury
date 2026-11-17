import { describe, expect, it } from 'vitest'
import { araAmount, arbAmount, arbCheck } from './idxLimits'

describe('IDX price limits', () => {
  it('ARB is Rp1 up to Rp14, then 7%', () => {
    expect(arbAmount(10)).toBe(1)
    expect(arbAmount(14)).toBe(1)
    expect(arbAmount(1000)).toBeCloseTo(70)
  })
  it('ARA tiers', () => {
    expect(araAmount(100)).toBeCloseTo(35)
    expect(araAmount(1000)).toBeCloseTo(250)
    expect(araAmount(10000)).toBeCloseTo(2000)
  })
  it('a stop within one ARB is fine; a deeper one needs several limit-down days', () => {
    expect(arbCheck(1000, 950, '2026-11-17')).toMatchObject({ beyond: false, days: 1, expired: false })
    const deep = arbCheck(1000, 850, '2026-11-17')
    expect(deep.beyond).toBe(true)
    expect(deep.days).toBe(3) // 1000 → 930 → 864.9 → 804.4
  })
  it('flags expired limits', () => expect(arbCheck(1000, 950, '2027-01-02').expired).toBe(true))
})
