/* 서비스 워커. 한 번 다녀가면 인터넷이 끊겨도 그대로 켜진다.
   파일을 고쳤다면 VERSION 을 올려야 새 파일이 내려간다. */

const VERSION = 'aetherfall-v1';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/game.css',
  './js/main.js',
  './js/core/util.js',
  './js/core/settings.js',
  './js/core/input.js',
  './js/core/audio.js',
  './js/core/bench.js',
  './js/render/camera.js',
  './js/render/fx.js',
  './js/render/draw.js',
  './js/game/classes.js',
  './js/game/skills.js',
  './js/game/entities.js',
  './js/game/enemies.js',
  './js/game/dungeon.js',
  './js/game/items.js',
  './js/game/progress.js',
  './js/game/game.js',
  './js/ui/ui.js',
  './js/ui/hud.js',
  './js/ui/screens.js',
  './js/net/cloud.js',
  './js/pwa/install.js',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    /* 하나가 실패해도 나머지는 담는다. */
    await Promise.all(CORE.map((url) => cache.add(url).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  /* 로그인·기록 요청은 절대 가로채지 않는다. */
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match('./index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.ok) {
        caches.open(VERSION).then((cache) => cache.put(req, res.clone()));
      }
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
