import { describe, expect, it } from 'vitest'
import { freshSignals, recordScan, scanChanges } from './scanLog'

describe('scan log', () => {
  const day1 = { date: '2026-11-12', passing: ['PTBA'], inZone: ['PTBA', 'INDF'] }
  const day2 = { date: '2026-11-13', passing: ['INDF'], inZone: ['INDF', 'BBRI'] }

  it('keeps the previous price date when the date moves on, and overwrites a same-day rescan', () => {
    let log = recordScan({}, day1)
    expect(scanChanges(log)).toBeUndefined()
    log = recordScan(log, day2)
    log = recordScan(log, { ...day2, passing: ['INDF', 'BMRI'] })
    expect(log.previous).toEqual(day1)
    expect(scanChanges(log)).toEqual({ since: '2026-11-12', date: '2026-11-13', newPassing: ['INDF', 'BMRI'], lostPassing: ['PTBA'], newInZone: ['BBRI'], leftZone: ['PTBA'] })
  })
})

describe('short-term signals', () => {
  const sig = (time: string) => ({ symbol: 'X', time, entry: 1, stop: 0.9, target: 1.2 })
  it('4H signals stay fresh 12 hours after the bar closes', () => {
    const log = { scannedAt: 0, signals: [sig('2026-11-17T00:00:00.000Z')] }
    expect(freshSignals(log, 'week', Date.parse('2026-11-17T15:59:00Z'))).toHaveLength(1)
    expect(freshSignals(log, 'week', Date.parse('2026-11-17T16:01:00Z'))).toHaveLength(0)
  })
  it('daily signals stay fresh two days', () => {
    const log = { scannedAt: 0, signals: [sig('2026-11-15')] }
    expect(freshSignals(log, 'month', Date.parse('2026-11-17T23:00:00Z'))).toHaveLength(1)
    expect(freshSignals(log, 'month', Date.parse('2026-11-18T01:00:00Z'))).toHaveLength(0)
  })
})
