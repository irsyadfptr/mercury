import { useEffect, useMemo, useState } from 'react'
import { PixelIcon } from '@/components/PixelIcon'
import { Card, PixelTabs } from '@/components/ui-bits'
import { EXCHANGE_CLASS, EXCHANGES, isTradeMarket, MARKET_CLASSES, scanMarketOf, type Exchange, type MarketPage, type TradeMarket } from '@/domain/markets'
import { useI18n } from '@/i18n'
import { Journal } from '@/pages/Journal/Journal'
import { LongTerm } from '@/pages/LongTerm/LongTerm'
import { Scanner } from '@/pages/Scanner/Scanner'
import { routeParam } from '@/routes'
import type { PixelIconName } from '@/types'
import { Holdings } from './Holdings'

/** A traded market's sections: what you hold, the scanner, the fundamentals check, and its own journal. */
const VIEWS = ['holdings', 'scan', 'score', 'journal'] as const
type View = (typeof VIEWS)[number]
const isView = (v: string | undefined): v is View => !!v && (VIEWS as readonly string[]).includes(v)
const viewKey = (m: TradeMarket) => `mercury.market.${m}.view`

const ICON: Record<MarketPage, PixelIconName> = { crypto: 'coin', stocks: 'chartUp', funds: 'chest' }

/** '#/stocks?view=journal' wins; a prefilled journal note ('?tag=…', '?holding=…') opens the journal; else the last view used. */
function initialView(m: TradeMarket): View {
  const asked = routeParam('view')
  if (isView(asked)) return asked
  if (routeParam('tag') || routeParam('holding') || routeParam('jv')) return 'journal'
  try {
    const saved = localStorage.getItem(viewKey(m)) ?? undefined
    if (isView(saved)) return saved
  } catch {
    // Storage blocked: start on Holdings.
  }
  return 'holdings'
}

/** Crypto, Stocks or Funds: a header with the market's name (and, for traded markets, its section tabs), then the section. */
export function Market({ market }: { market: MarketPage }) {
  return (
    <div className="play-skin contents">
      <div aria-hidden="true" className="play-confetti" />
      {isTradeMarket(market) ? <TradeMarketPage market={market} /> : <FundsPage />}
    </div>
  )
}

function Header({ market, children }: { market: MarketPage; children?: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <Card data-tone="gold" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 font-display text-5xl leading-none uppercase [text-shadow:2px_2px_0_color-mix(in_srgb,var(--tone)_80%,transparent)]">
          <span className="grid size-10 shrink-0 place-items-center rounded-md border-2 border-text" style={{ background: 'var(--tone)' }}>
            <PixelIcon name={ICON[market]} size={20} color="oklch(0.24 0.03 275)" />
          </span>
          {t(`nav.${market}`)}
        </h1>
        {children}
      </div>
      <p className="text-sm text-text-muted">{t(`mk.intro.${market}`)}</p>
    </Card>
  )
}

function FundsPage() {
  return (
    <>
      <Header market="funds" />
      <Holdings market="funds" />
    </>
  )
}

const isExchange = (v: string | undefined): v is Exchange => !!v && (EXCHANGES as readonly string[]).includes(v)
const EXCHANGE_KEY = 'mercury.stocks.exchange'
/** '…?ex=us' wins, else the last exchange used, else IDX. */
function initialExchange(): Exchange {
  const asked = routeParam('ex')
  if (isExchange(asked)) return asked
  try {
    const saved = localStorage.getItem(EXCHANGE_KEY) ?? undefined
    if (isExchange(saved)) return saved
  } catch {
    // Storage blocked: start on IDX.
  }
  return 'idx'
}

const remember = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v)
  } catch {
    // Storage blocked: the choice lasts this visit only.
  }
}

function TradeMarketPage({ market }: { market: TradeMarket }) {
  const { t } = useI18n()
  const [view, setView] = useState(() => initialView(market))
  const [ex, setEx] = useState(initialExchange)
  // A link to '#/stocks?view=…&ex=…' while this market is already open (e.g. a Home quest) still switches.
  useEffect(() => {
    const follow = () => {
      const asked = routeParam('view')
      if (isView(asked)) setView(asked)
      const askedEx = routeParam('ex')
      if (isExchange(askedEx)) setEx(askedEx)
    }
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])
  const pick = (v: View) => {
    setView(v)
    remember(viewKey(market), v)
  }
  const pickEx = (v: Exchange) => {
    setEx(v)
    remember(EXCHANGE_KEY, v)
  }
  // Stocks: everything below follows the exchange picked (IDX or US). Crypto has one market.
  const stocks = market === 'stocks'
  const scan = scanMarketOf(market, ex)
  const classes = useMemo(() => (stocks ? [EXCHANGE_CLASS[ex]] : MARKET_CLASSES[market]), [stocks, ex, market])

  return (
    <>
      <Header market={market}>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {stocks && (
            <PixelTabs label={t('mk.exchange')} options={EXCHANGES.map((x) => ({ id: x, label: t(`mk.ex.${x}`) }))} value={ex} onChange={pickEx} className="grid grid-cols-2 sm:flex" />
          )}
          {/* Phone: an even 2 × 2 grid rather than three and a straggler. */}
          <PixelTabs
            label={t('mk.viewLabel')}
            options={VIEWS.map((v) => ({ id: v, label: t(`mk.view.${v}`) }))}
            value={view}
            onChange={pick}
            className="grid w-full grid-cols-2 sm:flex sm:w-auto"
          />
        </div>
      </Header>
      {view === 'holdings' && <Holdings key={scan} market={market} classes={classes} />}
      {view === 'scan' && <Scanner key={scan} market={scan} />}
      {view === 'score' && <LongTerm key={scan} market={scan} />}
      {view === 'journal' && <Journal key={scan} market={market} classes={classes} signals={scan} />}
    </>
  )
}
