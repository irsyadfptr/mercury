import { describe, expect, it } from 'vitest'
import { setupChecks } from './setupChecks'

const NOW = Date.parse('2026-11-23T12:00:00Z')
const base = { now: NOW, sync: 'idle' as const, cgKey: true, dsKey: false, install: 'manual' as const }

describe('setupChecks', () => {
  it('passes a recent backup and fails an old or missing one', () => {
    expect(setupChecks({ ...base, lastExportAt: '2026-11-20T09:00:00Z' })[0]).toEqual({ id: 'backup', ok: true, days: 3 })
    expect(setupChecks({ ...base, lastExportAt: '2026-11-01T09:00:00Z' })[0]).toEqual({ id: 'backup', ok: false, days: 22 })
    expect(setupChecks(base)[0]).toEqual({ id: 'backup', ok: false, days: null })
  })
  it('lists sync only when this build has Google sync', () => {
    expect(setupChecks(base).map((c) => c.id)).toEqual(['backup', 'sync', 'cgKey', 'dsKey', 'app'])
    expect(setupChecks({ ...base, sync: 'unconfigured' }).map((c) => c.id)).toEqual(['backup', 'cgKey', 'dsKey', 'app'])
    expect(setupChecks({ ...base, sync: 'signedOut' }).find((c) => c.id === 'sync')!.ok).toBe(false)
  })
  it('reads keys and install state', () => {
    const c = setupChecks({ ...base, install: 'installed' })
    expect(c.find((x) => x.id === 'cgKey')!.ok).toBe(true)
    expect(c.find((x) => x.id === 'dsKey')!.ok).toBe(false)
    expect(c.find((x) => x.id === 'app')!.ok).toBe(true)
  })
})
