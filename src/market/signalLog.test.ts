import { describe, expect, it } from 'vitest'
import type { Bar } from './indicators'
import { evaluateSignal, recordSignals, signalStats, takenSignals, unfinished, updateOutcomes, verdict, type NewSignal, type SignalRecord } from './signalLog'

const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10)
const bar = (i: number, o: number, h: number, l: number, c: number): Bar => ({ time: day(i), open: o, high: h, low: l, close: c, volume: 1 })
const NO_FEES = { timeStopBars: 10, fees: { buy: 0, sell: 0 } }
const sig: NewSignal = { market: 'idx', style: 'swing', symbol: 'BBCA', time: day(0), entry: 100, stop: 90, target: 120, paused: false }

describe('evaluateSignal', () => {
  it('buys at the next open and hits the 2R target from the fill', () => {
    const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 105, 99, 104), bar(2, 104, 121, 103, 118)]
    expect(evaluateSignal(sig, bars, NO_FEES)).toMatchObject({ status: 'target', r: 2, fill: 100, exitTime: day(2), mfeR: 2 })
  })
  it('a bar touching both counts as the stop; a gap below the stop sells at the open', () => {
    expect(evaluateSignal(sig, [bar(0, 100, 100, 100, 100), bar(1, 100, 125, 85, 100)], NO_FEES)).toMatchObject({ status: 'stop', r: -1 })
    expect(evaluateSignal(sig, [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 95, 96), bar(2, 85, 86, 80, 82)], NO_FEES)).toMatchObject({ status: 'stop', r: -1.5 })
  })
  it('is pending with no bar after the signal, skipped when the next open is below the stop, open while running', () => {
    expect(evaluateSignal(sig, [bar(0, 100, 100, 100, 100)], NO_FEES)?.status).toBe('pending')
    expect(evaluateSignal(sig, [bar(0, 100, 100, 100, 100), bar(1, 89, 90, 88, 89)], NO_FEES)?.status).toBe('skipped')
    const open = evaluateSignal(sig, [bar(0, 100, 100, 100, 100), bar(1, 100, 104, 96, 103)], NO_FEES)!
    expect(open).toMatchObject({ status: 'open', r: 0.3, mfeR: 0.4, maeR: -0.4 })
  })
  it('sells at the close on the time stop, and fees come off R', () => {
    const bars = [bar(0, 100, 100, 100, 100), ...Array.from({ length: 12 }, (_, k) => bar(k + 1, 100, 101, 99, 101))]
    const o = evaluateSignal(sig, bars, { timeStopBars: 3, fees: { buy: 0.01, sell: 0.01 } })!
    expect(o.status).toBe('time')
    expect(o.exitTime).toBe(day(4))
    // (101 − 100)/10 − (1 + 1.01)/10
    expect(o.r).toBeCloseTo(0.1 - 0.201)
    expect(o.ret5).toBeCloseTo(1)
  })
  it('is undefined when the signal bar is not in the bars', () => expect(evaluateSignal(sig, [bar(5, 1, 1, 1, 1)], NO_FEES)).toBeUndefined())
})

describe('the log', () => {
  it('keeps the first record of a signal seen again', () => {
    const a = recordSignals([], [sig], 1)
    const b = recordSignals(a, [{ ...sig, entry: 101 }, { ...sig, symbol: 'BBRI' }], 2)
    expect(b.map((s) => [s.symbol, s.entry, s.savedAt])).toEqual([
      ['BBCA', 100, 1],
      ['BBRI', 100, 2],
    ])
  })
  it('updates only unfinished signals of that ticker and rules', () => {
    const log = recordSignals([], [sig, { ...sig, style: 'month' }])
    const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 125, 99, 120)]
    const once = updateOutcomes(log, 'idx', 'swing', 'BBCA', bars, NO_FEES)
    expect(once.map((s) => s.outcome?.status)).toEqual(['target', undefined])
    // A finished signal is not re-evaluated with other bars.
    expect(updateOutcomes(once, 'idx', 'swing', 'BBCA', [bar(0, 1, 1, 1, 1), bar(1, 1, 1, 1, 1)], NO_FEES)[0].outcome?.status).toBe('target')
    expect(unfinished(once)).toEqual([{ market: 'idx', style: 'month', symbol: 'BBCA' }])
  })
})

describe('postmortem stats', () => {
  const withOutcome = (id: string, r: number | undefined, status: NonNullable<SignalRecord['outcome']>['status'], paused = false): SignalRecord => ({
    ...sig,
    id,
    paused,
    savedAt: 0,
    outcome: { status, r, mfeR: 1, maeR: -0.5, through: day(9) },
  })
  it('counts finished trades by their result after fees', () => {
    const s = [withOutcome('a', 2, 'target'), withOutcome('b', -1, 'stop'), withOutcome('c', 0.2, 'time'), withOutcome('d', 0.5, 'open'), withOutcome('e', undefined, 'skipped')]
    expect(s.map(verdict)).toEqual(['won', 'lost', 'won', 'open', 'skipped'])
    expect(signalStats(s)).toMatchObject({ total: 5, closed: 3, open: 1, won: 2, avgR: (2 - 1 + 0.2) / 3, avgMfe: 1, avgMae: -0.5 })
  })
  it('links signals to trades: by paper-trade id, or a buy of that ticker within 5 days', () => {
    const s = [withOutcome('idx:swing:BBCA:2026-01-01', 1, 'target'), { ...withOutcome('x', 1, 'target'), id: 'idx:swing:TLKM:2026-01-01', symbol: 'TLKM' }]
    const taken = takenSignals(s, [
      { id: 'h1', symbol: 'BBCA', market: 'idx', signalId: 'idx:swing:BBCA:2026-01-01' },
      { id: 'h2', symbol: 'TLKM', market: 'idx', firstBuy: '2026-01-09T00:00:00.000Z' },
    ])
    expect([...taken]).toEqual(['idx:swing:BBCA:2026-01-01'])
    expect(takenSignals(s, [{ id: 'h2', symbol: 'TLKM', market: 'idx', firstBuy: '2026-01-04T00:00:00.000Z' }]).has('idx:swing:TLKM:2026-01-01')).toBe(true)
  })
})
