import { useCallback, useEffect, useState } from 'react'
import type { SheetSync, SyncStatus } from '@/types'
import { useCashflow } from './cashflowStore'
import { currentToken, forgetToken, isConfigured, prepareGoogle, signIn, signOut, wasConnected } from './sync/google'
import { useStore } from './store'
import { SheetsError } from './sync/sheets'
import { syncSheets } from './sync/syncSheets'

/** One automatic reconnect try per page load: if the user closes that popup, they tap Connect themselves. */
let autoTried = false

const initialStatus = (): SyncStatus => (!isConfigured() ? 'unconfigured' : currentToken() ? 'idle' : 'signedOut')

/**
 * Sync state for a page. Syncs on mount, when cashflow is queued or the portfolio is edited, and when the device
 * comes back online, but only while a token is held: getting a token needs a tap (connect), which browsers require.
 */
export function useSheetSync(): SheetSync {
  const [status, setStatus] = useState<SyncStatus>(initialStatus)
  const [error, setError] = useState<string>()
  const pendingCount = useCashflow((s) => s.pending.length)
  const deletedCount = useCashflow((s) => s.deleted.length)
  const edited = useCashflow((s) => s.edited)
  const portfolioChangedAt = useStore((s) => s.changedAt)

  const runWith = useCallback(async (token: string) => {
    setStatus('syncing')
    setError(undefined)
    try {
      await syncSheets(token)
      setStatus('idle')
    } catch (e) {
      if (e instanceof SheetsError && e.status === 401) {
        forgetToken()
        setStatus('signedOut')
      } else {
        setStatus(navigator.onLine ? 'error' : 'idle')
        setError(navigator.onLine ? (e as Error).message : undefined)
      }
    }
  }, [])

  const sync = useCallback(() => {
    const token = currentToken()
    if (token) void runWith(token)
    else if (isConfigured()) setStatus('signedOut')
  }, [runWith])

  const connect = useCallback(() => {
    signIn().then(runWith, (e: Error) => {
      setStatus('signedOut')
      setError(e.message)
    })
  }, [runWith])

  const disconnect = useCallback(() => {
    signOut()
    setStatus('signedOut')
  }, [])

  // Load Google's script early so a later tap can open the popup immediately.
  useEffect(() => {
    if (isConfigured()) prepareGoogle().catch((e: Error) => setError(e.message))
  }, [])

  // Sync on mount, whenever cashflow is queued, edited or deleted, and after portfolio edits.
  useEffect(() => {
    if (currentToken()) sync()
  }, [sync, pendingCount, deletedCount, edited, portfolioChangedAt])

  // Token ran out (~1 h): the next tap anywhere reconnects. The popup needs a tap, and Google closes it by itself
  // when the user already said yes. The Connect button handles its own tap.
  useEffect(() => {
    if (status !== 'signedOut' || autoTried || !wasConnected()) return
    const onTap = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest('[data-connect]')) return
      autoTried = true
      document.removeEventListener('click', onTap, true)
      connect()
    }
    document.addEventListener('click', onTap, true)
    return () => document.removeEventListener('click', onTap, true)
  }, [status, connect])

  useEffect(() => {
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [sync])

  return { status, error, connect, sync, disconnect }
}
