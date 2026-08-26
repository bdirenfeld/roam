// Roam service worker — offline for the days you've already opened.
//
// Strategy (deliberately conservative — a wrong service worker is the one
// thing that can wedge a deployed site):
//   - Pages & RSC payloads: NETWORK-FIRST. Online behaviour is unchanged;
//     every successful response is copied into the page cache, and the cache
//     only answers when the network is unreachable.
//   - Immutable build assets (/_next/static), icons, fonts: cache-first.
//   - Place photos (/api/places/photo*): stale-while-revalidate.
//   - Mapbox tiles: never touched (cross-origin, storage-heavy). The map area
//     renders empty offline; the agenda list is the on-the-ground surface.
//   - Everything else (POSTs, Supabase, auth): never touched.
//
// Bump VERSION to invalidate every cache on the next deploy.
const VERSION = "roam-sw-v1";
const PAGE_CACHE = `${VERSION}-pages`;
const STATIC_CACHE = `${VERSION}-static`;
const PHOTO_CACHE = `${VERSION}-photos`;
const KNOWN = [PAGE_CACHE, STATIC_CACHE, PHOTO_CACHE];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.add("/offline.html")).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KNOWN.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isImmutableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/manifest.json")
  );
}

function isPlacePhoto(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/api/places/photo");
}

function isPageLike(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (request.mode === "navigate") return true;
  // App-router client navigations fetch RSC payloads for the same URLs
  return request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept auth or non-photo APIs
  if (url.pathname.startsWith("/auth") || (url.pathname.startsWith("/api/") && !isPlacePhoto(url))) {
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  if (isPlacePhoto(url)) {
    event.respondWith(
      caches.open(PHOTO_CACHE).then((cache) =>
        cache.match(request).then((hit) => {
          const refresh = fetch(request)
            .then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || refresh;
        })
      )
    );
    return;
  }

  if (isPageLike(request, url)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Cache only clean, non-redirect page responses (redirects are
          // auth bounces — caching one would trap the user on login offline)
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(request);
          if (hit) return hit;
          if (request.mode === "navigate") {
            const offline = await caches.match("/offline.html");
            if (offline) return offline;
          }
          return Response.error();
        })
    );
  }
});
