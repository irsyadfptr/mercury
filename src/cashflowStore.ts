import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CashflowActions, CashflowData } from '@/types'
import { DEFAULT_ACCOUNT, mergeAccounts } from './domain/accounts'
import { mergeNewest } from './domain/portfolioSheet'

/** Adds an item, or replaces the one with the same id. */
function upsert<T extends { id: string }>(list: readonly T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]
}

/** Local cache of the Sheet plus the offline queue. The Sheet is the source of truth for synced entries. */
export const useCashflow = create<CashflowData & CashflowActions>()(
  persist(
    (set) => ({
      synced: [],
      pending: [],
      deleted: [],
      edited: [],
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
      bills: [],
      saveBill: (b) => {
        const id = b.id ?? crypto.randomUUID()
        set((s) => ({ bills: upsert(s.bills, { archived: false, income: false, ...b, id, updatedAt: new Date().toISOString() }) }))
        return id
      },
      goals: [],
      saveGoal: (g) => set((s) => ({ goals: upsert(s.goals, { archived: false, ...g, id: g.id ?? crypto.randomUUID(), updatedAt: new Date().toISOString() }) })),
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
      // Unsynced: replace it in the queue. Synced: show the new version now and queue its Sheet row to be rewritten.
      updateEntry: (e) =>
        set((s) =>
          s.pending.some((x) => x.id === e.id)
            ? { pending: s.pending.map((x) => (x.id === e.id ? e : x)) }
            : { synced: s.synced.map((x) => (x.id === e.id ? e : x)), edited: [...s.edited.filter((x) => x.id !== e.id), e] },
        ),
      applySync: (r) =>
        set((s) => {
          // A delete or edit made while the sync ran is still queued: keep it hidden / shown over the Sheet's copy.
          const edited = s.edited.filter((e) => !r.edited.includes(e))
          return {
            spreadsheetId: r.spreadsheetId,
            synced: r.synced.filter((e) => !s.deleted.includes(e.id)).map((e) => edited.find((x) => x.id === e.id) ?? e),
            edited,
            deleted: s.deleted.filter((id) => !r.deletedIds.includes(id)),
            // Merge again: an account, bill or goal edited while the sync ran is newer and wins.
            accounts: mergeAccounts(s.accounts, r.accounts),
            bills: mergeNewest(s.bills, r.bills),
            goals: mergeNewest(s.goals, r.goals),
            pending: s.pending.filter((e) => !r.sentIds.includes(e.id)),
            skippedRows: r.skippedRows,
            lastSyncAt: r.at,
          }
        }),
      restoreCashflow: (c) =>
        set((s) => {
          const known = new Set([...s.synced, ...s.pending].map((e) => e.id))
          return {
            // Queued like new entries; the sync only appends ids the Sheet doesn't have yet.
            pending: [...s.pending, ...c.entries.filter((e) => !known.has(e.id))],
            accounts: mergeAccounts(s.accounts, c.accounts),
            bills: mergeNewest(s.bills, c.bills),
            goals: mergeNewest(s.goals, c.goals),
          }
        }),
      unlinkSheet: () => set({ spreadsheetId: undefined, synced: [], lastSyncAt: undefined, skippedRows: 0 }),
    }),
    {
      name: 'mercury.cashflow',
      partialize: ({ spreadsheetId, synced, pending, deleted, edited, lastSyncAt, skippedRows, customCategories, accounts, bills, goals }): CashflowData => ({
        spreadsheetId,
        synced,
        pending,
        deleted,
        edited,
        lastSyncAt,
        skippedRows,
        customCategories,
        accounts,
        bills,
        goals,
      }),
      // v1 stores had no customCategories; v1–2 no accounts; v1–3 no delete queue; v1–4 no bills; v1–5 no edit queue; v1–6 no goals.
      migrate: (state) =>
        ({ customCategories: [], accounts: [DEFAULT_ACCOUNT], deleted: [], edited: [], bills: [], goals: [], ...(state as Partial<CashflowData>) }) as CashflowData,
      version: 7,
    },
  ),
)
