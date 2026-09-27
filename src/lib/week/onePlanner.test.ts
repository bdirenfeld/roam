import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// 27 Sep 2026: the desktop week called the engine (lib/week/arrange) itself,
// so the cruise fixes in lib/week/dayPlan (ports, all aboard, the first and
// last day's hinges) reached the day page and the phone but not the week.
// Every screen plans through dayPlan; only dayPlan talks to the engine.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe("one planner", () => {
  it("no component calls arrangeDay directly; they use lib/week/dayPlan", () => {
    const offenders = [...files("src/components"), ...files("src/app")].filter((f) => /\barrangeDay\(/.test(readFileSync(f, "utf8")));
    expect(offenders, "plan through planExisting / planBatch in lib/week/dayPlan").toEqual([]);
  });
});
