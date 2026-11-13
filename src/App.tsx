import { useSyncExternalStore } from 'react'
import { Shell } from '@/components/Shell'
import { Dashboard } from '@/pages/Dashboard/Dashboard'
import { Portfolio } from '@/pages/Portfolio/Portfolio'
import { Settings } from '@/pages/Settings/Settings'
import { parseRoute } from '@/routes'
import type { Route } from '@/types'

// shortcut: hash routing (#/portfolio) is enough for 3 pages and static hosting; switch to a router if pages need params.
const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
const currentRoute = (): Route => parseRoute(location.hash)

export default function App() {
  const route = useSyncExternalStore(subscribe, currentRoute)
  return (
    <Shell route={route}>
      {route === 'dashboard' && <Dashboard />}
      {route === 'portfolio' && <Portfolio />}
      {route === 'settings' && <Settings />}
    </Shell>
  )
}
