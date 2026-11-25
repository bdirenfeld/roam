// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const who = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getSession: () => Promise.resolve({ data: { session: who.id ? { user: { id: who.id } } : null } }) } }) }));

import AdminDoor from "./AdminDoor";
import { ADMIN_USER_IDS } from "@/lib/adminView";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("the door to the feedback inbox", () => {
  it("is Brennan's: a link to the inbox, with how many are waiting", async () => {
    who.id = ADMIN_USER_IDS[0];
    vi.stubGlobal("fetch", () => Promise.resolve({ ok: true, json: () => Promise.resolve({ waiting: 2 }) }));
    render(<AdminDoor />);
    const a = await screen.findByText("Feedback inbox · 2 waiting");
    expect(a.getAttribute("href")).toBe("/admin/feedback");
  });
  it("still shows when the count can't be had", async () => {
    who.id = ADMIN_USER_IDS[0];
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    render(<AdminDoor />);
    expect(await screen.findByText("Feedback inbox")).toBeTruthy();
  });
  it("is not there for anyone else, and asks the server nothing", async () => {
    who.id = "11111111-1111-4111-8111-111111111111";
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    render(<AdminDoor />);
    await waitFor(() => expect(screen.queryByTestId("admin-door")).toBeNull());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("admin-door")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
