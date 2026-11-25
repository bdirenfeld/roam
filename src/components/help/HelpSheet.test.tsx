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
import { __resetMessenger, startMessenger } from "@/lib/help/messenger";

const fb = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock("featurebase-js", () => ({ default: () => {}, whenReady: () => {}, onUnreadCountChange: () => {}, show: () => fb.show() }));

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

  it("signed out is usually a redirect to the sign-in page, not a 401: the rows, no box, no error", async () => {
    vids.available = { "first-journey": 1 };
    server = () => Promise.resolve({ ok: true, status: 200, redirected: true, json: () => Promise.reject(new Error("html")) });
    render(<HelpSheet onClose={() => {}} />);
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(screen.queryByText(/Couldn.t load/)).toBeNull();
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

  it("How-to videos has a way back to Help that keeps what you were writing; X closes it all", async () => {
    vids.available = { "first-journey": 1 };
    const onClose = vi.fn();
    render(<HelpSheet onClose={onClose} />);
    await type("half a thought");
    fireEvent.click(screen.getByRole("button", { name: /How-to videos/ }));
    expect(screen.queryByRole("dialog", { name: "Help" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to Help" }));
    expect(screen.getByRole("dialog", { name: "Help" })).toBeTruthy();
    expect((await box() as HTMLTextAreaElement).value).toBe("half a thought");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /How-to videos/ }));
    fireEvent.click(screen.getByRole("dialog", { name: "How-to videos" }).querySelector('button[aria-label="Close"]')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("in a journey, reads and writes that journey's thread only, with its own draft", async () => {
    const T = "44444444-4444-4444-8444-444444444444";
    server = (u, i) => (i?.method === "POST" ? ok({ sent: true }) : ok({ messages: [] }));
    sessionStorage.setItem(HELP_FROM, `/trips/${T}/plan`);
    sessionStorage.setItem("roam:help-draft", "a general draft");
    render(<HelpSheet onClose={() => {}} />);
    expect((await box() as HTMLTextAreaElement).value).toBe("");
    expect(calls[0].url).toBe("/api/help?trip=" + T);
    await type("about this journey");
    expect(sessionStorage.getItem("roam:help-draft:" + T)).toBe("about this journey");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("about this journey", { selector: "div" });
    expect(posts()[0].init!.body!.get("trip")).toBe(T);
    expect(sessionStorage.getItem("roam:help-draft")).toBe("a general draft");
  });

  it("a reply waiting in another journey's thread is a row that opens it, and the dot stays until then", async () => {
    const T = "44444444-4444-4444-8444-444444444444";
    setHelpUnread(1);
    server = (u) => (u.includes("trip=")
      ? ok({ messages: [{ id: "b", mine: false, body: "Fixed for Paris", picture: false }], elsewhere: [] })
      : ok({ messages: [{ id: "a", mine: true, body: "general note", picture: false }], elsewhere: [{ trip: T, title: "Paris", unread: 1 }] }));
    render(<HelpSheet onClose={() => {}} />);
    const rowBtn = await screen.findByRole("button", { name: /Brennan replied about Paris/ });
    expect(screen.queryByText("Fixed for Paris")).toBeNull();
    expect(getHelpUnread()).toBe(1);
    expect(calls.some((c) => c.url === "/api/help/read")).toBe(false);
    fireEvent.click(rowBtn);
    expect(await screen.findByText("Fixed for Paris")).toBeTruthy();
    expect(screen.queryByText("general note")).toBeNull();
    expect(screen.getByText("Paris")).toBeTruthy();
    await waitFor(() => expect(getHelpUnread()).toBe(0));
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByText("general note")).toBeTruthy();
  });

  it("with the messenger running: one Message us button that opens it, no box of our own, the rows stay", async () => {
    vids.available = { "first-journey": 1 };
    await startMessenger("jwt");
    const onClose = vi.fn();
    render(<HelpSheet onClose={onClose} />);
    const go = await screen.findByRole("button", { name: "Message us" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(calls.some((c) => c.url.startsWith("/api/help"))).toBe(false);
    expect(screen.getByRole("button", { name: /How-to videos/ })).toBeTruthy();
    fireEvent.click(go);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fb.show).toHaveBeenCalledTimes(1);
    __resetMessenger();
  });

  it("is masked from the recording", async () => {
    render(<HelpSheet onClose={() => {}} />);
    await box();
    expect(screen.getByRole("dialog", { name: "Help" }).getAttribute("data-clarity-mask")).toBe("true");
  });
});
