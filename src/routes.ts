import type { Route } from '@/types'

export const ROUTES = ['dashboard', 'portfolio', 'scanner', 'longterm', 'journal', 'cashflow', 'settings', 'add'] as const
/** Shown in the top menu. Quick add is reached from Cashflow or the home-screen shortcut. */
export const NAV_ROUTES: readonly Route[] = ['dashboard', 'portfolio', 'scanner', 'longterm', 'journal', 'cashflow', 'settings']

/** '#/portfolio' → 'portfolio'; anything unknown → 'dashboard'. */
export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '')
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'dashboard'
}

export const href = (r: Route): string => `#/${r}`
