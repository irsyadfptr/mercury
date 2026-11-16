import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CashflowActions, CashflowData } from '@/types'
import { DEFAULT_ACCOUNT, mergeAccounts } from './domain/accounts'

/** Local cache of the Sheet plus the offline queue. The Sheet is the source of truth for synced entries. */
export const useCashflow = create<CashflowData & CashflowActions>()(
  persist(
    (set) => ({
      synced: [],
      pending: [],
      deleted: [],
      skippedRows: 0,
      customCategories: [],
      accounts: [DEFAULT_ACCOUNT],
      addAccount: (name, startingBalance, balanceDate) => {
        const id = crypto.randomUUID()
        set((s) => ({ accounts: [...s.accounts, { id, name, startingBalance, balanceDate, archived: false, updatedAt: new Date().toISOString() }] }))
        return id
      },
      updateAccount: (id, patch) =>
        set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a)) })),
      addCategory: (c) => set((s) => ({ customCategories: [...s.customCategories, c] })),
      addEntry: (e) => {
        const id = crypto.randomUUID()
        set((s) => ({ pending: [...s.pending, { ...e, id, createdAt: new Date().toISOString() }] }))
        return id
      },
      // Unsynced: just drop it. Synced: hide it now and queue the Sheet row for deletion at the next sync.
      removeEntry: (id) =>
        set((s) =>
          s.pending.some((e) => e.id === id)
            ? { pending: s.pending.filter((e) => e.id !== id) }
            : { synced: s.synced.filter((e) => e.id !== id), deleted: [...s.deleted, id] },
        ),
      applySync: (r) =>
        set((s) => ({
          spreadsheetId: r.spreadsheetId,
          // A delete tapped while the sync ran is still queued: keep it hidden.
          synced: r.synced.filter((e) => !s.deleted.includes(e.id)),
          deleted: s.deleted.filter((id) => !r.deletedIds.includes(id)),
          // Merge again: an account edited while the sync ran is newer and wins.
          accounts: mergeAccounts(s.accounts, r.accounts),
          pending: s.pending.filter((e) => !r.sentIds.includes(e.id)),
          skippedRows: r.skippedRows,
          lastSyncAt: r.at,
        })),
      unlinkSheet: () => set({ spreadsheetId: undefined, synced: [], lastSyncAt: undefined, skippedRows: 0 }),
    }),
    {
      name: 'mercury.cashflow',
      partialize: ({ spreadsheetId, synced, pending, deleted, lastSyncAt, skippedRows, customCategories, accounts }): CashflowData => ({
        spreadsheetId,
        synced,
        pending,
        deleted,
        lastSyncAt,
        skippedRows,
        customCategories,
        accounts,
      }),
      // v1 stores had no customCategories; v1–2 no accounts; v1–3 no delete queue.
      migrate: (state) => ({ customCategories: [], accounts: [DEFAULT_ACCOUNT], deleted: [], ...(state as Partial<CashflowData>) }) as CashflowData,
      version: 4,
    },
  ),
)
