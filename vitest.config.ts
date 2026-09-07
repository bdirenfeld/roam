import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests sit next to the code they cover, as `*.test.ts`.
//
// No jsdom and no React testing library: everything tested here is a pure
// function that takes a row shape and returns a value. That is deliberate —
// the bugs this suite exists to catch were never rendering bugs, they were
// ordering, time and column-name bugs, and those are cheapest to pin down at
// the layer where the decision is actually made.
//
// `describe`/`it`/`expect` are imported explicitly rather than switched on as
// globals, so `next lint` sees ordinary imports and needs no extra config.
export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path in tsconfig.json. Kept by hand rather than adding
    // vite-tsconfig-paths — one line against one more dependency.
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Pinned so date logic is tested in the timezone the app is actually used
    // in. GitHub's runners are UTC, where local and UTC agree and the
    // late-at-night case in resolveDefaultDay.test.ts would pass either way.
    env: { TZ: "America/Toronto" },
  },
});
