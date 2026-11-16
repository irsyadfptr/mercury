import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PortfolioActions, PortfolioData, PortfolioSyncMeta } from '@/types'
import { SCHEMA_VERSION } from './domain/schema'

/** Every user edit stamps changedAt, so the Sheet sync knows this device has something to push. */
const touched = () => ({ changedAt: new Date().toISOString() })

export const useStore = create<PortfolioData & PortfolioSyncMeta & PortfolioActions>()(
  persist(
    (set) => ({
      holdings: [],
      transactions: [],
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
          // Notes outlive the holding; they just lose the link.
          journal: s.journal.map((j) => (j.holdingId === id ? { ...j, holdingId: undefined } : j)),
          ...touched(),
        })),
      addTransaction: (t) => set((s) => ({ transactions: [...s.transactions, { ...t, id: crypto.randomUUID() }], ...touched() })),
      removeTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id), ...touched() })),
      replaceAll: (b) => set({ holdings: b.holdings, transactions: b.transactions, journal: b.journal, ...touched() }),
      // shortcut: the journal is in localStorage and the JSON backup only, not the Sheet sync; add a Journal tab if it must reach other devices.
      journal: [],
      addJournal: (e) => set((s) => ({ journal: [...s.journal, { ...e, id: crypto.randomUUID(), createdAt: new Date().toISOString() }] })),
      removeJournal: (id) => set((s) => ({ journal: s.journal.filter((j) => j.id !== id) })),
      // Sync results are not user edits: they move syncedAt, never changedAt.
      applyPortfolioPull: (data, at) => set({ holdings: data.holdings, transactions: data.transactions, syncedAt: at }),
      markPortfolioSynced: (at) => set({ syncedAt: at }),
    }),
    {
      name: 'mercury.data',
      version: SCHEMA_VERSION,
      partialize: (s): PortfolioData & PortfolioSyncMeta & Pick<PortfolioActions, 'journal'> => ({
        holdings: s.holdings,
        transactions: s.transactions,
        journal: s.journal,
        changedAt: s.changedAt,
        syncedAt: s.syncedAt,
      }),
    },
  ),
)
