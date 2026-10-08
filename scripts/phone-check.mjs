#!/usr/bin/env node
// ── phone-check — measure the phone preview screens at 375 px ────────────
//
//   npm run dev -- -p 3217                      (in another terminal)
//   node scripts/phone-check.mjs --base=http://localhost:3217
//   node scripts/phone-check.mjs --base=… day card-leg --shots=.shots/phone
//   node scripts/phone-check.mjs --base=… day shared --height=1600 --shots=…
//
// Opens every /dev/phone/<screen> (src/app/dev/phone — real components over
// fixtures, no account) in headless Chrome as a PHONE: 375×812, device scale
// 2, mobile viewport, touch, an Android user agent. Then it reports, per screen:
//
//   overflow  an element that runs past the viewport's left or right edge
//             (not inside a horizontal scroller or a clipping box that is
//             itself on screen — a carousel's off-screen slides are fine)
//   tap       a button / link / [role=button] whose hit area is under 44×44,
//             counting its descendants (the invisible `-inset` tap-target
//             spans) and cut to any ancestor that clips them
//   clipped   text cut off by its own box or an ancestor's, where nothing
//             says it was meant to be (truncate, text-overflow: ellipsis,
//             line-clamp)
//   expect    the words the screen exists to show, and words it must not
//   errors    uncaught exceptions in the page
//
// No npm packages: Chrome's DevTools protocol over Node's own fetch and
// WebSocket (Node 22+). Every host except localhost and Google Fonts resolves
// to nothing, so the preview cannot reach a real service even by mistake.
// --shots=<dir> also saves a full-page PNG per screen, taken after the checks.
// Use these, not `chrome --screenshot --window-size=375,…`: headless Chrome
// will not make a window narrower than ~500 px, so that PNG is a 375 px crop
// of a 492 px layout (measured 7 Oct 2026). Device-metrics emulation here is a
// true 375 px viewport.
// Exit code 1 when anything is reported.

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const BASE = flag("base", "http://localhost:3000").replace(/\/$/, "");
const SHOTS = flag("shots", null);
const SETTLE_MS = Number(flag("settle", "2500"));
const JSON_OUT = flag("json", null);
// Taller viewport for long screens (the day view scrolls inside itself, so a
// full-page capture alone does not show more). Width stays 375.
const HEIGHT = Number(flag("height", "812"));

// Same list as src/app/dev/phone/screens.ts.
const ALL = [
  "day", "day-welcome",
  "card-cost", "card-closed", "card-late", "card-fit", "card-leg",
  "add-leg", "add-leg-from",
  "time", "time-cleared",
  "bookings-open", "bookings-asking", "bookings-booked",
  "shared",
  "toasts", "toasts-second",
  "past-menu", "copy-sheet", "copy-sheet-dates",
];
const picked = args.filter((a) => !a.startsWith("--"));
const SCREENS = picked.length ? picked : ALL;

// What each screen is for. `has` must be in the page text (folded <details>
// count), `not` must not; `sel`/`noSel` are selectors that must / must not match.
const EXPECT = {
  day: { has: ["Lusaka → Mfuwe", "Overland truck · 13h", "Give these times", "Day 1 in Florence · have a great trip"] },
  "day-welcome": { has: ["Welcome home"] },
  "card-cost": { has: ["€29", "× 2 = €58"] },
  "card-closed": { has: ["Closed on Monday"] },
  "card-late": { has: ["Closes 11:00 PM — before you finish"] },
  "card-fit": { sel: ['[aria-label="Opening hours"]'], noSel: ['[aria-label="Opening hours clash"]'] },
  // The slim leg sheet (7 Oct 2026, mock t05): one "From … · change" line, the
  // caption, the pills folded behind "Change how you travel"; no To row.
  "card-leg": {
    has: ["Lusaka → Mfuwe", "From Lusaka · change", "Overland truck · 13h", "Change how you travel"],
    sel: ['[data-testid="travel-leg-panel"]', '[data-testid="leg-from-line"]'], noSel: ['[role="radio"]'],
  },
  // Adding a leg by hand: before From is set only From shows; after, the four
  // pills with none picked.
  "add-leg": { has: ["Mfuwe Bus Station", "Where you leave from"], sel: ['[data-testid="new-leg"]'], noSel: ['[role="radio"]'] },
  "add-leg-from": {
    has: ["Mfuwe Bus Station", "Eureka Camping Park", "Drive", "Ferry"],
    sel: ['[data-testid="new-leg"] [role="radio"]'], noSel: ['[role="radio"][aria-checked="true"]'],
  },
  time: { has: ["Clear time", "Done"] },
  "time-cleared": { has: ["Undo · 10:00 AM"] },
  "bookings-open": { has: ["Flights", "Stays", "Car", "Book 3 on Kayak"] },
  "bookings-asking": { has: ["Did you book it?", "What did it cost?"], sel: ['[data-testid="to-book-cost"]'] },
  "bookings-booked": { has: ["✓ Everything’s booked."] },
  shared: { has: ["Annual Tech Summit", "Check in from 3 pm"], not: ["73500000000042", "Irving Convention Center"] },
  toasts: { has: ["Sam joined Lisbon"], not: ["2 still to book"] },
  "toasts-second": { has: ["Lisbon tomorrow · 2 still to book"], not: ["Sam joined Lisbon"] },
  // Copy to new dates (7 Oct 2026, mock t07): the past row's ⋯, and the sheet.
  "past-menu": { has: ["Copy to new dates", "Archive", "Delete…"], sel: ['[role="menu"]'] },
  "copy-sheet": {
    has: ["Copy New York (Mia & Daddy)", "Last time you started on a Thursday", "4 days · Thu 22 Jul – Sun 25 Jul 2027", "Bring the 3 places saved on the map", "Copy trip"],
    sel: ['[role="switch"][aria-checked="true"]'],
  },
  "copy-sheet-dates": { has: ["July 2027", "4 days · Thu 22 Jul – Sun 25 Jul 2027"], sel: ['[data-testid="copy-calendar"]'] },
};

const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const CHROME = process.env.CHROME || [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => existsSync(p));
if (!CHROME) { console.error("No Chrome found; set CHROME=/path/to/chrome"); process.exit(2); }

// ── Runs in the page ──────────────────────────────────────────────────────
function measure() {
  const vw = document.documentElement.clientWidth;
  const out = { vw, docWidth: document.documentElement.scrollWidth, overflow: [], taps: [], clipped: [] };
  const style = (el) => getComputedStyle(el);
  const shown = (el) => {
    const s = style(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const say = (el) => {
    const id = el.getAttribute("data-testid") || el.getAttribute("aria-label") || "";
    const text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50);
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 4).join(".") : "";
    return `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}>${id ? ` [${id}]` : ""}${text ? ` "${text}"` : ""}`;
  };
  const clips = (s) => s.overflowX !== "visible" || s.overflowY !== "visible";
  const intentional = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = style(a);
      if (s.textOverflow === "ellipsis") return true;
      if (s.webkitLineClamp && s.webkitLineClamp !== "none") return true;
      if (typeof a.className === "string" && /\b(truncate|line-clamp-\d+)\b/.test(a.className)) return true;
    }
    return false;
  };
  const all = Array.from(document.body.querySelectorAll("*"));

  // Overflow: past the viewport's sides, outermost offender only.
  const reported = new Set();
  for (const el of all) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.left >= -1 && r.right <= vw + 1) continue;
    if (r.left >= vw || r.right <= 0) continue; // wholly off-screen (a closed drawer)
    let skip = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (reported.has(a)) { skip = true; break; }
      const s = style(a);
      if (s.overflowX === "auto" || s.overflowX === "scroll") { skip = true; break; }
      if ((s.overflowX === "hidden" || s.overflowX === "clip") && !a.classList.contains("mobile-container")) {
        const ar = a.getBoundingClientRect();
        if (ar.left >= -1 && ar.right <= vw + 1) { skip = true; break; }
      }
    }
    if (skip) continue;
    reported.add(el);
    out.overflow.push({ el: say(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
  }

  // Tap targets: own box ∪ descendants, cut by clipping ancestors.
  for (const el of document.querySelectorAll("button, a[href], [role=button]")) {
    if (!shown(el) || el.closest("[aria-hidden=true]")) continue;
    let { left, top, right, bottom } = el.getBoundingClientRect();
    for (const d of el.querySelectorAll("*")) {
      const s = style(d);
      if (s.display === "none" || s.visibility === "hidden") continue;
      const r = d.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      left = Math.min(left, r.left); top = Math.min(top, r.top); right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
    }
    // Only boxes that CUT (hidden / clip); a scroller brings its content into view.
    const cuts = (v) => v === "hidden" || v === "clip";
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = style(a);
      const r = a.getBoundingClientRect();
      if (cuts(s.overflowX)) { left = Math.max(left, r.left); right = Math.min(right, r.right); }
      if (cuts(s.overflowY)) { top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom); }
    }
    const w = Math.round(right - left), h = Math.round(bottom - top);
    if (w < 44 || h < 44) out.taps.push({ el: say(el), w, h, inline: style(el).display === "inline" || undefined });
  }

  // Clipped text.
  const hasText = (el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
  for (const el of all) {
    const field = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
    if (!(field ? el.value : hasText(el)) || !shown(el) || intentional(el)) continue;
    const s = style(el);
    if (s.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 1) {
      out.clipped.push({ el: say(el), how: `own box ${el.clientWidth}px, text ${el.scrollWidth}px` });
      continue;
    }
    if (!field && (s.overflowY === "hidden" || s.overflowY === "clip") && el.scrollHeight > el.clientHeight + 1) {
      out.clipped.push({ el: say(el), how: `own box ${el.clientHeight}px tall, text ${el.scrollHeight}px` });
      continue;
    }
    if (field) continue;
    // Cut by an ancestor: the text's own extent against each clipping box.
    const range = document.createRange();
    range.selectNodeContents(el);
    const t = range.getBoundingClientRect();
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = style(a);
      if (as.overflowX === "auto" || as.overflowX === "scroll" || as.overflowY === "auto" || as.overflowY === "scroll") break;
      if (!clips(as)) continue;
      const r = a.getBoundingClientRect();
      const cutX = as.overflowX !== "visible" && (t.right > r.right + 1 || t.left < r.left - 1);
      const cutY = as.overflowY !== "visible" && (t.bottom > r.bottom + 1 || t.top < r.top - 1);
      if (cutX || cutY) {
        out.clipped.push({ el: say(el), how: `cut by ancestor ${say(a).slice(0, 60)} (${cutX ? "sideways" : "top/bottom"})` });
        break;
      }
    }
  }
  return out;
}

function expectations(screen) {
  const e = EXPECT[screen];
  if (!e) return [];
  const text = document.body.textContent.replace(/\s+/g, " ");
  const miss = [];
  for (const s of e.has ?? []) if (!text.includes(s)) miss.push(`missing "${s}"`);
  for (const s of e.not ?? []) if (text.includes(s)) miss.push(`must not show "${s}"`);
  for (const s of e.sel ?? []) if (!document.querySelector(s)) miss.push(`no element ${s}`);
  for (const s of e.noSel ?? []) if (document.querySelector(s)) miss.push(`unexpected element ${s}`);
  return miss;
}

// ── The DevTools protocol, by hand ────────────────────────────────────────
function launch() {
  const dir = mkdtempSync(path.join(tmpdir(), "phone-check-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${dir}`, "--remote-debugging-port=0",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE fonts.googleapis.com, EXCLUDE fonts.gstatic.com",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("Chrome did not start")), 20000);
    chrome.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve({ chrome, ws: m[1], dir }); }
    });
    chrome.on("exit", (c) => reject(new Error(`Chrome exited (${c})`)));
  });
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else for (const l of listeners) l(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return new Promise((resolve) => { ws.onopen = () => resolve({ send, on: (f) => listeners.add(f), off: (f) => listeners.delete(f), close: () => ws.close() }); });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkScreen(cdp, screen) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  const errors = [];
  let loaded = false;
  const onEvent = (msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Page.loadEventFired") loaded = true;
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      errors.push((d.exception?.description || d.text || "exception").split("\n")[0].slice(0, 160));
    }
  };
  cdp.on(onEvent);
  await s("Page.enable");
  await s("Runtime.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: 375, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  await s("Emulation.setUserAgentOverride", { userAgent: UA, platform: "Android" });
  await s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await s("Page.navigate", { url: `${BASE}/dev/phone/${screen}` });
  for (let i = 0; i < 600 && !loaded; i++) await sleep(100);
  // The harness mounts after its chunk loads (slow on a cold dev server): wait for its marker.
  for (let i = 0; i < 1200; i++) {
    const r = await s("Runtime.evaluate", { expression: "!!document.querySelector('[data-phone-screen]')", returnByValue: true });
    if (r.result?.value) break;
    await sleep(100);
  }
  await sleep(SETTLE_MS);
  const evalFn = async (fn, arg) => {
    const r = await s("Runtime.evaluate", { expression: `(${fn})(${JSON.stringify(arg)})`, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const m = await evalFn(measure.toString());
  const expect = await evalFn(expectations.toString().replace(/EXPECT\[screen\]/, `(${JSON.stringify(EXPECT)})[screen]`), screen);
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    const shot = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(path.join(SHOTS, `${screen}.png`), Buffer.from(shot.data, "base64"));
  }
  cdp.off(onEvent);
  await cdp.send("Target.closeTarget", { targetId });
  return { screen, ...m, expect, errors };
}

const { chrome, ws, dir } = await launch();
let failed = false;
const results = [];
try {
  const cdp = await connect(ws);
  for (const screen of SCREENS) {
    const r = await checkScreen(cdp, screen);
    results.push(r);
    const problems = r.overflow.length + r.taps.length + r.clipped.length + r.expect.length + r.errors.length + (r.docWidth > r.vw ? 1 : 0);
    if (problems) failed = true;
    console.log(`\n${problems ? "FAIL" : "PASS"}  ${screen}   (viewport ${r.vw}, document ${r.docWidth})`);
    if (r.docWidth > r.vw) console.log(`  overflow  document is ${r.docWidth}px wide at ${r.vw}px`);
    for (const o of r.overflow) console.log(`  overflow  ${o.el}  left ${o.left} right ${o.right}`);
    for (const t of r.taps) console.log(`  tap       ${t.el}  ${t.w}×${t.h}${t.inline ? " (inline link)" : ""}`);
    for (const c of r.clipped) console.log(`  clipped   ${c.el}  ${c.how}`);
    for (const x of r.expect) console.log(`  expect    ${x}`);
    for (const e of r.errors) console.log(`  error     ${e}`);
  }
  cdp.close();
} finally {
  chrome.kill();
  await sleep(500);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Chrome may still hold a file */ }
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
