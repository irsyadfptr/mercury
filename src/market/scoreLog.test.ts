import { describe, expect, it } from 'vitest'
import { betterScored, recordScore, scoreAlert, type ScoreEntry } from './scoreLog'

describe('better-scored alternatives', () => {
  it('beats the held ticker, best first, recent checks only', () => {
    const log = {
      BBRI: [{ date: '2026-11-14', total: 9, known: 15, price: 1 }],
      PTBA: [{ date: '2026-11-14', total: 13, known: 14, price: 1 }],
      ITMG: [{ date: '2026-11-13', total: 13, known: 15, price: 1 }],
      ADRO: [{ date: '2026-09-01', total: 14, known: 15, price: 1 }], // stale
      TLKM: [{ date: '2026-11-14', total: 8, known: 15, price: 1 }],
    }
    expect(betterScored(log, 'BBRI').map((x) => x.symbol)).toEqual(['ITMG', 'PTBA'])
    expect(betterScored(log, 'NONE')).toEqual([])
  })
})

const e = (date: string, total: number): ScoreEntry => ({ date, total, known: 15, price: 1000 })

describe('score log', () => {
  it('keeps one entry per day, oldest first', () => {
    let log = recordScore({}, 'PTBA', e('2026-11-13', 12))
    log = recordScore(log, 'PTBA', e('2026-11-14', 10))
    log = recordScore(log, 'PTBA', e('2026-11-14', 9))
    expect(log.PTBA.map((x) => [x.date, x.total])).toEqual([
      ['2026-11-13', 12],
      ['2026-11-14', 9],
    ])
  })

  it('alerts on a drop of 3+ points first, else on a low score', () => {
    expect(scoreAlert(undefined)).toBeUndefined()
    expect(scoreAlert([e('2026-11-13', 12), e('2026-11-14', 10)])).toBeUndefined()
    expect(scoreAlert([e('2026-11-13', 12), e('2026-11-14', 9)])).toEqual({ kind: 'drop', total: 9, from: 12, since: '2026-11-13' })
    expect(scoreAlert([e('2026-11-13', 9), e('2026-11-14', 7)])).toEqual({ kind: 'low', total: 7 })
    expect(scoreAlert([e('2026-11-14', 8)])).toBeUndefined()
  })
})
