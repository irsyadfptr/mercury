import { useEffect, useState } from 'react'

/** Current time, refreshed every minute. Keeps render pure: components read time from here, never Date.now(). */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}
