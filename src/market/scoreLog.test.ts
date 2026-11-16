import { describe, expect, it } from 'vitest'
import { recordScore, scoreAlert, type ScoreEntry } from './scoreLog'

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
