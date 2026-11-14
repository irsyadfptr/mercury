import { describe, expect, it } from 'vitest'
import { recordScan, scanChanges } from './scanLog'

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
