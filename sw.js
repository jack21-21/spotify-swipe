/**
 * Spotify Swipe PWA Service Worker
 * Caches static shell and assets for offline and instant app launching.
 */

const CACHE_NAME = 'spotify-swipe-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './theme.js',
  './audio.js',
  './visualizer.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass through Spotify API and accounts requests directly to network
  if (event.request.url.includes('spotify.com') || event.request.url.includes('scdn.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => cached);
    })
  );
});
