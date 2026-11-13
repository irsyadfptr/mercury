import { describe, expect, it } from 'vitest'
import { allocation, treemap } from './allocation'
import { budgetBar, flameSizes, heatBar, moodBar, moodColor, riskBar, xpBar } from './bars'
import { COLOR } from './tokens'

const filled = (segs: { bg: string }[], color: string) => segs.filter((s) => s.bg === color).length

describe('bars', () => {
  it('xp fills by progress and clamps', () => {
    expect(filled(xpBar(0.5), COLOR.accent)).toBe(12)
    expect(filled(xpBar(2), COLOR.accent)).toBe(24)
    expect(filled(xpBar(-1), COLOR.accent)).toBe(0)
  })

  it('heat bar: limit sits at 3/4, tint after it', () => {
    const atLimit = heatBar(6, 6)
    expect(atLimit.filter((s) => s.bg !== COLOR.empty && s.bg !== COLOR.fireSoft)).toHaveLength(18)
    expect(atLimit.slice(18).every((s) => s.bg === COLOR.fireSoft)).toBe(true)
    expect(heatBar(0, 6).slice(0, 18).every((s) => s.bg === COLOR.empty)).toBe(true)
  })

  it('flames: centre tallest', () => {
    expect(flameSizes(0)).toEqual([])
    expect(flameSizes(3)).toEqual([33, 40, 33])
  })

  it('budget bar: accent, warn near limit, red spill when over (capped at 2x)', () => {
    expect(filled(budgetBar(500, 1000), COLOR.accent)).toBe(12)
    expect(filled(budgetBar(900, 1000), COLOR.warn)).toBe(22)
    const over = budgetBar(1250, 1000)
    expect(over).toHaveLength(30)
    expect(filled(over, COLOR.down)).toBe(30)
    expect(budgetBar(10_000, 1000)).toHaveLength(48)
  })

  it('risk bar statuses', () => {
    expect(riskBar({ kind: 'none' }, 1)).toBeNull()
    expect(riskBar({ kind: 'noStop' }, 1)?.status).toEqual({ kind: 'noStop' })
    expect(riskBar({ kind: 'ok', amountIdr: 0, pct: 0.5 }, 1)?.status.kind).toBe('safe')
    expect(riskBar({ kind: 'ok', amountIdr: 0, pct: 0.85 }, 1)?.status.kind).toBe('close')
    const over = riskBar({ kind: 'ok', amountIdr: 0, pct: 1.2 }, 1)!
    expect(over.status).toEqual({ kind: 'over', pct: 1.2, overBy: expect.closeTo(0.2) })
    expect(over.segments).toHaveLength(24) // 4 red segments spill past 20
    expect(filled(over.segments, COLOR.down)).toBe(24)
  })
})

describe('allocation', () => {
  it('sorts, drops empty classes, and lays out a treemap', () => {
    const items = allocation({ crypto: 18, idx_stock: 38, gold: 0, money_market: 24, bond_fund: 12 }, 92)
    expect(items.map((i) => i.assetClass)).toEqual(['idx_stock', 'money_market', 'crypto', 'bond_fund'])
    const t = treemap(items)!
    expect(t.first.assetClass).toBe('idx_stock')
    expect(t.second?.assetClass).toBe('money_market')
    expect(t.rest.map((i) => i.assetClass)).toEqual(['crypto', 'bond_fund'])
    expect(t.restWeight).toBe(30)
    expect(t.rightWeight).toBe(54)
    expect(treemap([])).toBeNull()
  })
})

describe('mood gauge', () => {
  it('colours zones and fills to the score', () => {
    expect([10, 30, 50, 80].map(moodColor)).toEqual([COLOR.fireRed, COLOR.fireOrange, COLOR.warn, COLOR.up])
    const bar = moodBar(33, 20)
    expect(bar.filter((s) => s.bg !== COLOR.empty)).toHaveLength(7)
    expect(bar[0].bg).toBe(COLOR.fireRed)
    expect(moodBar(150, 20).every((s) => s.bg !== COLOR.empty)).toBe(true)
  })
})
