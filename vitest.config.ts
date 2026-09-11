import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests sit next to the code they cover: `*.test.ts` for logic, `*.test.tsx`
// for anything that renders.
//
// This file used to say "no jsdom and no React testing library ... the bugs
// this suite exists to catch were never rendering bugs". That was wrong, and
// 11 Sept 2026 is the day it was disproved. Brennan, having found four faults
// in a row by opening the app: "every time I look at the UI, I find an issue
// in like 2 seconds. You run like 200 tests and can't find a single one.
// What's the disconnect?"
//
// The disconnect was this config. 228 green tests, every one of them a pure
// function, while the map fought his pinch (a render loop), the sheet would
// not pull down (a touch and a click both firing) and a base showed a blank
// white list while it searched. None of those is an ordering or a time bug.
// All of them are rendering bugs, and nothing here could reach them.
//
// `describe`/`it`/`expect` are imported explicitly rather than switched on as
// globals, so `next lint` sees ordinary imports and needs no extra config.
export default defineConfig({
  // JSX is handled by esbuild's automatic runtime rather than
  // @vitejs/plugin-react: the plugin only adds Fast Refresh, which a test run
  // has no use for, and it would not resolve against this React version.
  esbuild: { jsx: "automatic" },
  resolve: {
    // Mirrors the `@/*` path in tsconfig.json. Kept by hand rather than adding
    // vite-tsconfig-paths — one line against one more dependency.
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Logic tests are far more numerous and run faster in node; a rendering
    // test opts into jsdom with a `@vitest-environment jsdom` docblock.
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    // Pinned so date logic is tested in the timezone the app is actually used
    // in. GitHub's runners are UTC, where local and UTC agree and the
    // late-at-night case in resolveDefaultDay.test.ts would pass either way.
    env: { TZ: "America/Toronto" },
  },
});
