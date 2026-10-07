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
//   - Every day of an upcoming journey (7 Oct 2026): the Day view posts
//     "roam:save-days" with each day's URL (lib/offline/saveDays, at most once
//     per 12 h per journey); this worker fetches them two at a time into the
//     page cache under their plain URLs, so airplane mode opens any day. Same
//     rule as every page: only a clean 200, never a redirect or opaque reply.
//     Photos are left out. Offline, /trips/{id} (it redirects online, so it is
//     never cached) answers with a redirect to today's saved day.
//
// Bump VERSION to invalidate every cache on the next deploy.
const VERSION = "roam-sw-v3";
const PAGE_CACHE = `${VERSION}-pages`;
const STATIC_CACHE = `${VERSION}-static`;
const PHOTO_CACHE = `${VERSION}-photos`;
const KNOWN = [PAGE_CACHE, STATIC_CACHE, PHOTO_CACHE];
const LAUNCH_WAIT_MS = 1200;

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
      url.pathname.startsWith("/icons/"))
  );
}

function isPlacePhoto(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/api/places/photo");
}

// ── Saving a journey's days (7 Oct 2026) ─────────────────────────────────
const DAY_PATH = /^\/trips\/[^/?#]+\/days\/[^/?#]+$/;
const TRIP_PATH = /^\/trips\/([^/?#]+)\/?$/;
const saving = new Set();

// The journey's day list, kept in the page cache under a key no page uses.
function tripDaysKey(tripId) {
  return `${self.location.origin}/__roam/trip-days/${encodeURIComponent(tripId)}`;
}

function cleanPage(res) {
  return !!res && res.ok && res.status === 200 && !res.redirected && res.type !== "opaque" && res.type !== "opaqueredirect";
}

async function saveOne(cache, path) {
  try {
    const url = new URL(path, self.location.origin);
    if (url.origin !== self.location.origin || !DAY_PATH.test(url.pathname)) return;
    const res = await fetch(url.href, { credentials: "same-origin", headers: { Accept: "text/html" } });
    if (cleanPage(res)) await cache.put(url.href, res);
  } catch (e) {
    // Network gone mid-way: what was saved stays saved.
  }
}

async function saveDays(data) {
  const tripId = typeof data.tripId === "string" ? data.tripId : "";
  const days = Array.isArray(data.days)
    ? data.days.filter((d) => d && typeof d.url === "string" && typeof d.date === "string" && DAY_PATH.test(d.url))
    : [];
  if (!tripId || !days.length || saving.has(tripId)) return;
  saving.add(tripId);
  try {
    const cache = await caches.open(PAGE_CACHE);
    await cache.put(tripDaysKey(tripId), new Response(JSON.stringify(days), { headers: { "Content-Type": "application/json" } }));
    // Two at a time: quick enough, and never a burst at the server.
    let next = 0;
    const lane = async () => {
      while (next < days.length) {
        const d = days[next++];
        await saveOne(cache, d.url);
      }
    };
    await Promise.all([lane(), lane()]);
  } finally {
    saving.delete(tripId);
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "roam:save-days") return;
  const work = saveDays(data).catch(() => undefined);
  if (event.waitUntil) event.waitUntil(work);
});

function localDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// lib/resolveDefaultDay's rule: today's day, clamped (before → first, after → first).
function pickDay(days, today) {
  const sorted = days.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const first = sorted[0], last = sorted[sorted.length - 1];
  if (today <= first.date || today > last.date) return first;
  let match = first;
  for (const d of sorted) { if (d.date <= today) match = d; else break; }
  return match;
}

// Offline /trips/{id}: a redirect to today's saved day, or null.
async function savedTripHome(url) {
  const m = TRIP_PATH.exec(url.pathname);
  if (!m) return null;
  const list = await caches.match(tripDaysKey(decodeURIComponent(m[1])));
  if (!list) return null;
  const days = await list.json().catch(() => []);
  if (!Array.isArray(days) || !days.length) return null;
  const pick = pickDay(days, localDay(new Date()));
  const target = new URL(pick.url, self.location.origin).href;
  if (await caches.match(target)) return Response.redirect(target, 302);
  // Today's page missing: any saved day beats the offline page.
  for (const d of days) {
    const href = new URL(d.url, self.location.origin).href;
    if (await caches.match(href)) return Response.redirect(href, 302);
  }
  return null;
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

  // Opening the app (3 Oct 2026, launch speed): the splash waited on a cold
  // server for Journeys. For that one page, if the network hasn't answered in
  // LAUNCH_WAIT_MS and a copy is cached, show the copy; the network answer
  // still lands in the cache for next time. Every other page stays network-first.
  if (request.mode === "navigate" && url.pathname === "/trips") {
    const network = fetch(request).then((res) => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
      }
      return res;
    });
    event.respondWith(
      new Promise((resolve) => {
        let done = false;
        const settle = (r) => { if (!done && r) { done = true; resolve(r); } };
        network.then(settle).catch(async () => {
          const hit = await caches.match(request);
          settle(hit || (await caches.match("/offline.html")) || Response.error());
        });
        setTimeout(async () => { const hit = await caches.match(request); if (hit) settle(hit); }, LAUNCH_WAIT_MS);
      })
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
            const home = await savedTripHome(url).catch(() => null);
            if (home) return home;
            const offline = await caches.match("/offline.html");
            if (offline) return offline;
          }
          return Response.error();
        })
    );
  }
});
