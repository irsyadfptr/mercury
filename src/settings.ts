import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ResolvedTheme, SettingsState, SettingsValues, ThemePref } from '@/types'

export const DEFAULT_SETTINGS: SettingsValues = { lang: 'en', theme: 'system', heatLimit: 6, tradeLimit: 1 }

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      lang: navigator.language.startsWith('id') ? 'id' : 'en',
      set: (patch) => set(patch),
    }),
    {
      name: 'mercury.settings',
      partialize: ({ lang, theme, heatLimit, tradeLimit, usdIdr, lastExportAt, monthlyBudget }): SettingsValues => ({
        lang,
        theme,
        heatLimit,
        tradeLimit,
        usdIdr,
        lastExportAt,
        monthlyBudget,
      }),
    },
  ),
)

/** Pure: which theme a preference means given the OS setting. */
export const resolveTheme = (pref: ThemePref, systemDark: boolean): ResolvedTheme => (pref === 'system' ? (systemDark ? 'dark' : 'light') : pref)

const THEME_KEY = 'mercury.theme'
const darkQuery = () => matchMedia('(prefers-color-scheme: dark)')

/** Writes the preference where index.html's pre-paint script reads it, and applies it to <html>. */
function applyTheme(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, pref)
  } catch {
    // Storage blocked: the theme still applies for this visit.
  }
  document.documentElement.dataset.theme = resolveTheme(pref, darkQuery().matches)
}

/** Call once at startup: applies the theme and follows later changes (setting or OS). Returns a cleanup. */
export function initTheme(): () => void {
  applyTheme(useSettings.getState().theme)
  const query = darkQuery()
  const onOsChange = () => applyTheme(useSettings.getState().theme)
  query.addEventListener('change', onOsChange)
  const unsubscribe = useSettings.subscribe((s, prev) => {
    if (s.theme !== prev.theme) applyTheme(s.theme)
  })
  return () => {
    query.removeEventListener('change', onOsChange)
    unsubscribe()
  }
}
