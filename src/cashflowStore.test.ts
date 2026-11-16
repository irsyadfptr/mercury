import { beforeEach, describe, expect, it } from 'vitest'
import type { CashEntry } from '@/types'
import { useCashflow } from './cashflowStore'

const entry = (id: string): CashEntry => ({ id, date: '2026-11-16', type: 'expense', amount: 1, category: 'food', createdAt: '2026-11-16T00:00:00.000Z' })

describe('deleting entries', () => {
  beforeEach(() => useCashflow.setState({ synced: [entry('s1'), entry('s2')], pending: [entry('p1')], deleted: [] }))

  it('drops an unsynced entry, queues a synced one for the Sheet', () => {
    useCashflow.getState().removeEntry('p1')
    useCashflow.getState().removeEntry('s1')
    expect(useCashflow.getState()).toMatchObject({ pending: [], synced: [entry('s2')], deleted: ['s1'] })
  })

  it('a sync clears the ids it deleted, but keeps hiding one deleted while it ran', () => {
    useCashflow.getState().removeEntry('s1')
    useCashflow.getState().removeEntry('s2') // tapped after the sync read its state
    useCashflow.getState().applySync({ spreadsheetId: 'x', synced: [entry('s2')], accounts: [], deletedIds: ['s1'], sentIds: [], skippedRows: 0, at: '2026-11-16T00:00:00.000Z' })
    expect(useCashflow.getState()).toMatchObject({ synced: [], deleted: ['s2'] })
  })
})
