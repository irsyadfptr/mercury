import type { Route } from '@/types'

export const ROUTES = ['home', 'crypto', 'stocks', 'funds', 'cashflow', 'settings', 'add'] as const
/** The main tabs (a bottom bar on phones). Settings is the gear in the header; Quick add is reached from Cashflow or the home-screen shortcut. */
export const NAV_ROUTES: readonly Route[] = ['home', 'crypto', 'stocks', 'funds', 'cashflow']

/** '#/crypto' → 'crypto' ('#/add?edit=…' → 'add'); anything unknown → 'home'. */
export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split('?')[0]
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'home'
}

/** Pages from before the split by market (2026-11-25) → where they live now. Journal's own view moved to `jv`. */
const LEGACY: Record<string, { route: Route; view?: string }> = {
  dashboard: { route: 'home' },
  portfolio: { route: 'home' },
  scanner: { route: 'stocks', view: 'scan' },
  longterm: { route: 'stocks', view: 'score' },
  journal: { route: 'stocks', view: 'journal' },
}

/** The new hash for an old bookmark or link ('#/journal?view=trades' → '#/stocks?view=journal&jv=trades'), else undefined. */
export function legacyHash(hash: string): string | undefined {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const to = LEGACY[path]
  if (!to) return undefined
  const old = new URLSearchParams(query)
  const params: Record<string, string> = {}
  if (to.view) params.view = to.view
  for (const [k, v] of old) params[k === 'view' && path === 'journal' ? 'jv' : k] = v
  return href(to.route, Object.keys(params).length ? params : undefined)
}

/** '#/add' or, with params, '#/add?edit=abc'. */
export const href = (r: Route, params?: Record<string, string>): string => `#/${r}${params ? `?${new URLSearchParams(params)}` : ''}`

/** A query value of the current hash route, e.g. routeParam('edit') on '#/add?edit=abc' → 'abc'. */
export const routeParam = (name: string): string | undefined => new URLSearchParams(location.hash.split('?')[1] ?? '').get(name) ?? undefined
