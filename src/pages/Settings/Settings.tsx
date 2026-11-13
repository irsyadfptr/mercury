import { useRef, useState } from 'react'
import { SyncBar } from '@/components/SyncBar'
import { Button } from '@/components/ui/button'
import { Card, CardTitle, Field, fieldClass } from '@/components/ui-bits'
import { parseBackup, toBackup } from '@/domain/backup'
import { useI18n } from '@/i18n'
import { install, useInstallState } from '@/pwa'
import { useSettings } from '@/settings'
import { useStore } from '@/store'
import type { Lang, ThemePref } from '@/types'
import { useSheetSync } from '@/useSheetSync'
import type { StatusMessage } from './Settings.types'

/** Triggers a browser download of a JSON value. */
function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** '' → undefined so clearing a field unsets the value. */
const optional = (s: string) => (s.trim() === '' ? undefined : Number(s))

export function Settings() {
  const { t } = useI18n()
  return (
    <>
      <Card>
        <h1 className="font-display text-5xl leading-none uppercase">{t('set.title')}</h1>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Preferences />
        <RiskLimits />
        <CashflowSettings />
        <PhoneApp />
        <Backup />
      </div>
    </>
  )
}

function PhoneApp() {
  const { t } = useI18n()
  const state = useInstallState()
  return (
    <Card className="md:col-span-2">
      <CardTitle icon="coin">{t('pwa.title')}</CardTitle>
      {state === 'installed' && <p className="text-sm">{t('pwa.installed')}</p>}
      {state === 'available' && (
        <Button onClick={() => void install()} className="font-label text-xs uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none">
          {t('pwa.install')}
        </Button>
      )}
      {state === 'manual' && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text-muted">
          <li>{t('pwa.other')}</li>
          <li>{t('pwa.ios')}</li>
          <li>{t('pwa.needsHttps')}</li>
        </ul>
      )}
    </Card>
  )
}

function CashflowSettings() {
  const { t } = useI18n()
  const monthlyBudget = useSettings((s) => s.monthlyBudget)
  const set = useSettings((s) => s.set)
  const sync = useSheetSync()
  return (
    <Card className="md:col-span-2">
      <CardTitle icon="coin">{t('set.cashflow')}</CardTitle>
      <div className="flex flex-col gap-3">
        <Field label={t('set.budget')} className="max-w-xs">
          <input
            className={fieldClass}
            type="number"
            min="0"
            step="any"
            value={monthlyBudget ?? ''}
            onChange={(e) => {
              const n = optional(e.target.value)
              set({ monthlyBudget: n && n > 0 ? Math.round(n) : undefined })
            }}
          />
        </Field>
        <SyncBar sync={sync} />
        {(sync.status === 'idle' || sync.status === 'error') && (
          <Button variant="ghost" size="sm" className="self-start" onClick={sync.disconnect}>
            {t('sync.disconnect')}
          </Button>
        )}
      </div>
    </Card>
  )
}

function Preferences() {
  const { t } = useI18n()
  const { lang, theme, set } = useSettings()
  return (
    <Card>
      <CardTitle>
        {t('set.language')} · {t('set.theme')}
      </CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('set.language')}>
          <select className={fieldClass} value={lang} onChange={(e) => set({ lang: e.target.value as Lang })}>
            <option value="en">English</option>
            <option value="id">Bahasa Indonesia</option>
          </select>
        </Field>
        <Field label={t('set.theme')}>
          <select className={fieldClass} value={theme} onChange={(e) => set({ theme: e.target.value as ThemePref })}>
            <option value="system">{t('theme.system')}</option>
            <option value="light">{t('theme.light')}</option>
            <option value="dark">{t('theme.dark')}</option>
          </select>
        </Field>
      </div>
    </Card>
  )
}

function RiskLimits() {
  const { t } = useI18n()
  const { heatLimit, tradeLimit, usdIdr, set } = useSettings()
  // Limits must stay positive; ignore empty or zero while typing.
  const setLimit = (key: 'heatLimit' | 'tradeLimit', raw: string) => {
    const n = optional(raw)
    if (n && n > 0) set({ [key]: n })
  }
  return (
    <Card>
      <CardTitle icon="heart">{t('set.limits')}</CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('set.heatLimit')}>
          <input className={fieldClass} type="number" min="0.1" step="0.1" value={heatLimit} onChange={(e) => setLimit('heatLimit', e.target.value)} />
        </Field>
        <Field label={t('set.tradeLimit')}>
          <input className={fieldClass} type="number" min="0.1" step="0.1" value={tradeLimit} onChange={(e) => setLimit('tradeLimit', e.target.value)} />
        </Field>
        <Field label={t('set.fx')} hint={t('set.fxHint')}>
          <input className={fieldClass} type="number" min="0" step="any" value={usdIdr ?? ''} onChange={(e) => set({ usdIdr: optional(e.target.value) })} />
        </Field>
      </div>
    </Card>
  )
}

function Backup() {
  const { t, locale } = useI18n()
  const { lastExportAt, set } = useSettings()
  const { holdings, transactions, replaceAll } = useStore()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<StatusMessage>()

  function exportJson() {
    const now = new Date().toISOString()
    downloadJson(`mercury-${now.slice(0, 10)}.json`, toBackup(holdings, transactions, now))
    set({ lastExportAt: now })
  }

  async function importJson(file: File) {
    const result = parseBackup(await file.text())
    if (!result.ok) return setMessage({ text: result.error, error: true })
    if (!confirm(t('set.importConfirm', { n: result.data.holdings.length }))) return
    replaceAll(result.data)
    setMessage({ text: t('set.imported', { h: result.data.holdings.length, t: result.data.transactions.length }) })
  }

  return (
    <Card className="md:col-span-2">
      <CardTitle icon="chest" aside={t('set.storage')}>
        {t('set.backup')}
      </CardTitle>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={exportJson}>{t('set.export')}</Button>
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          {t('set.import')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importJson(file)
            e.target.value = ''
          }}
        />
        <span className="text-sm text-text-muted">{t('set.lastExport', { d: lastExportAt ? new Date(lastExportAt).toLocaleString(locale) : t('set.never') })}</span>
      </div>
      {message && (
        <p role="status" className={message.error ? 'mt-3 text-sm text-down' : 'mt-3 text-sm'}>
          {message.text}
        </p>
      )}
    </Card>
  )
}
