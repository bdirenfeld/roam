import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The phone preview (/dev/phone/[screen]) must not exist on the live site:
 * fixtures, a stubbed data layer and no sign-in are for `next dev` only.
 * The page 404s and the middleware keeps /dev/ behind sign-in outside dev.
 */

const updateSession = vi.fn(async () => "checked-by-auth");
vi.mock("@/lib/supabase/middleware", () => ({ updateSession: (...a: unknown[]) => updateSession(...(a as [])) }));
// The page's heavy imports are not under test here.
vi.mock("./PhoneHarnessLoader", () => ({ default: () => null }));
vi.mock("@/app/journey/[token]/SharedItinerary", () => ({ default: () => null }));

import { devPreviewAllowed } from "./devOnly";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); updateSession.mockClear(); });

const page = async () => (await import("./[screen]/page")).default;
const params = (screen: string) => ({ params: Promise.resolve({ screen }) });
/** notFound() throws Next's NEXT_NOT_FOUND error. */
const is404 = (e: unknown) => String((e as { digest?: string })?.digest ?? (e as Error)?.message).includes("NEXT_NOT_FOUND");

describe("the phone preview is dev only", () => {
  it("allowed only in development and test, never production or empty", () => {
    expect(devPreviewAllowed("development")).toBe(true);
    expect(devPreviewAllowed("test")).toBe(true);
    expect(devPreviewAllowed("production")).toBe(false);
    expect(devPreviewAllowed("")).toBe(false);
  });

  // Development first: React's JSX runtime is loaded once per run, by whichever
  // NODE_ENV is set when the page first renders; production never gets that far.
  it("in development it renders a known screen and 404s an unknown one", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const Page = await page();
    expect(await Page(params("day"))).toBeTruthy();
    expect(await Page(params("shared"))).toBeTruthy();
    await expect(Page(params("nope"))).rejects.toSatisfy(is404);
  });

  it("the page is a 404 in production, for every screen", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const Page = await page();
    for (const s of ["day", "shared", "bookings-open", "nope"]) {
      await expect(Page(params(s))).rejects.toSatisfy(is404);
    }
  });

  it("the middleware skips sign-in for /dev/ in development only", async () => {
    const { NextRequest } = await import("next/server");
    const req = () => new NextRequest("http://localhost/dev/phone/day");

    vi.stubEnv("NODE_ENV", "production");
    const prod = (await import("@/middleware")).middleware;
    expect(await prod(req())).toBe("checked-by-auth");
    expect(updateSession).toHaveBeenCalledTimes(1);

    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    const dev = (await import("@/middleware")).middleware;
    expect(await dev(req())).not.toBe("checked-by-auth");
    expect(updateSession).toHaveBeenCalledTimes(1);
    // Anything else still goes through sign-in in development.
    await dev(new NextRequest("http://localhost/trips"));
    expect(updateSession).toHaveBeenCalledTimes(2);
  });

  it("the page asks devPreviewAllowed before anything else", () => {
    const src = readFileSync(path.join(__dirname, "[screen]", "page.tsx"), "utf8");
    const body = src.slice(src.indexOf("export default async function"));
    expect(body.split("\n")[1].trim()).toBe("if (!devPreviewAllowed()) notFound();");
  });
});
