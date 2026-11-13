import { useCashflow } from '@/cashflowStore'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { sheetUrl } from '@/sync/sheets'
import type { SyncBarProps } from '@/types'
import { Button } from './ui/button'

/** Sync status + the one action that fits it (connect, sync, retry). */
export function SyncBar({ sync, compact = false }: SyncBarProps) {
  const { t, locale } = useI18n()
  const pending = useCashflow((s) => s.pending.length)
  const lastSyncAt = useCashflow((s) => s.lastSyncAt)
  const skippedRows = useCashflow((s) => s.skippedRows)
  const spreadsheetId = useCashflow((s) => s.spreadsheetId)
  const portfolioWaiting = useStore((s) => s.changedAt !== undefined && (s.syncedAt === undefined || s.changedAt > s.syncedAt))

  const statusText = {
    unconfigured: t('sync.unconfigured'),
    signedOut: t('sync.signedOut'),
    syncing: t('sync.syncing'),
    error: `${t('sync.error')}${sync.error ? `: ${sync.error}` : ''}`,
    idle: lastSyncAt ? t('sync.synced', { time: new Date(lastSyncAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) }) : t('sync.notYet'),
  }[sync.status]

  return (
    <div className={cn('flex flex-col gap-2', !compact && 'rounded-lg bg-surface-2 p-3')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span role="status" className={cn('font-label text-[11px] uppercase', sync.status === 'error' ? 'text-down' : 'text-text-muted')}>
          {statusText}
          {pending > 0 && <span className="text-warn-text"> · {t('sync.waiting', { n: pending })}</span>}
          {portfolioWaiting && <span className="text-warn-text"> · {t('sync.portfolioWaiting')}</span>}
        </span>
        <div className="flex flex-wrap gap-2">
          {sync.status === 'signedOut' && (
            <Button size="sm" onClick={sync.connect}>
              {t('sync.connect')}
            </Button>
          )}
          {(sync.status === 'idle' || sync.status === 'error') && (
            <Button size="sm" variant="outline" onClick={sync.sync}>
              {t('sync.now')}
            </Button>
          )}
          {!compact && spreadsheetId && (
            <Button size="sm" variant="ghost" asChild>
              <a href={sheetUrl(spreadsheetId)} target="_blank" rel="noreferrer">
                {t('sync.openSheet')} ↗
              </a>
            </Button>
          )}
        </div>
      </div>
      {!compact && <p className="text-xs text-text-muted">{t('sync.explain')}</p>}
      {skippedRows > 0 && <p className="text-xs text-warn-text">{t('sync.skipped', { n: skippedRows })}</p>}
    </div>
  )
}
