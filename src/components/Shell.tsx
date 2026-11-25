import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { href, NAV_ROUTES } from '@/routes'
import { useSettings } from '@/settings'
import type { Key, Lang, PixelIconName, Route, ShellProps, ThemePref } from '@/types'
import { PixelIcon } from './PixelIcon'

const THEME_ORDER: readonly ThemePref[] = ['system', 'light', 'dark']
const THEME_LABEL: Record<ThemePref, Key> = { system: 'theme.system', light: 'theme.light', dark: 'theme.dark' }
const NEXT_LANG: Record<Lang, Lang> = { en: 'id', id: 'en' }

const nextTheme = (t: ThemePref): ThemePref => THEME_ORDER[(THEME_ORDER.indexOf(t) + 1) % THEME_ORDER.length]

const focusRing = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
const pill = cn('rounded-md border border-border bg-surface-2 px-2.5 py-1.5 font-label text-[11px] uppercase hover:border-primary', focusRing)

/** Pages drawn in the playful skin (.play-skin in index.css). */
const PLAY_ROUTES: readonly Route[] = ['home', 'crypto', 'stocks', 'funds', 'cashflow', 'settings']

const NAV_ICON: Partial<Record<Route, PixelIconName>> = { home: 'house', crypto: 'coin', stocks: 'chartUp', funds: 'chest', cashflow: 'receipt' }
const INK = 'oklch(0.24 0.03 275)'

/**
 * Header (logo, then the tabs on wide screens, then privacy / language / theme / settings) and, on phones, the same
 * tabs as a bottom bar within thumb reach. Five tabs, one per kind of money: Home, Crypto, Stocks, Funds, Cashflow.
 */
export function Shell({ route, children }: ShellProps) {
  const { t, lang } = useI18n()
  // Pages with the playful skin; the header follows it there so the page reads as one.
  const play = PLAY_ROUTES.includes(route)
  const theme = useSettings((s) => s.theme)
  const privacy = useSettings((s) => !!s.privacy)
  const set = useSettings((s) => s.set)

  return (
    <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col gap-4 px-4 py-5 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
      <header className={cn('flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-surface px-3.5 py-2.5', play && 'play-header')}>
        <a href={href('home')} className={cn('flex items-center gap-2.5 rounded-md', focusRing)}>
          <PixelIcon name="coin" size={24} className={play ? 'coin-spin' : undefined} />
          <span className="font-display text-3xl leading-none">MERCURY</span>
        </a>
        <nav aria-label="Main" className="hidden flex-wrap gap-1 rounded-lg border-2 border-border bg-surface p-1 sm:flex">
          {NAV_ROUTES.map((r) => (
            <a
              key={r}
              href={href(r)}
              data-tone={r === route ? 'gold' : undefined}
              aria-current={r === route ? 'page' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-md border-2 px-2.5 py-1.5 font-label text-xs uppercase',
                focusRing,
                r === route ? 'border-text bg-primary text-primary-foreground shadow-[2px_2px_0_var(--text)]' : 'border-transparent text-text-muted hover:bg-surface-2 hover:text-text',
              )}
            >
              <PixelIcon name={NAV_ICON[r]!} size={12} color={r === route ? INK : undefined} />
              {t(`nav.${r}`)}
            </a>
          ))}
        </nav>
        <div className="flex gap-1">
          {/* Privacy: masks every money amount (•••••), e.g. when someone can see the screen. */}
          <button type="button" onClick={() => set({ privacy: !privacy })} aria-pressed={privacy} aria-label={t('set.privacy')} title={t('set.privacy')} className={pill}>
            {privacy ? '•••' : 'Rp'}
          </button>
          <button type="button" onClick={() => set({ lang: NEXT_LANG[lang] })} aria-label={t('set.language')} className={pill}>
            {lang.toUpperCase()}
          </button>
          <button type="button" onClick={() => set({ theme: nextTheme(theme) })} aria-label={`${t('set.theme')}: ${t(THEME_LABEL[theme])}`} className={pill}>
            {t(THEME_LABEL[theme])}
          </button>
          <a
            href={href('settings')}
            aria-label={t('nav.settings')}
            title={t('nav.settings')}
            aria-current={route === 'settings' ? 'page' : undefined}
            data-tone={route === 'settings' ? 'gold' : undefined}
            className={cn(pill, 'grid place-items-center', route === 'settings' && 'border-text !bg-[var(--tone)]')}
          >
            <PixelIcon name="gear" size={14} color={route === 'settings' ? INK : undefined} />
          </a>
        </div>
      </header>
      <main className="flex flex-col gap-4">{children}</main>
      <BottomTabs route={route} />
    </div>
  )
}

/** Phones only: the main tabs fixed at the bottom, icon over label; the open tab is a raised gold key. */
function BottomTabs({ route }: { route: Route }) {
  const { t } = useI18n()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-text bg-surface px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] sm:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {NAV_ROUTES.map((r) => {
          const on = r === route
          return (
            <li key={r}>
              <a
                href={href(r)}
                data-tone={on ? 'gold' : undefined}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md border-2 px-1 py-1.5 font-label text-[10px] leading-none uppercase',
                  focusRing,
                  on ? '-translate-y-1 border-text bg-[var(--tone)] text-[oklch(0.24_0.03_275)] shadow-[2px_3px_0_var(--text)]' : 'border-transparent text-text-muted active:bg-surface-2',
                )}
              >
                <PixelIcon name={NAV_ICON[r]!} size={18} color={on ? INK : undefined} />
                <span className="max-w-full truncate">{t(`nav.${r}`)}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
