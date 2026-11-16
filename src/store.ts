import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PortfolioActions, PortfolioData, PortfolioSyncMeta } from '@/types'
// The journal is part of PortfolioData: it syncs through the Journal tab with the portfolio.
import { SCHEMA_VERSION } from './domain/schema'

/** Every user edit stamps changedAt, so the Sheet sync knows this device has something to push. */
const touched = () => ({ changedAt: new Date().toISOString() })

export const useStore = create<PortfolioData & PortfolioSyncMeta & PortfolioActions>()(
  persist(
    (set) => ({
      holdings: [],
      transactions: [],
      dividends: [],
      addHolding: (h) => {
        const id = crypto.randomUUID()
        set((s) => ({ holdings: [...s.holdings, { ...h, id, createdAt: new Date().toISOString() }], ...touched() }))
        return id
      },
      updateHolding: (id, patch) => set((s) => ({ holdings: s.holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)), ...touched() })),
      removeHolding: (id) =>
        set((s) => ({
          holdings: s.holdings.filter((h) => h.id !== id),
          transactions: s.transactions.filter((t) => t.holdingId !== id),
          // Dividends go with the holding; their Cashflow income entries stay (that money was received).
          dividends: s.dividends.filter((d) => d.holdingId !== id),
          // Notes outlive the holding; they just lose the link.
          journal: s.journal.map((j) => (j.holdingId === id ? { ...j, holdingId: undefined } : j)),
          ...touched(),
        })),
      addTransaction: (t) => set((s) => ({ transactions: [...s.transactions, { ...t, id: crypto.randomUUID() }], ...touched() })),
      removeTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id), ...touched() })),
      addDividend: (d) => {
        const id = crypto.randomUUID()
        set((s) => ({ dividends: [...s.dividends, { ...d, id }], ...touched() }))
        return id
      },
      removeDividend: (id) => set((s) => ({ dividends: s.dividends.filter((d) => d.id !== id), ...touched() })),
      replaceAll: (b) => set({ holdings: b.holdings, transactions: b.transactions, dividends: b.dividends, journal: b.journal, ...touched() }),
      journal: [],
      addJournal: (e) => set((s) => ({ journal: [...s.journal, { ...e, id: crypto.randomUUID(), createdAt: new Date().toISOString() }], ...touched() })),
      removeJournal: (id) => set((s) => ({ journal: s.journal.filter((j) => j.id !== id), ...touched() })),
      // Sync results are not user edits: they move syncedAt, never changedAt.
      applyPortfolioPull: (data, at) => set({ holdings: data.holdings, transactions: data.transactions, dividends: data.dividends, journal: data.journal, syncedAt: at }),
      markPortfolioSynced: (at) => set({ syncedAt: at }),
    }),
    {
      name: 'mercury.data',
      version: SCHEMA_VERSION,
      partialize: (s): PortfolioData & PortfolioSyncMeta => ({
        holdings: s.holdings,
        transactions: s.transactions,
        dividends: s.dividends,
        journal: s.journal,
        changedAt: s.changedAt,
        syncedAt: s.syncedAt,
      }),
      // Stores saved before dividends existed have none: persist's default shallow merge keeps dividends: [] above.
    },
  ),
)
