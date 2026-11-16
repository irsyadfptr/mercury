// Dev-server-only endpoints that run the idx CLI (github.com/fzn0x/idx). `apply: 'serve'` keeps them out of `vite build`.
import { execFile } from 'node:child_process'
import type { Plugin } from 'vite'

// IDX_BIN lets you point at a downloaded idx.exe that isn't on PATH.
const BIN = process.env.IDX_BIN || 'idx'
// A 4-letter IDX ticker, or ^JKSE (IHSG on Yahoo).
const SYMBOL = /^(?:[A-Z]{4}|\^JKSE)$/
// shortcut: in-memory, so a dev-server restart refetches; the idx CLI keeps its own disk cache too.
const cache = new Map<string, { day: string; body: string }>()
// Cache key: the WIB date plus before/after 16:30, so a fetch during market hours is redone once the day's final bar exists.
const wibStamp = () => {
  const [day, time] = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).split(' ')
  return `${day} ${time >= '16:30' ? 'closed' : 'open'}`
}

function run(args: string[]): Promise<{ code: number | string; out: string; err: string }> {
  return new Promise((resolve) => {
    // shell is needed on Windows for the npm launcher (idx.cmd). Every arg is fixed, from SCREENS, or matches SYMBOL; quoting keeps cmd.exe from eating the ^ in ^JKSE.
    const win = process.platform === 'win32'
    execFile(BIN, win ? args.map((a) => `"${a}"`) : args, { shell: win, timeout: 60_000, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? ((error as NodeJS.ErrnoException).code ?? 1) : 0
      resolve({ code, out: stdout, err: stderr })
    })
  })
}

// Fixed screens: the client sends only the key, so no user text reaches the idx command line.
// Fundamentals are fetched for the largest SCREEN_FUNDAMENTALS companies that pass the quote-level clauses.
const SCREENS: Record<string, string | undefined> = {
  large: undefined,
  quality: 'roe>15,de<1',
  value: 'pe>0,pe<15',
  dividend: 'div>4',
}
const SCREEN_FUNDAMENTALS = '100'

type Reply = { status: number; body: string }
const fail = (status: number, error: string, extra = {}): Reply => ({ status, body: JSON.stringify({ error, ...extra }) })

/** Runs idx; a non-zero exit becomes the shared error reply, success the raw JSON. */
async function idx(args: string[]): Promise<Reply> {
  const { code, out, err } = await run(['-q', '-o', 'json', ...args])
  // cmd.exe reports a missing command as "not recognized" on stderr; ENOENT elsewhere.
  if (code === 'ENOENT' || code === 127 || /is not recognized/i.test(err)) return fail(503, 'idx-missing')
  if (code === 4) return fail(404, 'not-found')
  if (code !== 0) return fail(502, 'idx-failed', { code })
  return { status: 200, body: out }
}

export function idxPlugin(): Plugin {
  return {
    name: 'mercury-idx',
    apply: 'serve',
    configureServer(server) {
      /** GET path?param=… → validate, then serve from the per-WIB-day cache or produce (only 200s are cached). */
      const route = (path: string, param: string, valid: (v: string) => boolean, produce: (v: string) => Promise<Reply>) =>
        server.middlewares.use(path, async (req, res) => {
          const value = new URL(req.url ?? '', 'http://x').searchParams.get(param) ?? ''
          const send = ({ status, body }: Reply) => {
            res.statusCode = status
            res.setHeader('Content-Type', 'application/json')
            res.end(body)
          }
          if (!valid(value)) return send(fail(400, param === 'symbol' ? 'bad-symbol' : 'bad-screen'))
          const key = `${path} ${value}`
          const day = wibStamp()
          const hit = cache.get(key)
          if (hit?.day === day) return send({ status: 200, body: hit.body })
          const reply = await produce(value)
          if (reply.status === 200) cache.set(key, { day, body: reply.body })
          send(reply)
        })
      const isSymbol = (s: string) => SYMBOL.test(s)

      // GET /api/idx/history?symbol=BBCA → idx's idx.history.v1 JSON (5 years of daily bars, enough for the backtest).
      route('/api/idx/history', 'symbol', isSymbol, (symbol) => idx(['stocks', 'history', symbol, '--period', '5y', '--interval', '1d']))

      // GET /api/idx/fundamentals?symbol=PTBA → { fundamentals: idx.fundamentals.v1, dividends: idx.dividends.v1 | null }.
      route('/api/idx/fundamentals', 'symbol', (s) => isSymbol(s) && s !== '^JKSE', async (symbol) => {
        const f = await idx(['stocks', 'fundamental', symbol])
        if (f.status !== 200) return f
        // A missing dividend history only makes the dividend record unknown.
        const d = await idx(['stocks', 'dividends', symbol])
        return { status: 200, body: `{"fundamentals":${f.body},"dividends":${d.status === 200 ? d.body : 'null'}}` }
      })

      // GET /api/idx/screen?screen=quality → idx.screen.v1 JSON for one of SCREENS, with fundamentals.
      route('/api/idx/screen', 'screen', (s) => Object.hasOwn(SCREENS, s), (screen) => {
        const filter = SCREENS[screen]
        return idx(['stocks', 'screen', '--fundamentals', '--max-fundamentals', SCREEN_FUNDAMENTALS, '-n', '0', ...(filter ? ['-f', filter] : [])])
      })
    },
  }
}
