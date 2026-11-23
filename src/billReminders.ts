// Bill reminders as phone notifications. The service worker (public/sw.js) checks the bills on a periodic background
// sync and shows one notification a day per bill that is due within BILL_REMIND_DAYS or overdue.
// shortcut: Periodic Background Sync exists only in Chrome/Edge for an installed app and runs about once a day at the
// browser's choice; iPhone and Firefox get no reminders. Web Push from a server would cover them.
import type { ReminderState } from '@/types'
import { useCashflow } from './cashflowStore'
import { BILL_REMIND_DAYS } from './domain/bills'
import { useSettings } from './settings'

/** Shared with public/sw.js, which has no localStorage: the bills it checks live here. */
const DATA_CACHE = 'mercury-data'
const BILLS_URL = `${import.meta.env.BASE_URL}bills.json`
const TAG = 'bills'
const MIN_INTERVAL_MS = 12 * 3_600_000

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return undefined
  return navigator.serviceWorker.getRegistration()
}

export async function reminderState(): Promise<ReminderState> {
  const reg = await registration()
  if (!reg?.periodicSync) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const on = Notification.permission === 'granted' && (await reg.periodicSync.getTags()).includes(TAG)
  return on ? 'on' : 'off'
}

/** Asks for notification permission (must run from a tap), then registers the daily check. */
export async function enableReminders(): Promise<ReminderState> {
  const reg = await registration()
  if (!reg?.periodicSync) return 'unsupported'
  if ((await Notification.requestPermission()) !== 'granted') return reminderState()
  try {
    await reg.periodicSync.register(TAG, { minInterval: MIN_INTERVAL_MS })
  } catch {
    return 'needsInstall' // Chrome allows periodic sync only for an installed app
  }
  return reminderState()
}

export async function disableReminders(): Promise<ReminderState> {
  await (await registration())?.periodicSync?.unregister(TAG)
  return reminderState()
}

/** Call once at startup: keeps the active bills (and the language) where the service worker can read them. */
export function mirrorBills(): void {
  if (!('caches' in window)) return
  const write = () => {
    const bills = useCashflow
      .getState()
      .bills.filter((b) => !b.archived && !b.income)
      .map(({ id, name, amount, dueDate }) => ({ id, name, amount, dueDate }))
    const body = JSON.stringify({ lang: useSettings.getState().lang, remindDays: BILL_REMIND_DAYS, bills })
    caches
      .open(DATA_CACHE)
      .then((c) => c.put(BILLS_URL, new Response(body, { headers: { 'content-type': 'application/json' } })))
      .catch(() => {
        // No cache storage (private window): reminders keep the last copy.
      })
  }
  write()
  useCashflow.subscribe((s, prev) => {
    if (s.bills !== prev.bills) write()
  })
  useSettings.subscribe((s, prev) => {
    if (s.lang !== prev.lang) write()
  })
}
