// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const vids = vi.hoisted(() => ({ available: {} as Record<string, number> }));
const said = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/useHowToVideos", () => ({ SUPABASE_BASE: "https://x.supabase.co", useHowToVideos: () => ({ ready: true, available: vids.available, seen: {}, markSeen: () => {} }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => said }));

import HelpSheet, { HELP_FROM } from "./HelpSheet";
import { JourneyGuidanceContext } from "@/components/onboarding/JourneyGuidanceContext";
import { getHelpUnread, setHelpUnread } from "@/lib/help/unread";

const ok = (j: unknown, status = 200) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(j) });
let server: (url: string, init?: { method?: string; body?: FormData }) => Promise<unknown>;
const calls: { url: string; init?: { method?: string; body?: FormData } }[] = [];
beforeEach(() => {
  calls.length = 0; said.toast.mockClear(); sessionStorage.clear(); vids.available = {};
  server = () => ok({ messages: [] });
  vi.stubGlobal("fetch", (url: string, init?: { method?: string; body?: FormData }) => { calls.push({ url, init }); return server(url, init); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setHelpUnread(0); });
const posts = () => calls.filter((c) => c.url === "/api/help" && c.init?.method === "POST");
const box = () => screen.findByPlaceholderText(/wrong, missing, or good/);
async function type(words: string) { fireEvent.change(await box(), { target: { value: words } }); }

describe("Help", () => {
  it("sends the words with the screen, once, then shows them and clears the draft", async () => {
    server = (u, i) => (i?.method === "POST" ? ok({ sent: true, code: "RM-1" }) : ok({ messages: [] }));
    sessionStorage.setItem(HELP_FROM, "/trips/x/plan");
    render(<HelpSheet onClose={() => {}} />);
    await type("The drive is wrong");
    expect(sessionStorage.getItem("roam:help-draft")).toBe("The drive is wrong");
    const send = screen.getByRole("button", { name: "Send" });
    fireEvent.click(send); fireEvent.click(send);
    await screen.findByText("The drive is wrong", { selector: "div" });
    expect(posts()).toHaveLength(1);
    expect(posts()[0].init!.body!.get("screen")).toBe("/trips/x/plan");
    expect(sessionStorage.getItem("roam:help-draft")).toBeNull();
    expect(sessionStorage.getItem(HELP_FROM)).toBeNull();
  });

  it("a failed send keeps the words, and the retry carries the same id", async () => {
    let n = 0;
    server = (u, i) => (i?.method === "POST" ? (n++ ? ok({ sent: true }) : Promise.reject(new Error("offline"))) : ok({ messages: [] }));
    render(<HelpSheet onClose={() => {}} />);
    await type("keep me");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(said.toast).toHaveBeenCalledWith({ message: "Couldn't send that. Your words are kept." }));
    expect((await box() as HTMLTextAreaElement).value).toBe("keep me");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("keep me", { selector: "div" });
    expect(posts()[0].init!.body!.get("id")).toBe(posts()[1].init!.body!.get("id"));
  });

  it("shows Brennan's reply, marks it read and clears the dot", async () => {
    setHelpUnread(1);
    server = () => ok({ messages: [{ id: "a", mine: true, body: "hello", picture: false }, { id: "b", mine: false, body: "On it", picture: false }] });
    render(<HelpSheet onClose={() => {}} />);
    expect(await screen.findByText("On it")).toBeTruthy();
    expect(screen.getByText("Brennan")).toBeTruthy();
    expect(calls.some((c) => c.url === "/api/help/read" && c.init?.method === "POST")).toBe(true);
    expect(getHelpUnread()).toBe(0);
  });

  it("a thread that won't load says so and tries again; the box still works", async () => {
    server = () => ok({}, 500);
    render(<HelpSheet onClose={() => {}} />);
    const again = await screen.findByText(/Couldn.t load your messages/);
    server = () => ok({ messages: [] });
    fireEvent.click(again);
    await waitFor(() => expect(screen.queryByText(/Couldn.t load/)).toBeNull());
    expect(await box()).toBeTruthy();
  });

  it("signed out (the demo): the rows, no box", async () => {
    vids.available = { "first-journey": 1 };
    server = () => ok({}, 401);
    render(<HelpSheet onClose={() => {}} />);
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(screen.getByRole("button", { name: /How-to videos/ })).toBeTruthy();
  });

  it("Walkthroughs closes Help and opens the list; never for a guest", async () => {
    const choose = vi.fn(), onClose = vi.fn();
    const at = (guest: boolean) => <JourneyGuidanceContext.Provider value={{ resume: () => {}, choose }}><HelpSheet guest={guest} onClose={onClose} /></JourneyGuidanceContext.Provider>;
    render(at(false));
    await box();
    fireEvent.click(screen.getByRole("button", { name: /Walkthroughs/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(choose).toHaveBeenCalledTimes(1);
    cleanup();
    render(at(true));
    await box();
    expect(screen.queryByRole("button", { name: /Walkthroughs/ })).toBeNull();
  });

  it("How-to videos opens the list, and closing it comes back to Help", async () => {
    vids.available = { "first-journey": 1 };
    render(<HelpSheet onClose={() => {}} />);
    await box();
    fireEvent.click(screen.getByRole("button", { name: /How-to videos/ }));
    const sheet = screen.getByRole("dialog", { name: "How-to videos" });
    fireEvent.click(sheet.querySelector('button[aria-label="Close"]')!);
    expect(screen.getByRole("dialog", { name: "Help" })).toBeTruthy();
  });

  it("is masked from the recording", async () => {
    render(<HelpSheet onClose={() => {}} />);
    await box();
    expect(screen.getByRole("dialog", { name: "Help" }).getAttribute("data-clarity-mask")).toBe("true");
  });
});
