// Service worker: makes Quaera Lab open without a network after the first visit.
// The build (vite.config.ts → pwaPlugin) replaces the placeholders below with the build hash,
// the shell (downloaded on install) and the on-demand files with their content hashes (src/core/pwa.ts).
const VERSION = '__VERSION__'
const SHELL = __SHELL__
const ON_DEMAND = __ON_DEMAND__
const SHELL_CACHE = `stratalab-shell-${VERSION}`
// Not per version: DuckDB's 35 MB .wasm stays when a deploy does not change it.
const FILES_CACHE = 'stratalab-files'

const scope = () => self.registration.scope
// The cache key carries the file's hash, so a changed file under the same name (pyodide/…) is fetched again.
const fileKey = (path) => `${scope()}${path}?sw=${ON_DEMAND[path]}`

self.addEventListener('install', (event) => {
  // Not skipWaiting(): an open tab may still load chunks of its own version.
  // The page shows "Update" and sends SKIP_WAITING when the user agrees.
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(['./', ...SHELL.map((f) => `./${f}`)])))
})

self.addEventListener('activate', (event) => {
  const keep = new Set(Object.keys(ON_DEMAND).map(fileKey))
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('stratalab-shell-') && k !== SHELL_CACHE) await caches.delete(k)
      const files = await caches.open(FILES_CACHE)
      for (const req of await files.keys()) if (!keep.has(req.url)) await files.delete(req)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  // Range requests (a partial read) go to the network as they are.
  if (req.method !== 'GET' || url.origin !== self.location.origin || req.headers.has('range')) return
  if (req.mode === 'navigate') {
    // The page itself: network first so a new deploy is noticed, the cached shell when offline.
    event.respondWith(fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true, ignoreVary: true })))
    return
  }
  const base = new URL(scope()).pathname
  const path = url.pathname.startsWith(base) ? decodeURIComponent(url.pathname.slice(base.length)) : null
  if (path && path in ON_DEMAND) {
    event.respondWith(
      caches.open(FILES_CACHE).then(async (cache) => {
        const key = fileKey(path)
        const hit = await cache.match(key)
        if (hit) return hit
        const res = await fetch(req)
        // Only a full 200: a 204 from something that takes the download (a download manager) must not be kept.
        if (res.status === 200) event.waitUntil(cache.put(key, res.clone()))
        return res
      }),
    )
    return
  }
  // Hashed assets never change: cache first. ignoreVary: module scripts send Origin, and servers may answer Vary: Origin.
  event.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit ?? fetch(req)))
})
