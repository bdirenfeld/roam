import type { CardType } from "@/types/database";

export const PIN_COLORS: Record<CardType, string> = {
  logistics: "#64748B",
  activity:  "#0D9488",
  food:      "#F59E0B",
};

// Each icon is a function returning SVG child elements in a 24×24 coordinate space.
const ICONS: Record<string, (c: string) => string> = {
  // Logistics
  hotel: (c) =>
    `<path d="M3 21V10L12 4l9 6v11M9 21v-6h6v6" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  flight_arrival: (c) =>
    `<path d="M21 17H3M19 9l-7 4.5-3-1-4-1-1 2.5 4 1 7 4.5 3.5-.5L23 12" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
  flight_departure: (c) =>
    `<path d="M21 17H3M5 9l7 4.5 3-1 4-1 1 2.5-4 1-7 4.5-3.5-.5L1 12" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
  transportation: (c) =>
    `<rect x="3" y="9" width="18" height="9" rx="1.5" stroke="${c}" stroke-width="1.8" fill="none"/><circle cx="7.5" cy="18" r="2" fill="${c}"/><circle cx="16.5" cy="18" r="2" fill="${c}"/><path d="M3 13h18M7 9V6h10v3" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
  transfer: (c) =>
    `<rect x="3" y="9" width="18" height="9" rx="1.5" stroke="${c}" stroke-width="1.8" fill="none"/><circle cx="7.5" cy="18" r="2" fill="${c}"/><circle cx="16.5" cy="18" r="2" fill="${c}"/><path d="M3 13h18" stroke="${c}" stroke-width="1.8" fill="none"/>`,
  // Activity
  hosted: (c) =>
    `<path d="M7 21v-9l5-4 5 4v9M1 21h22M10 21v-4h4v4" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  self_directed: (c) =>
    `<circle cx="12" cy="5" r="2.5" fill="${c}"/><path d="M12 8.5V14m0-5.5l-3 4.5m3-4.5l3 4.5M9.5 19l2.5-5 2.5 5" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  wellness: (c) =>
    `<path d="M12 22C12 22 3 17 3 10a9 9 0 0118 0c0 7-9 12-9 12z" stroke="${c}" stroke-width="1.8" fill="none"/><path d="M9 10a3 3 0 006 0" stroke="${c}" stroke-width="1.4" fill="none"/>`,
  event: (c) =>
    `<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" fill="${c}"/>`,
  challenge: (c) =>
    `<path d="M14 2L5 15h7l-2 7 10-13h-7z" fill="${c}"/>`,
  // Food
  restaurant: (c) =>
    `<path d="M17 3v18M11 3v5a4 4 0 01-8 0V3m4 0v5" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
  coffee_dessert: (c) =>
    `<path d="M6 8h12l-2 10H8L6 8zm12 0h2a2 2 0 000-4h-2" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  street_food: (c) =>
    `<path d="M5 7h14M9 7L10 4h4l1 3M7 7l2 13h6l2-13" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  drinks: (c) =>
    `<path d="M5 3l2 8h10l2-8H5zm6 8v9m-3 2h6" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  cook_at_home: (c) =>
    `<path d="M3 21V10L12 4l9 6v11M9 21v-5h6v5" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
};

function getIcon(subType: string | null | undefined, color: string): string {
  if (subType && ICONS[subType]) return ICONS[subType](color);
  return `<circle cx="12" cy="12" r="4" fill="${color}"/>`;
}

/**
 * Returns an SVG string for a teardrop map pin.
 * viewBox: 28×38. Circle at (14,14) r=12. Tip at (14,38).
 * label: number/text shown instead of the sub-type icon (used in day view).
 */
export function makePinSVG(
  type: CardType,
  subType: string | null | undefined,
  status: string,
  label?: string,
): string {
  const baseColor = PIN_COLORS[type];
  const outlined = status === "interested";
  const iconColor = outlined ? baseColor : "white";
  const fill      = outlined ? "none" : baseColor;
  const stroke    = outlined ? baseColor : "rgba(255,255,255,0.9)";

  const pinPath = "M14 38C14 38 2 28 2 14A12 12 0 0 1 26 14C26 28 14 38 14 38Z";

  let inner: string;
  if (label !== undefined) {
    inner = `<text x="14" y="15" text-anchor="middle" dominant-baseline="middle"
      font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="700"
      fill="${iconColor}">${label}</text>`;
  } else {
    // Scale 24×24 icon into pin circle: usable area (6,6)→(22,22), scale 16/24 ≈ 0.667
    inner = `<g transform="translate(6,6) scale(0.667)">${getIcon(subType, iconColor)}</g>`;
  }

  return `<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="${pinPath}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
    inner +
    `</svg>`;
}

export interface PinElements {
  /** Passed to Mapbox Marker({ element }). Mapbox applies translate here — never set transform on this. */
  wrapper: HTMLDivElement;
  /** Visual layer — apply hover/scale transforms here instead. */
  inner: HTMLDivElement;
}

/**
 * Creates a DOM element pair for use as a Mapbox custom marker.
 * The wrapper/inner split prevents Mapbox's positioning transform from
 * being overwritten by hover scale effects (the "fly to top-left" bug).
 */
export function makePinElement(
  type: CardType,
  subType: string | null | undefined,
  status: string,
  opts?: { label?: string; onClick?: (e: MouseEvent) => void },
): PinElements {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "width:28px;height:38px;";

  const inner = document.createElement("div");
  inner.style.cssText =
    "width:28px;height:38px;" +
    "transition:transform 150ms ease,filter 150ms ease;" +
    "transform-origin:50% 100%;";
  inner.innerHTML = makePinSVG(type, subType, status, opts?.label);

  inner.addEventListener("mouseenter", () => {
    inner.style.transform = "scale(1.2)";
    inner.style.filter    = "drop-shadow(0 4px 8px rgba(0,0,0,0.25))";
  });
  inner.addEventListener("mouseleave", () => {
    inner.style.transform = "";
    inner.style.filter    = "";
  });

  if (opts?.onClick) {
    inner.addEventListener("click", (e) => { e.stopPropagation(); opts.onClick!(e); });
  }

  wrapper.appendChild(inner);
  return { wrapper, inner };
}
