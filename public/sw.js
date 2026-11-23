// Mercury offline shell.
// - Page (navigation): network-first, so a new deploy shows on the next online visit; cached copy when offline.
// - Built assets (/assets/*, icons): cache-first; Vite puts a content hash in their names, so they never go stale.
// - Other origins (Google sign-in, Sheets API, fonts CDN): never touched, always straight to the network.
const CACHE = 'mercury-v4'
// Data the app shares with this worker (bills for reminders; src/billReminders.ts). Never cleared on update.
const DATA = 'mercury-data'
// The folder the app is served from: "/" on Vercel, "/mercury/" on GitHub Pages.
const BASE = new URL(self.registration.scope).pathname

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const html = await (await fetch(BASE, { cache: 'no-store' })).text()
      // Precache everything the page links to (scripts, styles, manifest, icons) so the first offline open works.
      const linked = [...html.matchAll(/(?:src|href)="(\/[^"/][^"]*)"/g)].map((m) => m[1])
      // Fonts are only requested when text renders, so read them out of the stylesheets too (woff2 only; every phone supports it).
      const fonts = []
      for (const css of linked.filter((u) => u.endsWith('.css'))) {
        const text = await (await fetch(css)).text()
        fonts.push(...[...text.matchAll(/url\(["']?(\/[^)"']+\.woff2)["']?\)/g)].map((m) => m[1]))
      }
      await cache.addAll([...new Set([BASE, ...linked, ...fonts])])
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE && key !== DATA) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          if (res.ok) caches.open(CACHE).then((c) => c.put(BASE, copy))
          return res
        })
        .catch(async () => (await caches.match(BASE, { ignoreVary: true })) ?? Response.error()),
    )
    return
  }

  event.respondWith(
    // ignoreVary: the server sends "Vary: Origin", but module scripts carry an Origin header and precache requests do not.
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          const copy = res.clone()
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        }),
    ),
  )
})

// ---- Bill reminders (periodic background sync, installed Chrome/Edge only) ----
const TEXT = {
  en: { title: (n) => `Pay ${n}`, today: 'Due today', soon: (d) => `Due in ${d} days`, late: (d) => `${d} days late` },
  id: { title: (n) => `Bayar ${n}`, today: 'Jatuh tempo hari ini', soon: (d) => `Jatuh tempo ${d} hari lagi`, late: (d) => `Telat ${d} hari` },
}
const DAY_MS = 86_400_000

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'bills') event.waitUntil(remindBills())
})

async function remindBills() {
  const cache = await caches.open(DATA)
  const res = await cache.match(BASE + 'bills.json')
  if (!res) return
  const { lang, remindDays, bills } = await res.json()
  const text = TEXT[lang] ?? TEXT.en
  const seenRes = await cache.match(BASE + 'notified.json')
  const seen = seenRes ? await seenRes.json() : {}
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const today = Date.parse(`${todayStr}T00:00:00Z`) / DAY_MS
  const kept = {}
  for (const b of bills) {
    const days = Date.parse(`${b.dueDate}T00:00:00Z`) / DAY_MS - today
    if (days > remindDays) continue
    const key = `${b.id}|${b.dueDate}`
    kept[key] = todayStr
    if (seen[key] === todayStr) continue // once a day per bill
    const when = days < 0 ? text.late(-days) : days === 0 ? text.today : text.soon(days)
    const amount = b.amount ? ` · ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(b.amount)}` : ''
    await self.registration.showNotification(text.title(b.name), { body: when + amount, tag: key, icon: BASE + 'icon-192.png', data: { url: BASE + '#/cashflow' } })
  }
  await cache.put(BASE + 'notified.json', new Response(JSON.stringify(kept)))
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? BASE
  event.waitUntil(
    (async () => {
      const [win] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (win) return (await win.navigate(url))?.focus()
      return self.clients.openWindow(url)
    })(),
  )
})
