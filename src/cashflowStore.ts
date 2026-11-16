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
      skippedRows: 0,
      customCategories: [],
      accounts: [DEFAULT_ACCOUNT],
      addAccount: (name, startingBalance) => {
        const id = crypto.randomUUID()
        set((s) => ({ accounts: [...s.accounts, { id, name, startingBalance, archived: false, updatedAt: new Date().toISOString() }] }))
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
      removePending: (id) => set((s) => ({ pending: s.pending.filter((e) => e.id !== id) })),
      applySync: (r) =>
        set((s) => ({
          spreadsheetId: r.spreadsheetId,
          synced: r.synced,
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
      partialize: ({ spreadsheetId, synced, pending, lastSyncAt, skippedRows, customCategories, accounts }): CashflowData => ({
        spreadsheetId,
        synced,
        pending,
        lastSyncAt,
        skippedRows,
        customCategories,
        accounts,
      }),
      // v1 stores had no customCategories; v1–2 had no accounts.
      migrate: (state) => ({ customCategories: [], accounts: [DEFAULT_ACCOUNT], ...(state as Partial<CashflowData>) }) as CashflowData,
      version: 3,
    },
  ),
)
