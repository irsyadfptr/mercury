import { useSyncExternalStore } from 'react'
import type { InstallState } from '@/types'

let promptEvent: BeforeInstallPromptEvent | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

/** Call once at startup: registers the offline service worker (production only) and keeps Chrome's install prompt for later. */
export function initPwa(): void {
  // Not in dev: a service worker would cache Vite's dev modules and hide live edits.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a bonus; the app works without it.
    })
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // show our own button instead of Chrome's mini-bar
    promptEvent = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    promptEvent = undefined
    emit()
  })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = (): InstallState => (isStandalone() ? 'installed' : promptEvent ? 'available' : 'manual')
let last: InstallState = 'manual'
const stableSnapshot = () => (last = snapshot())

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, stableSnapshot, () => last)
}

/** Opens Chrome's install dialog. Must run from a click. */
export async function install(): Promise<void> {
  const e = promptEvent
  if (!e) return
  promptEvent = undefined
  await e.prompt()
  emit()
}
