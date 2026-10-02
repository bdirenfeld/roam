// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { useFreshPush } from "./useFreshPush";

/**
 * A push straight after a write is served from Next's router cache, so the
 * page opens as it was before the write (Plan my trip on the phone, 2 Oct 2026).
 * The hook refreshes first and pushes once the host's server data is back.
 */
beforeEach(() => { router.push.mockClear(); router.refresh.mockClear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useFreshPush", () => {
  it("refreshes, then pushes only when the refreshed data arrives", () => {
    const first = [{ id: "a" }];
    const { result, rerender } = renderHook(({ data }) => useFreshPush(data), { initialProps: { data: first } });
    act(() => { result.current("/trips/t1/days/d1"); });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    rerender({ data: first }); // the same render again is not new data
    expect(router.push).not.toHaveBeenCalled();
    rerender({ data: [{ id: "a" }, { id: "n1" }] });
    expect(router.push).toHaveBeenCalledWith("/trips/t1/days/d1");
    expect(router.refresh.mock.invocationCallOrder[0]).toBeLessThan(router.push.mock.invocationCallOrder[0]);
  });

  it("waits for data that has the write in it when told what to look for", () => {
    const { result, rerender } = renderHook(({ data }) => useFreshPush(data), { initialProps: { data: [{ id: "a" }] } });
    act(() => { result.current("/d1", (d) => d.some((c) => c.id === "n1")); });
    rerender({ data: [{ id: "a" }] }); // a new array from some other refresh, still without the new card
    expect(router.push).not.toHaveBeenCalled();
    rerender({ data: [{ id: "a" }, { id: "n1" }] });
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("pushes anyway if the refresh never comes back (offline), and only once", () => {
    const { result, rerender } = renderHook(({ data }) => useFreshPush(data, 5000), { initialProps: { data: [1] } });
    act(() => { result.current("/d1"); });
    act(() => { vi.advanceTimersByTime(4999); });
    expect(router.push).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(router.push).toHaveBeenCalledTimes(1);
    rerender({ data: [2] }); // a late refresh does not open it twice
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
