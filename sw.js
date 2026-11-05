/**
 * Spotify Swipe PWA Service Worker — v2.0.1
 * Network-First strategy ensures the app always loads the latest code
 * from GitHub Pages, falling back to cache if offline.
 */

const CACHE_NAME = 'spotify-swipe-v2.0.1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './theme.js',
  './audio.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn('[SW] Cache addAll warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Never intercept external APIs (Spotify, Apple, Deezer, etc.)
  if (
    event.request.url.includes('spotify.com') ||
    event.request.url.includes('scdn.co') ||
    event.request.url.includes('itunes.apple.com') ||
    event.request.url.includes('deezer.com') ||
    event.request.url.includes('api.fin21.uk')
  ) {
    return;
  }

  // Network-First for same-origin app files: always get the freshest version from GitHub!
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache only when offline
        return caches.match(event.request);
      })
  );
});
