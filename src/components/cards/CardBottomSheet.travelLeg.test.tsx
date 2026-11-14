// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { Card, Day } from "@/types/database";

/**
 * The card sheet of a travel leg (7 Oct 2026, mock d13): the title is the
 * route (renameable since 12 Nov 2026) with From and To rows and their
 * addresses under it (back on 12 Nov 2026 at his ask; mock t05 had cut them), the caption once, the mode
 * picker writes details.mode, and a transit card with no start offers one.
 * The leg is the G Adventures journey's Day 23 as converted.
 */

const writes = vi.hoisted(() => ({ calls: [] as Array<{ table: string; patch: Record<string, unknown> }> }));
vi.mock("@/lib/offline/queuedWrite", () => ({
  queuedUpdate: vi.fn(async (table: string, _m: unknown, patch: Record<string, unknown>) => { writes.calls.push({ table, patch }); return { error: null }; }),
  queuedDelete: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const singleBox = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("@/lib/supabase/client", () => {
  const make = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const k of ["from", "select", "not", "order", "limit", "eq", "in", "is", "update", "insert", "delete", "upsert", "neq"]) chain[k] = self;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.single = () => Promise.resolve({ data: singleBox.data, error: null });
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    chain.auth = { getSession: () => Promise.resolve({ data: { session: null } }) };
    chain.storage = { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) };
    return chain;
  };
  return { createClient: () => make() };
});
vi.mock("./PlacePhotoGallery", () => ({ default: () => null }));

import CardBottomSheet from "./CardBottomSheet";

const days = [{ id: "d23", trip_id: "t1", date: "2027-02-22", day_number: 23 }] as unknown as Day[];

function truck(details: Record<string, unknown> = {}): Card {
  return {
    id: "b7580610", trip_id: "t1", day_id: "d23", place_id: "p-mfuwe", status: "in_itinerary",
    start_time: "06:00:00", end_time: "19:00:00", confirmed: false, position: 0, source_url: null,
    details: {
      title: "Lusaka → Mfuwe", named: true, mode: "drive", mode_label: "Overland truck",
      from: { title: "Lusaka", lat: -15.4154677, lng: 28.2773267 },
      ...details,
    },
    place: {
      id: "p-mfuwe", title: "Mfuwe", type: "logistics", sub_type: "transit",
      address: "Mfuwe, Zambia", lat: -13.2549974, lng: 31.9326952,
      rating: null, price_level: null, hours: null, google_place_id: "g", details: {},
    },
  } as unknown as Card;
}

beforeEach(() => { writes.calls = []; singleBox.data = null; });

async function open(card: Card, readOnly = false) {
  await act(async () => { render(<CardBottomSheet card={card} onClose={() => {}} days={days} readOnly={readOnly} />); });
}
const revealModes = async () => {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Change how you travel" })); });
};

describe("CardBottomSheet — a travel leg (7 Oct 2026)", () => {
  it("From and To are the top of the card, each with its address; no separate title (14 Nov 2026, mock D)", async () => {
    await open(truck());
    expect(screen.queryByRole("heading", { name: "Lusaka → Mfuwe" })).toBeNull();
    expect(screen.getByTestId("leg-from-row").textContent).toContain("Lusaka");
    const to = screen.getByTestId("leg-to-row").textContent;
    expect(to).toContain("Mfuwe");
    expect(to).toContain("Mfuwe, Zambia");
  });

  it("a travel card drops the place's furniture: no rating, heart, website, call, link or type pill", async () => {
    await open(truck({}));
    for (const name of ["We loved this", "Website", "Call", "Link place from map", "Attachments"]) {
      expect(screen.queryByRole("button", { name }) ?? screen.queryByRole("link", { name })).toBeNull();
    }
    expect(screen.queryByTestId("type-pill-target")).toBeNull();
    expect(screen.getByTestId("leg-time").textContent).toContain("6:00 AM");
    expect(screen.queryByRole("button", { name: "Change the time" })).toBeTruthy();
  });

  it("a train keeps the paperclip (tickets ride on it); a drive does not", async () => {
    await open(truck({ mode: "train", mode_label: undefined }));
    expect(screen.getByRole("button", { name: "Attachments" })).toBeTruthy();
  });

  it("the ⋯ holds Change type, which opens the type picker", async () => {
    await open(truck());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "More options" })); });
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "Change type" })); });
    expect(screen.queryByRole("menuitem", { name: "Change type" })).toBeNull();
    expect(screen.getByText("Transit")).toBeTruthy();
  });

  it("once Google has the times, its car / transit pills are the only choices: no caption, no four-mode list", async () => {
    const { estimateKey } = await import("@/lib/travel/estimate");
    const key = estimateKey({ lat: -15.4154677, lng: 28.2773267 }, { lat: -13.2549974, lng: 31.9326952 });
    await open(truck({ mode_label: undefined, estimate: { key, drive: 600, transit: 720, rides: 2, via: "bus" } }));
    expect(screen.queryByTestId("leg-caption")).toBeNull();
    expect(screen.getByTestId("leg-estimate").textContent).toContain("10 h");
    expect(screen.queryByRole("button", { name: "Change how you travel" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("a ferry picked over land (his Lucca drive, 14 Nov 2026) is not offered back: a tap on the car pill puts it right", async () => {
    const { estimateKey } = await import("@/lib/travel/estimate");
    const key = estimateKey({ lat: -15.4154677, lng: 28.2773267 }, { lat: -13.2549974, lng: 31.9326952 });
    await open(truck({ mode: "ferry", mode_label: undefined, estimate: { key, drive: 600, transit: 720, rides: 2, via: "bus" } }));
    expect(screen.queryByText(/Ferry/)).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /10 h/ })); });
    expect((writes.calls.find((c) => c.table === "cards")!.patch.details as Record<string, unknown>).mode).toBe("drive");
  });

  it("the title is his to rename (⋯ → Rename): it saves as a named title, not the place's name", async () => {
    await open(truck());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "More options" })); });
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "Rename" })); });
    const input = screen.getByDisplayValue("Lusaka → Mfuwe");
    fireEvent.change(input, { target: { value: "Truck day to the park" } });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    const w = writes.calls.find((c) => c.table === "cards")!;
    expect((w.patch.details as Record<string, unknown>).title).toBe("Truck day to the park");
    expect((w.patch.details as Record<string, unknown>).named).toBe(true);
  });

  it("car and transit times show once known; a tap sets the mode and moves the end time", async () => {
    const { estimateKey } = await import("@/lib/travel/estimate");
    const key = estimateKey({ lat: -15.4154677, lng: 28.2773267 }, { lat: -13.2549974, lng: 31.9326952 });
    await open(truck({ estimate: { key, drive: 600, transit: 720, rides: 2, via: "bus" } }));
    const row = screen.getByTestId("leg-estimate");
    expect(row.textContent).toContain("10 h");
    expect(row.textContent).toContain("12 h");
    expect(row.textContent).toContain("1 change");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /12 h/ })); });
    const w = writes.calls.find((c) => c.table === "cards")!;
    expect((w.patch.details as Record<string, unknown>).mode).toBe("bus");
    expect(w.patch.end_time).toBe("18:00:00");
  });

  it("says 'Overland truck · 13h' once, and keeps the pills behind 'Change how you travel'", async () => {
    await open(truck());
    expect(screen.getAllByText("Overland truck · 13h")).toHaveLength(1);
    expect(screen.queryByRole("radio")).toBeNull();
    await revealModes();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "Drive" }).getAttribute("aria-checked")).toBe("true");
  });

  it("'change' opens the From search; a guest gets no 'change' and no mode link", async () => {
    await open(truck());
    expect(screen.queryByPlaceholderText("Search a town, station or port")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change where this starts, now Lusaka" }));
    expect(screen.getByPlaceholderText("Search a town, station or port")).toBeTruthy();
    cleanup();
    await open(truck(), true);
    expect(screen.getByTestId("leg-from-row").textContent).toContain("Lusaka");
    expect(screen.queryByRole("button", { name: /Change where this starts/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change how you travel" })).toBeNull();
    expect(screen.getByTestId("travel-leg-panel").textContent).toContain("Overland truck · 13h");
  });

  it("the mode picker writes details.mode, and the tour's label gives way to it", async () => {
    await open(truck());
    await revealModes();
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: "Ferry" })); });
    const w = writes.calls.find((c) => c.table === "cards")!;
    expect((w.patch.details as Record<string, unknown>).mode).toBe("ferry");
    expect((w.patch.details as Record<string, unknown>).mode_label).toBeUndefined();
    expect((w.patch.details as Record<string, unknown>).from).toEqual({ title: "Lusaka", lat: -15.4154677, lng: 28.2773267 });
  });

  it("tapping the mode already chosen writes nothing (the tour's words stay)", async () => {
    await open(truck());
    await revealModes();
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: "Drive" })); });
    expect(writes.calls).toHaveLength(0);
  });

  it("a leg with no mode: the caption is only the length and no pill is lit", async () => {
    await open(truck({ mode: undefined, mode_label: undefined }));
    expect(screen.getByTestId("leg-caption").textContent).toContain("13h");
    expect(screen.getByTestId("leg-caption").textContent).not.toMatch(/Drive|truck/);
    await revealModes();
    for (const r of screen.getAllByRole("radio")) expect(r.getAttribute("aria-checked")).toBe("false");
  });

  it("a transit card with no start asks where you leave from, and the tap opens the search", async () => {
    await open(truck({ from: undefined, title: "Pick up rental car", named: false }));
    const set = screen.getByRole("button", { name: "Set where this starts" });
    expect(set.textContent).toBe("add");
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(set);
    expect(screen.getByPlaceholderText("Search a town, station or port")).toBeTruthy();
  });
});

describe("travel time pills round like the end time", () => {
  it("63 minutes reads 1 h 05", async () => {
    const { estimateKey } = await import("@/lib/travel/estimate");
    const key = estimateKey({ lat: -15.4154677, lng: 28.2773267 }, { lat: -13.2549974, lng: 31.9326952 });
    await open(truck({ estimate: { key, drive: 63, transit: null, rides: null, via: null } }));
    expect(screen.getByTestId("leg-estimate").textContent).toContain("1 h 05");
  });
});

describe("drive, park, walk on the card (14 Nov 2026, step 3)", () => {
  const PARK = { title: "Lucca station car park", lat: 43.8374, lng: 10.5061, drive: 10, walk: 15 };
  it("shows the drive, the car park and the walk; the plain car pill steps aside for it", async () => {
    const { estimateKey } = await import("@/lib/travel/estimate");
    const key = estimateKey({ lat: -15.4154677, lng: 28.2773267 }, { lat: -13.2549974, lng: 31.9326952 });
    await open(truck({ mode_label: undefined, park: PARK, estimate: { key, drive: 600, transit: 720, rides: 2, via: "bus" } }));
    expect(screen.getByTestId("leg-park").textContent).toContain("10 min drive → park at Lucca station car park → 15 min walk");
    expect(screen.getByTestId("leg-estimate").textContent).not.toContain("10 h");
    expect(screen.getByTestId("leg-estimate").textContent).toContain("12 h");
    expect(screen.queryByTestId("leg-ztl")).toBeNull();
  });

  it("a tap on it sets the drive and the end time to the whole trip", async () => {
    await open(truck({ mode: "bus", mode_label: undefined, park: PARK }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Drive, park, walk/ })); });
    const w = writes.calls.find((c) => c.table === "cards")!;
    expect((w.patch.details as Record<string, unknown>).mode).toBe("drive");
    expect(w.patch.end_time).toBe("06:25:00");
  });

  it("in Italy it carries the one ZTL line", async () => {
    const c = truck({ mode_label: undefined, park: PARK });
    (c.place as unknown as { address: string }).address = "Piazza San Michele, 55100 Lucca LU, Italy";
    await open(c);
    expect(screen.getByTestId("leg-ztl").textContent).toContain("ZTL");
  });
});

describe("a new To (Brennan, 14 Nov 2026: the farm drive changed to Rome kept the farm's note and times)", () => {
  const ROME = { id: "p-rome", title: "Rome", type: "locality", sub_type: null, address: "Rome, Metropolitan City of Rome Capital, Italy", lat: 41.9028, lng: 12.4964 };
  beforeEach(async () => {
    const { estimateKey } = await import("@/lib/travel/estimate");
    singleBox.data = ROME;
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.startsWith("/api/places/autocomplete")) return new Response(JSON.stringify({ predictions: [{ place_id: "g-rome", structured_formatting: { main_text: "Rome", secondary_text: "Italy" } }] }));
      if (u.startsWith("/api/places/details")) return new Response(JSON.stringify({ result: { name: "Rome", formatted_address: ROME.address, geometry: { location: { lat: ROME.lat, lng: ROME.lng } } } }));
      if (u.startsWith("/api/places/bulk-import")) return new Response(JSON.stringify({ imported: [{ place_id: "p-rome" }] }));
      if (u.startsWith("/api/travel/estimate")) return new Response(JSON.stringify({ key: estimateKey({ lat: -15.4154677, lng: 28.2773267 }, { lat: ROME.lat, lng: ROME.lng }), drive: 245, transit: 275, rides: 5, via: "train" }));
      return new Response("{}");
    }) as unknown as typeof fetch;
  });

  it("the end time moves to the new drive, the old car park goes, and the note is offered for clearing, not cleared", async () => {
    await open(truck({ mode_label: undefined, notes: "~1 h. The farm is at Località Torricchio.", park: { title: "Farm lot", lat: 1, lng: 1, drive: 50, walk: 5 } }));
    fireEvent.click(screen.getByRole("button", { name: "Change where this goes, now Mfuwe" }));
    fireEvent.change(screen.getByPlaceholderText("Search a place, town or station"), { target: { value: "Rome" } });
    const hit = await screen.findByText("Rome", { selector: "span" }, { timeout: 2000 });
    await act(async () => { fireEvent.click(hit.closest("button")!); });
    await waitFor(() => expect(writes.calls.some((c) => c.patch.end_time === "10:05:00")).toBe(true));
    expect(screen.getByTestId("leg-stale-note").textContent).toContain("written for Mfuwe");
    expect(writes.calls.some((c) => (c.patch.details as Record<string, unknown> | undefined)?.notes === undefined && c.patch.details)).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Clear note" })); });
    const cleared = writes.calls.at(-1)!.patch.details as Record<string, unknown>;
    expect(cleared.notes).toBeUndefined();
    expect(screen.queryByTestId("leg-stale-note")).toBeNull();
  });
});
