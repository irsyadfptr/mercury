// Dev-server-only proxy to Yahoo Finance for US stocks and ETFs (local use only: Yahoo has no browser CORS and no
// official API). `apply: 'serve'` keeps it out of `vite build`; the deployed site uses Twelve Data instead (src/market/us.ts).
import type { Plugin } from 'vite'

// A US ticker (AAPL, BRK-B), an index (^GSPC, ^VIX) or a currency pair (IDR=X). Nothing else reaches Yahoo.
const SYMBOL = /^(?:\^?[A-Z]{1,5}(?:-[A-Z])?|[A-Z]{3}=X)$/
// Fixed choices: the client sends a key, so no free text reaches the Yahoo URL.
const CHARTS: Record<string, { range: string; interval: string; events?: string }> = {
  daily: { range: '5y', interval: '1d' },
  hourly: { range: '1y', interval: '1h' },
  dividends: { range: '10y', interval: '1mo', events: 'div' },
  quote: { range: '5d', interval: '1d' },
}
const MODULES = 'price,summaryDetail,defaultKeyStatistics,financialData,assetProfile'
// Yahoo refuses requests without a browser-like agent.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const CACHE_MS = 15 * 60_000

type Reply = { status: number; body: string }
const fail = (status: number, error: string): Reply => ({ status, body: JSON.stringify({ error }) })
const cache = new Map<string, { at: number; body: string }>()

async function yahoo(url: string, headers: Record<string, string> = {}): Promise<Reply> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } }).catch(() => undefined)
  if (!res) return fail(502, 'fetch-failed')
  const body = await res.text()
  if (res.status === 404) return fail(404, 'not-found')
  if (res.status === 429) return fail(429, 'rate-limited')
  if (!res.ok) return fail(502, 'fetch-failed')
  return { status: 200, body }
}

// quoteSummary needs a session cookie and a crumb (since 2023). Got once per dev-server run, renewed on a 401.
let session: { cookie: string; crumb: string } | undefined
async function getSession(): Promise<typeof session> {
  if (session) return session
  const first = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' }).catch(() => undefined)
  const cookie = (first?.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ')
  if (!cookie) return undefined
  const crumb = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie } })
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '')
  if (!crumb || crumb.includes('<')) return undefined
  return (session = { cookie, crumb })
}

async function chart(symbol: string, kind: string): Promise<Reply> {
  const c = CHARTS[kind]
  const q = new URLSearchParams({ range: c.range, interval: c.interval, includePrePost: 'false', ...(c.events ? { events: c.events } : {}) })
  return yahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${q}`)
}

async function fundamentals(symbol: string): Promise<Reply> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await getSession()
    if (!s) return fail(502, 'fetch-failed')
    const r = await yahoo(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${MODULES}&crumb=${encodeURIComponent(s.crumb)}`, { Cookie: s.cookie })
    if (r.status === 502 && attempt === 0) {
      session = undefined // Expired crumb: get a new one and try once more.
      continue
    }
    if (r.status !== 200) return r
    // The dividend streak comes from 10 years of monthly bars with dividend events; missing only makes it unknown.
    const d = await chart(symbol, 'dividends')
    return { status: 200, body: `{"summary":${r.body},"dividends":${d.status === 200 ? d.body : 'null'}}` }
  }
  return fail(502, 'fetch-failed')
}

export function usPlugin(): Plugin {
  return {
    name: 'mercury-us',
    apply: 'serve',
    configureServer(server) {
      const route = (path: string, produce: (symbol: string, kind: string) => Promise<Reply>, kinds?: Record<string, unknown>) =>
        server.middlewares.use(path, async (req, res) => {
          const q = new URL(req.url ?? '', 'http://x').searchParams
          const symbol = q.get('symbol') ?? ''
          const kind = q.get('kind') ?? ''
          const send = ({ status, body }: Reply) => {
            res.statusCode = status
            res.setHeader('Content-Type', 'application/json')
            res.end(body)
          }
          if (!SYMBOL.test(symbol)) return send(fail(400, 'bad-symbol'))
          if (kinds && !Object.hasOwn(kinds, kind)) return send(fail(400, 'bad-symbol'))
          const key = `${path} ${symbol} ${kind}`
          const hit = cache.get(key)
          if (hit && Date.now() - hit.at < CACHE_MS) return send({ status: 200, body: hit.body })
          const reply = await produce(symbol, kind)
          if (reply.status === 200) cache.set(key, { at: Date.now(), body: reply.body })
          send(reply)
        })

      // GET /api/us/chart?symbol=AAPL&kind=daily|hourly|dividends|quote → Yahoo's v8 chart JSON.
      route('/api/us/chart', chart, CHARTS)
      // GET /api/us/fundamentals?symbol=AAPL → { summary: quoteSummary JSON, dividends: chart JSON | null }.
      route('/api/us/fundamentals', (symbol) => fundamentals(symbol))
    },
  }
}
