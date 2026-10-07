// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast, dismiss: vi.fn() }) }));

import { useMemberJoinedToast } from "./useMemberJoinedToast";

// The owner's "Isha joined Tuscany" (7 Oct 2026, delight audit).
const recent = new Date(Date.now() - 86400000).toISOString();
const longAgo = new Date(Date.now() - 60 * 86400000).toISOString();

function serve(members: unknown[], status = 200) {
  const f = vi.fn(async () => new Response(JSON.stringify({ members }), { status }));
  vi.stubGlobal("fetch", f);
  return f;
}

beforeEach(() => { toast.mockClear(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("useMemberJoinedToast", () => {
  it("toasts a new member once, and not again after they are seen", async () => {
    const f = serve([{ userId: "u1", firstName: "Isha", createdAt: recent }]);
    const first = renderHook(() => useMemberJoinedToast("t1", "Tuscany", true));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "Isha joined Tuscany" })));
    expect(toast.mock.calls[0][0].undo).toBeUndefined();
    // Waits behind any toast on screen, so the eve toast cannot erase it (7 Oct 2026, re-audit).
    expect(toast.mock.calls[0][0].wait).toBe(true);
    expect(f).toHaveBeenCalledWith("/api/trips/t1/members");
    first.unmount();

    renderHook(() => useMemberJoinedToast("t1", "Tuscany", true));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("never runs for a guest", async () => {
    const f = serve([{ userId: "u1", firstName: "Isha", createdAt: recent }]);
    renderHook(() => useMemberJoinedToast("t1", "Tuscany", false));
    await new Promise((r) => setTimeout(r, 20));
    expect(f).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("says nothing when the route refuses (not the owner)", async () => {
    serve([{ userId: "u1", firstName: "Isha", createdAt: recent }], 403);
    renderHook(() => useMemberJoinedToast("t1", "Tuscany", true));
    await new Promise((r) => setTimeout(r, 20));
    expect(toast).not.toHaveBeenCalled();
  });

  it("does not announce members who joined before the feature, on the first run", async () => {
    const f = serve([{ userId: "u-old", firstName: "Priya", createdAt: longAgo }]);
    renderHook(() => useMemberJoinedToast("t1", "Tuscany", true));
    await waitFor(() => expect(f).toHaveBeenCalled());
    await waitFor(() => expect(localStorage.getItem("roam:members-seen:t1")).toBe('["u-old"]'));
    expect(toast).not.toHaveBeenCalled();
  });
});
