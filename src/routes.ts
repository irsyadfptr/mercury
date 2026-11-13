import type { Route } from '@/types'

export const ROUTES = ['dashboard', 'portfolio', 'settings'] as const

/** '#/portfolio' → 'portfolio'; anything unknown → 'dashboard'. */
export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '')
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'dashboard'
}

export const href = (r: Route): string => `#/${r}`
