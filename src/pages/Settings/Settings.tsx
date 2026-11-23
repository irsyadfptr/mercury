import { useEffect, useRef, useState } from 'react'
import { disableReminders, enableReminders, reminderState } from '@/billReminders'
import { useCashflow } from '@/cashflowStore'
import { SyncBar } from '@/components/SyncBar'
import { Button } from '@/components/ui/button'
import { Card, CardTitle, Field, fieldClass } from '@/components/ui-bits'
import { DEFAULT_BREAKER, type BreakerSettings } from '@/domain/circuitBreaker'
import { parseBackup, toBackup } from '@/domain/backup'
import { useI18n } from '@/i18n'
import { install, useInstallState } from '@/pwa'
import { useSettings } from '@/settings'
import { useStore } from '@/store'
import { ENV_KEY } from '@/useCryptoMarket'
import type { Lang, ReminderState, ThemePref } from '@/types'
import { useCashEntries } from '@/useCashEntries'
import { currentToken } from '@/sync/google'
import { testConnection } from '@/sync/sheets'
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
        <BreakerLimits />
        <MarketData />
        <AiSettings />
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
      <BillReminders />
    </Card>
  )
}

/** Phone notifications for bills due soon (src/billReminders.ts). */
function BillReminders() {
  const { t } = useI18n()
  const [state, setState] = useState<ReminderState>()
  useEffect(() => {
    void reminderState().then(setState)
  }, [])
  if (!state) return null
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">{t('remind.title')}</span>
        {(state === 'off' || state === 'needsInstall') && (
          <Button size="sm" onClick={() => void enableReminders().then(setState)}>
            {t('remind.on')}
          </Button>
        )}
        {state === 'on' && (
          <Button size="sm" variant="outline" onClick={() => void disableReminders().then(setState)}>
            {t('remind.off')}
          </Button>
        )}
      </div>
      <p role="status" className="text-xs text-text-muted">
        {t(`remind.state.${state}`)}
      </p>
    </div>
  )
}

function CashflowSettings() {
  const { t } = useI18n()
  const monthlyBudget = useSettings((s) => s.monthlyBudget)
  const set = useSettings((s) => s.set)
  const sync = useSheetSync()
  const [test, setTest] = useState<{ sheets: string; drive: string } | 'running' | 'signedOut'>()

  async function runTest() {
    const token = currentToken()
    if (!token) return setTest('signedOut')
    setTest('running')
    setTest(await testConnection(token, useCashflow.getState().spreadsheetId))
  }

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
        <div className="flex flex-wrap gap-2">
          {sync.status !== 'unconfigured' && (
            <Button variant="outline" size="sm" onClick={() => void runTest()} disabled={test === 'running'}>
              {t(test === 'running' ? 'set.testing' : 'set.testConnection')}
            </Button>
          )}
          {(sync.status === 'idle' || sync.status === 'error') && (
            <Button variant="ghost" size="sm" onClick={sync.disconnect}>
              {t('sync.disconnect')}
            </Button>
          )}
        </div>
        {test === 'signedOut' && <p className="text-sm text-warn-text">{t('set.testSignIn')}</p>}
        {test && typeof test === 'object' && (
          <ul role="status" className="flex flex-col gap-1 text-sm">
            {(['sheets', 'drive'] as const).map((api) => (
              <li key={api} className={test[api] === 'ok' ? 'text-up' : 'text-down'}>
                {test[api] === 'ok' ? '✓' : '✗'} {t(api === 'sheets' ? 'set.apiSheets' : 'set.apiDrive')}
                {test[api] !== 'ok' && <span className="block pl-4 text-xs break-words text-text-muted">{test[api]}</span>}
              </li>
            ))}
          </ul>
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

/** Circuit breaker limits and the gate's revenge window (src/domain/circuitBreaker.ts). */
function BreakerLimits() {
  const { t } = useI18n()
  const saved = useSettings((s) => s.breaker)
  const set = useSettings((s) => s.set)
  const b = saved ?? DEFAULT_BREAKER
  const field = (key: keyof BreakerSettings, step: string) => (
    <Field label={t(`set.cb.${key}`)}>
      <input
        className={fieldClass}
        type="number"
        min={key === 'streak' ? '1' : key === 'revengeDays' || key === 'cooldownDays' ? '0' : '0.1'}
        step={step}
        value={b[key]}
        onChange={(e) => {
          const n = optional(e.target.value)
          // Percent limits stay positive; counts and days can be 0 (off) except the streak.
          if (n !== undefined && n >= (key === 'streak' ? 1 : 0) && (n > 0 || key === 'cooldownDays' || key === 'revengeDays')) set({ breaker: { ...b, [key]: n } })
        }}
      />
    </Field>
  )
  return (
    <Card>
      <CardTitle icon="cross">{t('set.cb.title')}</CardTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {field('dailyPct', '0.1')}
        {field('weeklyPct', '0.1')}
        {field('monthlyPct', '0.1')}
        {field('streak', '1')}
        {field('cooldownDays', '1')}
        {field('revengeDays', '1')}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted">{t('set.cb.note')}</p>
        {saved && (
          <button type="button" className="text-xs underline" onClick={() => set({ breaker: undefined })}>
            {t('set.cb.reset')}
          </button>
        )}
      </div>
    </Card>
  )
}

function MarketData() {
  const { t } = useI18n()
  const { coingeckoKey, set } = useSettings()
  const source = coingeckoKey ? 'set.keyActive' : ENV_KEY ? 'set.keyFromEnv' : 'set.keyMissing'
  return (
    <Card>
      <CardTitle icon="chartUp" aside={t(source)}>
        {t('set.market')}
      </CardTitle>
      <Field label={t('set.cgKey')} hint={t('set.cgKeyHint')}>
        <input className={fieldClass} type="password" autoComplete="off" spellCheck={false} value={coingeckoKey ?? ''} onChange={(e) => set({ coingeckoKey: e.target.value.trim() || undefined })} />
      </Field>
    </Card>
  )
}

function AiSettings() {
  const { t } = useI18n()
  const { deepseekKey, set } = useSettings()
  return (
    <Card>
      <CardTitle icon="chartUp" aside={t(deepseekKey ? 'set.keyActive' : 'set.keyMissing')}>
        {t('set.ai')}
      </CardTitle>
      <Field label={t('set.dsKey')} hint={t('set.dsKeyHint')}>
        <input className={fieldClass} type="password" autoComplete="off" spellCheck={false} value={deepseekKey ?? ''} onChange={(e) => set({ deepseekKey: e.target.value.trim() || undefined })} />
      </Field>
    </Card>
  )
}

function Backup() {
  const { t, locale } = useI18n()
  const { lastExportAt, set } = useSettings()
  const { holdings, transactions, journal, dividends, replaceAll } = useStore()
  const { entries } = useCashEntries()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<StatusMessage>()

  function exportJson() {
    const now = new Date().toISOString()
    const { accounts, bills, goals } = useCashflow.getState()
    downloadJson(`mercury-${now.slice(0, 10)}.json`, toBackup(holdings, transactions, now, journal, { dividends, cashflow: { entries, accounts, bills, goals } }))
    set({ lastExportAt: now })
  }

  async function importJson(file: File) {
    const result = parseBackup(await file.text())
    if (!result.ok) return setMessage({ text: result.error, error: true })
    const cash = result.data.cashflow
    if (!confirm(t(cash ? 'set.importConfirmCash' : 'set.importConfirm', { n: result.data.holdings.length, e: cash?.entries.length ?? 0 }))) return
    replaceAll(result.data)
    // Cashflow is added, never wiped: entries this device or the Sheet lacks are queued; accounts, bills and goals merge (newest edit wins).
    if (cash) useCashflow.getState().restoreCashflow(cash)
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
