import type { CssColor, Route } from '@/types'

export interface StatTile {
  label: string
  value: string
  sub: string
  color: CssColor
}

export interface QuestView {
  label: string
  /** Short status like "14 days old"; empty when none. */
  tag: string
  route: Route
  /** Query for the route, e.g. a journal note to prefill. */
  params?: Record<string, string>
}
