// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { localDate } from "@/lib/isSameLocalDay";
import { useSaveDaysOffline, SAVE_DAYS_DELAY_MS } from "./useSaveDaysOffline";

// The page side of saving every day for airplane mode (7 Oct 2026, offline).
const plus = (n: number) => localDate(new Date(Date.now() + n * 86400000));
let postMessage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ["setTimeout", "clearTimeout"] });
  localStorage.clear();
  postMessage = vi.fn();
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { controller: { postMessage } } });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => {
  vi.useRealTimers();
  // @ts-expect-error test cleanup
  delete navigator.serviceWorker;
});

const days = () => [{ id: "d1", date: plus(5) }, { id: "d2", date: plus(6) }];

describe("useSaveDaysOffline", () => {
  it("posts every day's URL to the worker after a short wait, then not again for 12 hours", () => {
    const first = renderHook(() => useSaveDaysOffline("t1", plus(5), plus(6), days(), true));
    expect(postMessage).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(SAVE_DAYS_DELAY_MS); });
    expect(postMessage).toHaveBeenCalledWith({
      type: "roam:save-days",
      tripId: "t1",
      days: [{ url: "/trips/t1/days/d1", date: plus(5) }, { url: "/trips/t1/days/d2", date: plus(6) }],
    });
    first.unmount();
    renderHook(() => useSaveDaysOffline("t1", plus(5), plus(6), days(), true));
    act(() => { vi.advanceTimersByTime(SAVE_DAYS_DELAY_MS); });
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("nothing offline, with no worker, off the phone, or for a journey months away", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    renderHook(() => useSaveDaysOffline("t1", plus(5), plus(6), days(), true));
    act(() => { vi.advanceTimersByTime(SAVE_DAYS_DELAY_MS); });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    renderHook(() => useSaveDaysOffline("t2", plus(5), plus(6), days(), false));
    renderHook(() => useSaveDaysOffline("t3", plus(90), plus(95), days(), true));
    act(() => { vi.advanceTimersByTime(SAVE_DAYS_DELAY_MS); });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { controller: null } });
    renderHook(() => useSaveDaysOffline("t4", plus(5), plus(6), days(), true));
    act(() => { vi.advanceTimersByTime(SAVE_DAYS_DELAY_MS); });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("storage that throws: nothing is sent", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    renderHook(() => useSaveDaysOffline("t1", plus(5), plus(6), days(), true));
    act(() => { vi.advanceTimersByTime(SAVE_DAYS_DELAY_MS); });
    spy.mockRestore();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("leaving before the wait is up sends nothing", () => {
    const h = renderHook(() => useSaveDaysOffline("t1", plus(5), plus(6), days(), true));
    h.unmount();
    act(() => { vi.advanceTimersByTime(SAVE_DAYS_DELAY_MS); });
    expect(postMessage).not.toHaveBeenCalled();
  });
});
