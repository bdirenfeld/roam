#!/usr/bin/env node
// Upload a how-to video and switch it on — no code change, no deploy.
//
//   node scripts/upload-video.mjs planning-computer path/to/video-2.mp4 path/to/poster.jpg
//   node scripts/upload-video.mjs on-the-trip path/to/video-3.mp4 path/to/poster.jpg
//   node scripts/upload-video.mjs --off planning-computer      (switch one off again)
//
// The ids are the ones in src/lib/videos/howTo.ts. Files go to the public
// "how-to-videos" bucket as <id>.mp4 and <id>.jpg; then videos.json in the same
// bucket gets that id's version bumped. The app reads videos.json on load:
// an id with a version above 0 is switched on, and the version rides on the
// file URL (?v=N), so a new cut of a video replaces the old one at once.
//
// Key: SUPABASE_SERVICE_ROLE_KEY, from the environment or .env.local (Supabase
// dashboard -> Project Settings -> API -> service_role). It is sent as a header
// and never printed.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BUCKET = "how-to-videos";
const IDS = ["first-journey", "install-iphone", "install-android", "planning-computer", "more-tricks", "before-the-trip", "on-the-trip", "in-the-app"];

function env(name) {
  if (process.env[name]) return process.env[name];
  const file = resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(name + "="));
  return line ? line.slice(name.length + 1).trim() : undefined;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (environment or .env.local).");
  process.exit(1);
}
const headers = { Authorization: `Bearer ${key}`, apikey: key };

async function put(name, body, type, cache) {
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${name}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": type, "x-upsert": "true", "cache-control": `max-age=${cache}` },
    body,
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  console.log(`uploaded ${name} (${(body.length / 1e6).toFixed(1)} MB)`);
}

async function manifest() {
  const res = await fetch(`${url}/storage/v1/object/public/${BUCKET}/videos.json?t=${Date.now()}`);
  if (!res.ok) return {};
  try { return await res.json(); } catch { return {}; }
}

const args = process.argv.slice(2);
const off = args[0] === "--off";
const [id, mp4, poster] = off ? args.slice(1) : args;
if (!IDS.includes(id) || (!off && (!mp4 || !poster))) {
  console.error(`Usage: upload-video.mjs <${IDS.join("|")}> <video.mp4> <poster.jpg>   or   --off <id>`);
  process.exit(1);
}

const m = await manifest();
if (off) {
  m[id] = 0;
} else {
  await put(`${id}.mp4`, readFileSync(mp4), "video/mp4", 31536000);
  await put(`${id}.jpg`, readFileSync(poster), poster.endsWith(".png") ? "image/png" : "image/jpeg", 31536000);
  m[id] = (Number(m[id]) || 0) + 1;
}
await put("videos.json", Buffer.from(JSON.stringify(m, null, 2)), "application/json", 60);
console.log("videos.json:", JSON.stringify(m));
