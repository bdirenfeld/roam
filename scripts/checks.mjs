#!/usr/bin/env node
// ── checks — everything the Checks workflow runs, and all of it ───────────
//
// `npm run checks`          type check, lint, tests, build   (~90s)
// `npm run checks -- --fast` the first three, no build       (~30s)
//
// Two problems, one script.
//
// **It runs every step even after one fails.** GitHub Actions stops a job at
// the first failing step, and on 11 Sept that hid the whole picture: one line
// in `layers.test.ts` used a `matchAll` spread this project's ES5 target
// cannot compile, the type check failed, and lint, tests and build never ran.
// Nine commits went to main that way. The app was fine the whole time and
// nothing said so — a red run that names one broken test file reads exactly
// like a red run where everything is broken.
//
// **It runs before the push, not after.** The workflow is a report, not a
// gate: by the time it goes red the code is already on main. `.githooks/
// pre-push` runs this, so the answer arrives while it is still a local commit.
//
// `git push --no-verify` skips it. That is deliberate and it should feel
// deliberate.

import { spawnSync } from "node:child_process";

const FAST = process.argv.indexOf("--fast") !== -1;

const STEPS = [
  { name: "type check", cmd: "npx", args: ["tsc", "--noEmit"] },
  { name: "lint", cmd: "npm", args: ["run", "lint"] },
  { name: "tests", cmd: "npm", args: ["test"] },
  { name: "build", cmd: "npm", args: ["run", "build"], slow: true },
];

const results = [];

for (const step of STEPS) {
  if (FAST && step.slow) {
    results.push({ name: step.name, skipped: true });
    continue;
  }
  process.stdout.write(`  ${step.name}… `);
  const started = Date.now();
  const run = spawnSync(step.cmd, step.args, { encoding: "utf8", shell: process.platform === "win32" });
  const seconds = Math.round((Date.now() - started) / 1000);
  const ok = run.status === 0;
  process.stdout.write(`${ok ? "ok" : "FAILED"} (${seconds}s)\n`);
  results.push({
    name: step.name,
    ok,
    seconds,
    // next lint writes warnings to stdout and says nothing on stderr; tsc is
    // the other way round. Keep both or half the failures explain nothing.
    output: ((run.stdout || "") + (run.stderr || "")).trim(),
  });
}

const failed = results.filter((r) => r.ok === false);

if (failed.length) {
  for (const step of failed) {
    console.log("");
    console.log("─".repeat(60));
    console.log(step.name + " failed:");
    console.log("─".repeat(60));
    // The tail is where the error is; the head is npm's own preamble.
    const lines = step.output.split("\n");
    console.log(lines.slice(Math.max(0, lines.length - 40)).join("\n"));
  }
}

console.log("");
for (const r of results) {
  if (r.skipped) console.log(`  –  ${r.name} (skipped, --fast)`);
  else console.log(`  ${r.ok ? "✓" : "✗"}  ${r.name} (${r.seconds}s)`);
}

if (failed.length) {
  console.log("");
  console.log(`${failed.length} of ${results.filter((r) => !r.skipped).length} failed.`);
  // Which ones PASSED is the useful half: a lone type-check failure in a test
  // file means the app itself is fine, and the fix is small.
  process.exit(1);
}

if (FAST) {
  console.log("");
  console.log("The build was skipped. Run `npm run checks` before pushing.");
}
