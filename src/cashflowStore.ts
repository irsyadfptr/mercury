import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CashflowActions, CashflowData } from '@/types'

/** Local cache of the Sheet plus the offline queue. The Sheet is the source of truth for synced entries. */
export const useCashflow = create<CashflowData & CashflowActions>()(
  persist(
    (set) => ({
      synced: [],
      pending: [],
      skippedRows: 0,
      customCategories: [],
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
          pending: s.pending.filter((e) => !r.sentIds.includes(e.id)),
          skippedRows: r.skippedRows,
          lastSyncAt: r.at,
        })),
      unlinkSheet: () => set({ spreadsheetId: undefined, synced: [], lastSyncAt: undefined, skippedRows: 0 }),
    }),
    {
      name: 'mercury.cashflow',
      partialize: ({ spreadsheetId, synced, pending, lastSyncAt, skippedRows, customCategories }): CashflowData => ({
        spreadsheetId,
        synced,
        pending,
        lastSyncAt,
        skippedRows,
        customCategories,
      }),
      // v1 stores had no customCategories.
      migrate: (state) => ({ customCategories: [], ...(state as Partial<CashflowData>) }) as CashflowData,
      version: 2,
    },
  ),
)
