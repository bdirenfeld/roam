// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let pending: { id: string; createdAt: number; table: string; operation: string; match: Record<string, string>; payload: Record<string, unknown>; updatedAt: number }[] = [];
vi.mock("@/lib/offline/writeQueue", () => ({
  getState: () => ({ pending, failures: [], syncing: false }),
  subscribe: () => () => {},
  dismissFailures: () => {},
}));
vi.mock("@/lib/offline/queuedWrite", () => ({ startAutoSync: () => () => {}, flushQueue: vi.fn(() => Promise.resolve()) }));

import OfflineQueueIndicator from "./OfflineQueueIndicator";

const entry = (ageMs: number) => ({ id: "e" + ageMs, createdAt: Date.now() - ageMs, updatedAt: Date.now(), table: "trips", operation: "update", match: { id: "t" }, payload: { booking_checklist: {} } });
function setOnline(v: boolean) { Object.defineProperty(window.navigator, "onLine", { value: v, configurable: true }); }

describe("the sync message only when it has to be (6 Oct 2026)", () => {
  beforeEach(() => { pending = []; setOnline(true); });
  afterEach(() => cleanup());

  it("online with a change that is still draining: says nothing", () => {
    pending = [entry(20_000)];
    const { container } = render(<OfflineQueueIndicator />);
    expect(container.textContent).toBe("");
  });

  it("online with a change waiting over two minutes: one quiet line with Try again", () => {
    pending = [entry(3 * 60_000)];
    render(<OfflineQueueIndicator />);
    expect(screen.getByRole("button").textContent).toBe("A change hasn’t saved yet · Try again");
  });

  it("offline: says so", () => {
    setOnline(false);
    pending = [entry(5_000)];
    render(<OfflineQueueIndicator />);
    expect(screen.getByText("Offline · changes will sync")).toBeTruthy();
  });
});
