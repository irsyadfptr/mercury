import { useSyncExternalStore } from 'react'
import { Shell } from '@/components/Shell'
import { Cashflow } from '@/pages/Cashflow/Cashflow'
import { Dashboard } from '@/pages/Dashboard/Dashboard'
import { Market } from '@/pages/Market/Market'
import { QuickAdd } from '@/pages/QuickAdd/QuickAdd'
import { Settings } from '@/pages/Settings/Settings'
import { legacyHash, parseRoute } from '@/routes'
import type { Route } from '@/types'

// shortcut: hash routing (#/crypto) is enough for a handful of pages and static hosting; switch to a router if pages need params.
const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
const currentRoute = (): Route => {
  // An old link (#/scanner, #/journal …) is rewritten in place, so Back doesn't bounce through it.
  const moved = legacyHash(location.hash)
  if (moved) history.replaceState(null, '', moved)
  return parseRoute(location.hash)
}

export default function App() {
  const route = useSyncExternalStore(subscribe, currentRoute)
  // Quick add is a phone screen: no app chrome, just the entry flow.
  if (route === 'add') return <QuickAdd />
  return (
    <Shell route={route}>
      {route === 'home' && <Dashboard />}
      {(route === 'crypto' || route === 'stocks' || route === 'funds') && <Market key={route} market={route} />}
      {route === 'cashflow' && <Cashflow />}
      {route === 'settings' && <Settings />}
    </Shell>
  )
}
