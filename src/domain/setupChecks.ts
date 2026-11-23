// Pure: the Settings page's status row. No clock, storage or UI: every input is a parameter.
import type { InstallState, SyncStatus } from '@/types'
import { BACKUP_EVERY_DAYS } from './portfolio'

export type SetupCheckId = 'backup' | 'sync' | 'cgKey' | 'dsKey' | 'app'
export interface SetupCheck {
  id: SetupCheckId
  ok: boolean
  /** Backup only: whole days since the last export; null = never exported. */
  days?: number | null
}

/**
 * What's set up and what isn't, in the order the page shows it: a backup within BACKUP_EVERY_DAYS, Google sync
 * signed in (left out when this build has no Google client), the two API keys, and the app installed.
 */
export function setupChecks(p: { lastExportAt?: string; now: number; sync: SyncStatus; cgKey: boolean; dsKey: boolean; install: InstallState }): SetupCheck[] {
  const days = p.lastExportAt ? Math.floor((p.now - Date.parse(p.lastExportAt)) / 86_400_000) : null
  return [
    { id: 'backup', ok: days !== null && days <= BACKUP_EVERY_DAYS, days },
    ...(p.sync === 'unconfigured' ? [] : [{ id: 'sync' as const, ok: p.sync === 'idle' || p.sync === 'syncing' }]),
    { id: 'cgKey', ok: p.cgKey },
    { id: 'dsKey', ok: p.dsKey },
    { id: 'app', ok: p.install === 'installed' },
  ]
}
