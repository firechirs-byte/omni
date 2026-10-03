/* Omni service worker: keeps a copy of every file so the app opens offline,
   and lets the app know when a new version has been downloaded.

   Releasing a new version? Change CACHE below (and APP_VERSION in app.js).
   Browsers spot that sw.js changed, download everything again, and Omni
   shows the "Update available" banner. */
const CACHE = 'omni-v4.0.0';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg',
  'config.js', 'sounds.js', 'filter-words.js', 'filter.js', 'emoji.js', 'icons.js', 'app.js', 'media.js',
  'extras.js', 'safety.js', 'browser.js', 'supabase.js', 'assistant.js',
  'fonts/fonts.css', 'fonts/inter.woff2', 'fonts/space-grotesk.woff2', 'fonts/nunito.woff2', 'fonts/jetbrains-mono.woff2',
  'fonts/lexend.woff2', 'fonts/atkinson-hyperlegible-400.woff2', 'fonts/atkinson-hyperlegible-700.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'gifs/thumbs-up.gif', 'gifs/laughing.gif', 'gifs/wave.gif', 'gifs/party.gif',
  'gifs/gg.gif', 'gifs/ok.gif', 'gifs/heart.gif', 'gifs/lol.gif'
];

// 1. Install: download fresh copies of all the files (cache: 'reload' skips the browser's own cache)
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
  // No skipWaiting() here: a new version waits until you press "Update now".
  // (The very first install doesn't need to wait, so it starts straight away.)
});

// 2. "Update now" was pressed: take over from the old version
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// 3. Activate: delete caches from older versions
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 4. Fetch: use the saved copy for this version if we have it (fast + offline),
//    otherwise ask the network and save what comes back.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (req.mode === 'navigate' && await cache.match('index.html')) || Response.error();
    }
  }));
});
