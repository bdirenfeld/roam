#!/usr/bin/env node
// ── shot — look at Roam at phone width without a phone ────────────────────
//
// Why this exists: every layout revert in this repo has the same shape. A
// change is reasoned about from source, pushed, and found broken by Brennan on
// his phone — three "fixes" for one scrolling issue on 29 Aug (two of which
// rendered ghosted rows), the map rings on 5 Sept, the day-map framing on
// 7 Sept, the filter sheet on 10 Sept. CLAUDE.md's own note says it plainly:
// "Reasoning about `sticky`, `overflow`, and scroll containers from source is
// not verification."
//
// So: a real Chromium at 390×844, with touch, at the app's own origin.
//
//   npm run shot -- /trips/<id>/days/<dayId>
//   npm run shot -- /trips/<id>/plan --wide
//   npm run shot -- https://roam.example/journey/<token>     (no session needed)
//
// ── The session ───────────────────────────────────────────────────────────
// Most of the app is behind Google sign-in, and a script cannot do an OAuth
// dance. It does not have to: sign in ONCE in a real browser and keep the
// cookies.
//
//   npm run shot:login
//
// opens a headed Chromium, waits for you to sign in, and writes the storage
// state to .auth/roam.json (git-ignored). Every later `npm run shot` reuses
// it until it expires. Set ROAM_SHOT_STATE to keep it somewhere else.
//
// A remote container has no browser to sign in with and no state file. That is
// not a failure of this script — pages with no session still work everywhere
// (the shared itinerary, /privacy, /terms, /guide.html), and those are the
// ones with no other way to be seen at all. For the signed-in app, run this on
// the machine you are signed in on.
//
// ── Playwright is deliberately NOT in package.json ────────────────────────
// Adding it would make `npm ci` in the checks workflow pull a browser on every
// run, and that workflow's whole value is that it finishes in under two
// minutes with no secrets. It is a local tool, so it is a local install:
//   npm i -D playwright && npx playwright install chromium
// Claude Code's own containers already ship one globally, which this finds.

import { existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Local install first, then a global one (Claude Code containers have it). */
/** A global install is CommonJS, so `import()` hands it back under `default`. */
function interop(mod) {
  return mod && mod.chromium ? mod : mod.default;
}

async function loadPlaywright() {
  try {
    return interop(await import("playwright"));
  } catch {}
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    const entry = path.join(globalRoot, "playwright", "index.js");
    if (existsSync(entry)) return interop(await import(pathToFileURL(entry).href));
  } catch {}
  console.error(
    [
      "Playwright is not installed.",
      "",
      "  npm i -D playwright && npx playwright install chromium",
      "",
      "It is kept out of package.json on purpose — see the note at the top of",
      "scripts/shot.mjs. Installing it locally is the intended path.",
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    target: null,
    width: 390,      // iPhone 14/15 logical width — the narrowest real case
    height: 844,
    dpr: 2,
    wide: false,
    full: false,
    wait: null,
    settle: 600,
    out: null,
    base: process.env.ROAM_SHOT_BASE || "http://localhost:3000",
    state: process.env.ROAM_SHOT_STATE || path.join(ROOT, ".auth", "roam.json"),
  };
  for (const arg of argv) {
    if (arg === "--wide") { opts.wide = true; continue; }
    if (arg === "--full") { opts.full = true; continue; }
    const m = /^--([a-z]+)=(.*)$/.exec(arg);
    if (m) {
      const [, key, value] = m;
      if (key in opts) opts[key] = /^\d+$/.test(value) ? Number(value) : value;
      continue;
    }
    if (!arg.startsWith("-")) opts.target = arg;
  }
  // `--wide` is the desktop check, not a second script: the two widths are the
  // same question asked twice, and the bugs live in the gap between them.
  if (opts.wide) { opts.width = 1280; opts.height = 900; opts.dpr = 1; }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.target) {
    console.error("usage: npm run shot -- <path|url> [--wide] [--full] [--width=390] [--wait=<selector>]");
    process.exit(1);
  }

  const url = /^https?:\/\//.test(opts.target)
    ? opts.target
    : opts.base.replace(/\/$/, "") + (opts.target.startsWith("/") ? opts.target : "/" + opts.target);

  const { chromium } = await loadPlaywright();

  const hasState = existsSync(opts.state);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: opts.dpr,
    // Touch matters: `@media (hover: none)`, the sheet drag handlers and every
    // press-and-hold path read differently without it. A desktop-shaped
    // viewport with a mouse is not the phone, it is a narrow desktop.
    isMobile: !opts.wide,
    hasTouch: !opts.wide,
    storageState: hasState ? opts.state : undefined,
  });

  const page = await context.newPage();
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push("console: " + msg.text().slice(0, 200));
  });
  page.on("pageerror", (err) => problems.push("pageerror: " + String(err).slice(0, 200)));

  // The display fonts come from fonts.googleapis.com. A sandbox that blocks
  // outbound requests (Claude Code's own containers do) renders the whole app
  // in fallback faces and throws a hydration error on the way — noise that
  // looks exactly like a real fault. Name it rather than let it be diagnosed
  // twice.
  let fontsBlocked = false;
  page.on("requestfailed", (req) => {
    if (req.url().indexOf("fonts.googleapis.com") !== -1) fontsBlocked = true;
  });

  let response;
  try {
    response = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  } catch (err) {
    console.error("Could not load " + url + "\n  " + String(err).split("\n")[0]);
    if (!hasState) console.error("\nNo saved session at " + opts.state + " — run `npm run shot:login` first.");
    await browser.close();
    process.exit(1);
  }

  if (opts.wait) await page.waitForSelector(opts.wait, { timeout: 15000 });
  // Web fonts change every line box. A shot taken before Playfair lands is a
  // picture of a different layout.
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(opts.settle);

  const outDir = path.join(ROOT, ".shots");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const slug = (opts.target.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-") || "page")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const file = opts.out || path.join(outDir, slug + "-" + opts.width + ".png");
  await page.screenshot({ path: file, fullPage: opts.full });

  // The three numbers that catch the bugs this repo actually ships. A
  // horizontal scrollbar on a phone is always a bug; a document far taller
  // than its content is the escaped-Mapbox-marker signature from bc5f376.
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    signedIn: !document.location.pathname.startsWith("/login"),
  }));

  console.log(file);
  console.log(`  ${metrics.innerWidth}px viewport · document ${metrics.scrollWidth}×${metrics.scrollHeight} · HTTP ${response ? response.status() : "?"}`);
  if (metrics.scrollWidth > metrics.innerWidth + 1) {
    console.log(`  ⚠ scrolls sideways by ${metrics.scrollWidth - metrics.innerWidth}px — always a bug at this width`);
  }
  if (!hasState && !/^https?:/.test(opts.target)) {
    console.log(`  ⚠ no saved session (${path.relative(ROOT, opts.state)}) — a signed-in page will have bounced to /login`);
  }
  if (fontsBlocked) {
    console.log("  ⚠ fonts.googleapis.com was blocked — this is a FALLBACK-FONT render.");
    console.log("    Type sizes and line breaks are not the real ones, and the hydration");
    console.log("    errors below come from that, not from the page. Judge layout only.");
  } else {
    for (const p of problems.slice(0, 5)) console.log("  ⚠ " + p);
  }

  await browser.close();
}

main();
