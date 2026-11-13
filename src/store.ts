import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PortfolioActions, PortfolioData } from '@/types'
import { SCHEMA_VERSION } from './domain/schema'

export const useStore = create<PortfolioData & PortfolioActions>()(
  persist(
    (set) => ({
      holdings: [],
      transactions: [],
      addHolding: (h) => {
        const id = crypto.randomUUID()
        set((s) => ({ holdings: [...s.holdings, { ...h, id, createdAt: new Date().toISOString() }] }))
        return id
      },
      updateHolding: (id, patch) =>
        set((s) => ({ holdings: s.holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),
      removeHolding: (id) =>
        set((s) => ({
          holdings: s.holdings.filter((h) => h.id !== id),
          transactions: s.transactions.filter((t) => t.holdingId !== id),
        })),
      addTransaction: (t) => set((s) => ({ transactions: [...s.transactions, { ...t, id: crypto.randomUUID() }] })),
      removeTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
      replaceAll: (b) => set({ holdings: b.holdings, transactions: b.transactions }),
    }),
    {
      name: 'mercury.data',
      version: SCHEMA_VERSION,
      partialize: (s): PortfolioData => ({ holdings: s.holdings, transactions: s.transactions }),
    },
  ),
)
