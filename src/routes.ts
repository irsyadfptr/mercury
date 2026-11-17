import type { Route } from '@/types'

export const ROUTES = ['dashboard', 'portfolio', 'scanner', 'short', 'longterm', 'journal', 'cashflow', 'settings', 'add'] as const
/** Shown in the top menu. Quick add is reached from Cashflow or the home-screen shortcut. */
export const NAV_ROUTES: readonly Route[] = ['dashboard', 'portfolio', 'scanner', 'short', 'longterm', 'journal', 'cashflow', 'settings']

/** '#/portfolio' → 'portfolio' ('#/add?edit=…' → 'add'); anything unknown → 'dashboard'. */
export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split('?')[0]
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'dashboard'
}

/** '#/add' or, with params, '#/add?edit=abc'. */
export const href = (r: Route, params?: Record<string, string>): string => `#/${r}${params ? `?${new URLSearchParams(params)}` : ''}`

/** A query value of the current hash route, e.g. routeParam('edit') on '#/add?edit=abc' → 'abc'. */
export const routeParam = (name: string): string | undefined => new URLSearchParams(location.hash.split('?')[1] ?? '').get(name) ?? undefined
