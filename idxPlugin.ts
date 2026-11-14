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
    // shell is needed on Windows for the npm launcher (idx.cmd). Every arg is fixed or matches SYMBOL; quoting keeps cmd.exe from eating the ^ in ^JKSE.
    const win = process.platform === 'win32'
    execFile(BIN, win ? args.map((a) => `"${a}"`) : args, { shell: win, timeout: 60_000, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? ((error as NodeJS.ErrnoException).code ?? 1) : 0
      resolve({ code, out: stdout, err: stderr })
    })
  })
}

export function idxPlugin(): Plugin {
  return {
    name: 'mercury-idx',
    apply: 'serve',
    configureServer(server) {
      // GET /api/idx/history?symbol=BBCA → idx's idx.history.v1 JSON (5 years of daily bars, enough for the backtest).
      server.middlewares.use('/api/idx/history', async (req, res) => {
        const symbol = new URL(req.url ?? '', 'http://x').searchParams.get('symbol')?.toUpperCase() ?? ''
        const send = (status: number, body: string) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(body)
        }
        if (!SYMBOL.test(symbol)) return send(400, JSON.stringify({ error: 'bad-symbol' }))
        const day = wibStamp()
        const hit = cache.get(symbol)
        if (hit?.day === day) return send(200, hit.body)

        const { code, out, err } = await run(['-q', '-o', 'json', 'stocks', 'history', symbol, '--period', '5y', '--interval', '1d'])
        // cmd.exe reports a missing command as "not recognized" on stderr; ENOENT elsewhere.
        if (code === 'ENOENT' || code === 127 || /is not recognized/i.test(err)) return send(503, JSON.stringify({ error: 'idx-missing' }))
        if (code === 4) return send(404, JSON.stringify({ error: 'not-found' }))
        if (code !== 0) return send(502, JSON.stringify({ error: 'idx-failed', code }))
        cache.set(symbol, { day, body: out })
        send(200, out)
      })
    },
  }
}
