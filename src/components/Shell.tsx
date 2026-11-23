import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { href, NAV_ROUTES } from '@/routes'
import { useSettings } from '@/settings'
import type { Key, Lang, Route, ShellProps, ThemePref } from '@/types'
import { PixelIcon } from './PixelIcon'

const THEME_ORDER: readonly ThemePref[] = ['system', 'light', 'dark']
const THEME_LABEL: Record<ThemePref, Key> = { system: 'theme.system', light: 'theme.light', dark: 'theme.dark' }
const NEXT_LANG: Record<Lang, Lang> = { en: 'id', id: 'en' }

const nextTheme = (t: ThemePref): ThemePref => THEME_ORDER[(THEME_ORDER.indexOf(t) + 1) % THEME_ORDER.length]

const focusRing = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
const pill = cn('rounded-md border border-border bg-surface-2 px-2.5 py-1.5 font-label text-[11px] uppercase hover:border-primary', focusRing)

/** Pages drawn in the playful skin (.play-skin in index.css). */
const PLAY_ROUTES: readonly Route[] = ['cashflow', 'dashboard', 'portfolio', 'scanner', 'longterm', 'journal', 'settings']

export function Shell({ route, children }: ShellProps) {
  const { t, lang } = useI18n()
  // Pages with the playful skin; the header follows it there so the page reads as one.
  const play = PLAY_ROUTES.includes(route)
  const theme = useSettings((s) => s.theme)
  const privacy = useSettings((s) => !!s.privacy)
  const set = useSettings((s) => s.set)

  return (
    <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col gap-4 px-4 py-5 sm:px-6">
      <header className={cn('flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-surface px-3.5 py-2.5', play && 'play-header')}>
        <a href={href('dashboard')} className={cn('flex items-center gap-2.5 rounded-md', focusRing)}>
          <PixelIcon name="coin" size={24} className={play ? 'coin-spin' : undefined} />
          <span className="font-display text-3xl leading-none">MERCURY</span>
        </a>
        <nav aria-label="Main" className="flex flex-wrap gap-1">
          {NAV_ROUTES.map((r) => (
            <a
              key={r}
              href={href(r)}
              data-tone={play && r === route ? 'gold' : undefined}
              aria-current={r === route ? 'page' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1.5 font-label text-xs uppercase',
                focusRing,
                r === route ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:bg-surface-2 hover:text-text',
              )}
            >
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
        </div>
      </header>
      <main className="flex flex-col gap-4">{children}</main>
    </div>
  )
}
