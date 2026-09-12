#!/usr/bin/env node
// ── import-places — the enrichment call, without the console paste ────────
//
// `/api/places/bulk-import` is how a place gets its photo, its pin, its hours
// and its rating; everything else — cards, days, the map — hangs off a row it
// enriched. It authenticates with the cookie-based SSR client, so the
// trip-import skill's standing instruction is to have Brennan paste a `fetch`
// into his browser console. That step is where the pipeline stops: on 3 Sept a
// Palm Springs import got as far as "42 places need enrichment via app
// endpoint; awaiting user console paste" and never finished. It was not
// blocked on a decision. It was blocked on a person being at a desktop with
// the right tab open.
//
// The fix is not a new key. It is the session that already exists:
// `npm run shot:login` saves one to .auth/roam.json, and a page opened with it
// can make the same authenticated fetch the console would have made — from the
// app's own origin, with the app's own cookies, subject to the same RLS, the
// same quota and the same 401 when it expires.
//
//   npm run shot:login                                  # once, when it expires
//   npm run import:places -- ChIJaaa ChIJbbb
//   npm run import:places -- --file=ids.txt
//   npm run import:places -- --file=ids.txt --type=activity --subtype=guided
//
// The file may be one id per line, or JSON — an array of strings, or an array
// of objects carrying `google_place_id` (what a resolution step tends to hand
// over). Blank lines and `#` comments are ignored.
//
// Nothing here widens what the app can do. There is no service key, no shared
// secret and no change to any route: this is the browser's own request, made
// by something that does not get bored at place 30 of 42.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");

/** A global install is CommonJS, so `import()` hands it back under `default`. */
function interop(mod) {
  return mod && mod.chromium ? mod : mod.default;
}

async function loadPlaywright() {
  try { return interop(await import("playwright")); } catch {}
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    const entry = path.join(globalRoot, "playwright", "index.js");
    if (existsSync(entry)) return interop(await import(pathToFileURL(entry).href));
  } catch {}
  console.error("Playwright is not installed:\n  npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}

/** One id per line, or JSON: `["ChIJ…"]` or `[{ google_place_id: "ChIJ…" }]`. */
export function parseIds(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    return parsed
      .map((entry) => (typeof entry === "string" ? entry : entry && entry.google_place_id))
      .filter((id) => typeof id === "string" && id.length > 0);
  }
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.charAt(0) !== "#");
}

/** The route's hard cap is 50 per call, and it works through them serially. */
export function batch(ids, size = 50) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

function parseArgs(argv) {
  const opts = {
    ids: [],
    file: null,
    type: null,
    subtype: null,
    base: process.env.ROAM_SHOT_BASE || "http://localhost:3000",
    state: process.env.ROAM_SHOT_STATE || path.join(ROOT, ".auth", "roam.json"),
    out: null,
  };
  for (const arg of argv) {
    const m = /^--([a-z]+)=(.*)$/.exec(arg);
    if (m) {
      if (m[1] in opts) opts[m[1]] = m[2];
      continue;
    }
    if (!arg.startsWith("-")) opts.ids.push(arg);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let ids = opts.ids;
  if (opts.file) {
    const file = path.isAbsolute(opts.file) ? opts.file : path.join(ROOT, opts.file);
    if (!existsSync(file)) {
      console.error("No such file: " + file);
      process.exit(1);
    }
    ids = ids.concat(parseIds(readFileSync(file, "utf8")));
  }

  // Duplicates cost a Google lookup each and land on the same row.
  const seen = Object.create(null);
  const unique = [];
  for (const id of ids) {
    if (!seen[id]) { seen[id] = true; unique.push(id); }
  }

  if (unique.length === 0) {
    console.error("usage: npm run import:places -- <google_place_id…> | --file=ids.txt [--type=… --subtype=…]");
    process.exit(1);
  }
  if ((opts.type && !opts.subtype) || (opts.subtype && !opts.type)) {
    console.error("--type and --subtype go together: the route requires both keys or neither.");
    process.exit(1);
  }

  if (!existsSync(opts.state)) {
    console.error(
      "No saved session at " + path.relative(ROOT, opts.state) + ".\n" +
      "Run `npm run shot:login` first — this uses the browser session, not a key.",
    );
    process.exit(1);
  }

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: opts.state });
  const page = await context.newPage();

  // Land on the app's own origin so the fetch below is same-origin and carries
  // the session cookies — the whole point of doing this in a page at all.
  await page.goto(opts.base.replace(/\/$/, "") + "/trips", { waitUntil: "domcontentloaded" });
  if (/\/login/.test(page.url())) {
    console.error("The saved session has expired — run `npm run shot:login` again.");
    await browser.close();
    process.exit(1);
  }

  const batches = batch(unique);
  console.log(`${unique.length} place${unique.length === 1 ? "" : "s"} in ${batches.length} call${batches.length === 1 ? "" : "s"}`);

  const imported = [];
  const failures = [];
  let aborted = null;

  for (let i = 0; i < batches.length; i++) {
    const body = { google_place_ids: batches[i] };
    if (opts.type && opts.subtype) body.defaults = { type: opts.type, sub_type: opts.subtype };

    const result = await page.evaluate(async (payload) => {
      const res = await fetch("/api/places/bulk-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      let json = null;
      try { json = await res.json(); } catch {}
      return { status: res.status, json };
    }, body);

    if (result.status === 401) {
      // First call or last, the remedy is the same, and the wording should
      // not claim to know which it was.
      aborted = "401 — not signed in. The saved session has expired: run `npm run shot:login`.";
      console.error(aborted);
      break;
    }
    if (result.status === 429) {
      aborted = "429 — today's import allowance is used up. It resets at midnight UTC.";
      console.error(aborted);
      break;
    }
    if (result.status !== 200 || !result.json) {
      aborted = `HTTP ${result.status} on call ${i + 1}: ${JSON.stringify(result.json).slice(0, 200)}`;
      console.error(aborted);
      break;
    }

    for (const row of result.json.imported || []) imported.push(row);
    for (const row of result.json.failures || []) failures.push(row);
    console.log(`  call ${i + 1}/${batches.length}: ${(result.json.imported || []).length} ok, ${(result.json.failures || []).length} failed`);
  }

  await browser.close();

  const created = imported.filter((r) => r.created).length;
  console.log("");
  console.log(`${imported.length} enriched — ${created} new, ${imported.length - created} already had a row`);
  for (const row of imported) {
    console.log(`  ${row.created ? "+" : "="} ${row.place_id}  ${row.title}`);
  }
  if (failures.length) {
    console.log("");
    console.log(`${failures.length} failed:`);
    // The reason matters: `inference_failed` wants --type/--subtype, while
    // `google_places_error` usually means the id is stale or wrong.
    for (const row of failures) console.log(`  ! ${row.google_place_id}  ${row.reason}`);
  }

  // The place_ids are what the SQL step needs next, so write them down rather
  // than making someone copy them off a terminal.
  const outDir = path.join(ROOT, ".shots");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outFile = opts.out || path.join(outDir, "imported-places.json");
  writeFileSync(outFile, JSON.stringify({ imported, failures }, null, 2) + "\n");
  console.log("");
  console.log(path.relative(ROOT, outFile));

  if (aborted) {
    const done = imported.length + failures.length;
    console.log("");
    console.log(`Stopped after ${done} of ${unique.length}. Re-running is safe — a place that already`);
    console.log("has a row comes back as `=` and costs no Google lookup.");
  }

  process.exit(aborted || failures.length ? 1 : 0);
}

// Importable for its tests; only runs when invoked directly.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
