import { pileRing } from "./pinLayout";

/**
 * The one pile pin, drawn the same on the day strip and the day page's map
 * (8 Oct 2026): a white disc with the label, ringed in the legend colours of
 * what it holds. The day's own pile is a size up with a white halo, so it
 * never reads as just another crowd of saved places.
 */
export function makePileElement(opts: {
  label: string;
  counts: Record<string, number>;
  colours: Record<string, string>;
  day: boolean;
  ariaLabel: string;
  muted?: number;
}): HTMLDivElement {
  const size = opts.day ? 48 : 44; // 44 to the finger
  const el = document.createElement("div");
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", opts.ariaLabel);
  el.dataset.pile = opts.day ? "day" : "saved";
  el.style.cssText =
    `min-width:${size}px;height:${size}px;padding:0 6px;box-sizing:border-box;border-radius:${size / 2}px;cursor:pointer;` +
    "display:flex;align-items:center;justify-content:center;" +
    `background:${pileRing(opts.counts, opts.colours)};` +
    `box-shadow:${opts.day ? "0 0 0 3px #fff, " : ""}0 2px 6px rgba(0,0,0,0.3);z-index:${opts.day ? 4 : 2};` +
    (opts.muted != null && opts.muted < 1 ? `opacity:${opts.muted};` : "");
  const disc = document.createElement("span");
  disc.style.cssText =
    `min-width:${size - 12}px;height:${size - 12}px;padding:0 7px;box-sizing:border-box;border-radius:${(size - 12) / 2}px;background:#fff;` +
    "display:flex;align-items:center;justify-content:center;" +
    "font-family:'DM Sans',Inter,system-ui,sans-serif;font-size:13px;font-weight:700;color:#1A1A2E;white-space:nowrap;";
  disc.textContent = opts.label;
  el.appendChild(disc);
  return el;
}
