/**
 * Where a Find save lands (1 Oct 2026). Brennan: "if you click Saved you
 * can't really tell where it's saved on the map." Find no longer covers the
 * map (a panel beside it on a computer, a half sheet on the phone), and the
 * new pin pulses where it landed for two seconds. If the place is off the
 * part of the map you can see, the map glides to it first, centred in what
 * the sheet leaves uncovered. Mock: scratchpad find-side.png, approved.
 */

export interface Box { left: number; top: number; right: number; bottom: number }
export interface Cover { top: number; right: number; bottom: number; left: number }

const NONE: Cover = { top: 0, right: 0, bottom: 0, left: 0 };

/** How much of the map a panel hides: a sheet across the bottom, or a panel down one side. */
export function coverFrom(map: Box, panel: Box | null): Cover {
  if (!panel) return NONE;
  const across = Math.min(map.right, panel.right) - Math.max(map.left, panel.left);
  const down = Math.min(map.bottom, panel.bottom) - Math.max(map.top, panel.top);
  if (across <= 0 || down <= 0) return NONE; // beside the map, not over it
  if (across >= (map.right - map.left) * 0.9) return { ...NONE, bottom: map.bottom - Math.max(panel.top, map.top) };
  const fromLeft = panel.left - map.left, fromRight = map.right - panel.right;
  return fromLeft <= fromRight
    ? { ...NONE, left: Math.min(panel.right, map.right) - map.left }
    : { ...NONE, right: map.right - Math.max(panel.left, map.left) };
}

/** Whether a point on the map (container pixels) is in the part you can see, with a margin. */
export function inView(pt: { x: number; y: number }, width: number, height: number, cover: Cover, margin = 32): boolean {
  return pt.x >= cover.left + margin && pt.x <= width - cover.right - margin
    && pt.y >= cover.top + margin && pt.y <= height - cover.bottom - margin;
}

/** Mapbox's easeTo offset that centres a point in the uncovered part (not `padding`, which sticks). */
export function centreOffset(cover: Cover): [number, number] {
  return [(cover.left - cover.right) / 2, (cover.top - cover.bottom) / 2];
}

export const PULSE_MS = 2000;

/**
 * Town level (1 Oct 2026, Brennan: "like a trip like Europe it's way too
 * zoomed out"). Zoomed out past a region, a place Find shows is zoomed in
 * to about a town; closer than that, your zoom is kept.
 */
export const TOWN_ZOOM = 11;
export function focusZoom(zoom: number): number {
  return zoom < TOWN_ZOOM - 1 ? TOWN_ZOOM : zoom;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Bring a place into the part of the map you can see. `always`: centre it
 * there (a place opened in Find); otherwise move only if it is hidden or the
 * map is zoomed far out (a save, whose place is usually on screen already).
 */
function glideTo(map: any, lng: number, lat: number, panel: Element | null, always = false): void {
  const r = map.getContainer().getBoundingClientRect();
  const cover = coverFrom(r, panel?.getBoundingClientRect() ?? null);
  const zoom = map.getZoom(), to = focusZoom(zoom);
  if (always || to !== zoom || !inView(map.project([lng, lat]), r.width, r.height, cover)) {
    map.easeTo({ center: [lng, lat], zoom: to, offset: centreOffset(cover), duration: 700 });
  }
}

/**
 * The place you are reading about in Find: a purple pin (a searched place's,
 * lookupPlace's TEMP_PIN_SVG) with its name beside it, as in the mock, so it
 * is not lost among the food pins, which are purple too. The map centres on
 * it. Returns it, to remove on Back, another place, Save, or closing Find.
 */
export function showAt(mb: any, map: any, lng: number, lat: number, panel: Element | null, name?: string): { remove: () => void } | null {
  if (!mb || !map) return null;
  glideTo(map, lng, lat, panel, true);
  const el = document.createElement("div");
  el.dataset.preview = "1";
  el.style.cssText = "width:28px;height:28px;position:relative;pointer-events:none;";
  el.innerHTML = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="12" fill="#7C3AED" stroke="#fff" stroke-width="2"/><circle cx="14" cy="14" r="4" fill="white"/></svg>`;
  if (name) {
    const tag = document.createElement("span");
    tag.textContent = name;
    tag.style.cssText = "position:absolute;left:34px;top:3px;background:#1A1A2E;color:#fff;font:600 12px/1 'DM Sans',sans-serif;padding:5px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25);";
    el.appendChild(tag);
  }
  return new mb.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
}

/** Bring the place into view (as showAt), then ring it for two seconds. `panel` is the Find sheet. */
export function pulseAt(mb: any, map: any, lng: number, lat: number, panel: Element | null): void {
  if (!mb || !map) return;
  glideTo(map, lng, lat, panel);
  const el = document.createElement("div");
  el.dataset.pulse = "1";
  el.style.cssText = "width:60px;height:60px;position:relative;pointer-events:none;";
  for (const delay of [0, 500]) {
    const ring = document.createElement("div");
    ring.style.cssText = "position:absolute;inset:0;border-radius:50%;border:3px solid #7C3AED;opacity:0;";
    ring.animate?.([{ transform: "scale(0.3)", opacity: 0.85 }, { transform: "scale(1.25)", opacity: 0 }], { duration: 1000, delay, iterations: 2, easing: "ease-out" });
    el.appendChild(ring);
  }
  const marker = new mb.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
  window.setTimeout(() => marker.remove(), PULSE_MS + 500);
}
