#!/usr/bin/env node
// Sign in once, keep the cookies. See the note at the top of scripts/shot.mjs.
//
//   npm run shot:login
//
// Opens a real Chromium window at the app, waits until you have signed in with
// Google, then writes the storage state so `npm run shot` can reuse it. Needs
// a machine with a screen — a remote container has neither a display nor your
// Google session.

import { existsSync, mkdirSync } from "node:fs";
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

const base = process.env.ROAM_SHOT_BASE || "http://localhost:3000";
const statePath = process.env.ROAM_SHOT_STATE || path.join(ROOT, ".auth", "roam.json");

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(base + "/login");

console.log("Sign in in the window that just opened.");
console.log("Waiting until you land inside the app (up to 5 minutes)…");

try {
  // /trips is the first signed-in page; the login route redirects there.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 300000 });
} catch {
  console.error("Timed out before sign-in finished. Nothing was saved.");
  await browser.close();
  process.exit(1);
}

const dir = path.dirname(statePath);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
await context.storageState({ path: statePath });
console.log("Saved " + path.relative(ROOT, statePath) + " — `npm run shot` will use it until it expires.");
await browser.close();
