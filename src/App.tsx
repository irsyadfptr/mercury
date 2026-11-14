import { useSyncExternalStore } from 'react'
import { Shell } from '@/components/Shell'
import { Cashflow } from '@/pages/Cashflow/Cashflow'
import { Dashboard } from '@/pages/Dashboard/Dashboard'
import { Portfolio } from '@/pages/Portfolio/Portfolio'
import { QuickAdd } from '@/pages/QuickAdd/QuickAdd'
import { Scanner } from '@/pages/Scanner/Scanner'
import { Settings } from '@/pages/Settings/Settings'
import { parseRoute } from '@/routes'
import type { Route } from '@/types'

// shortcut: hash routing (#/portfolio) is enough for a handful of pages and static hosting; switch to a router if pages need params.
const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
const currentRoute = (): Route => parseRoute(location.hash)

export default function App() {
  const route = useSyncExternalStore(subscribe, currentRoute)
  // Quick add is a phone screen: no app chrome, just the entry flow.
  if (route === 'add') return <QuickAdd />
  return (
    <Shell route={route}>
      {route === 'dashboard' && <Dashboard />}
      {route === 'portfolio' && <Portfolio />}
      {route === 'scanner' && <Scanner />}
      {route === 'cashflow' && <Cashflow />}
      {route === 'settings' && <Settings />}
    </Shell>
  )
}
