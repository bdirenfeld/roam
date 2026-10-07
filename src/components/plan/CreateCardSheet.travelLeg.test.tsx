// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor, within } from "@testing-library/react";

/**
 * A travel leg added by hand (7 Oct 2026, mock d13, his tweak 2): picking a
 * station on the Add-to-this-day sheet does not add at once; it shows From,
 * already set to last night's stay, and the mode, and Add writes both into
 * the card's details. Days and hotels are the G Adventures journey's rows
 * (days 22–23): the night before Day 23 is Eureka Camping Park.
 */

vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedInsert: vi.fn(async () => ({ error: null })), queuedDelete: vi.fn(async () => ({ error: null })) }));
vi.mock("@/lib/supabase/authUser", () => ({ getAuthUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/scheduleCard", () => ({ scheduleCardOnDay: vi.fn() }));

const hotel = (id: string, dayId: string, title: string, lat: number, lng: number, placeId: string, t: string, details: unknown = null) => ({
  id, day_id: dayId, place_id: placeId, status: "in_itinerary", start_time: t, details,
  place: { id: placeId, title, type: "logistics", sub_type: "hotel", lat, lng, google_place_id: null, address: null },
});
const DAYS = [
  { id: "d20", date: "2027-02-19" },
  { id: "d22", date: "2027-02-21" },
  { id: "d23", date: "2027-02-22" },
];
const CARDS = [
  hotel("ecef281e", "d20", "Shearwater Explorers Village", -17.9241715, 25.8410587, "087b9d34", "14:30:00"),
  hotel("a3b5ae02", "d22", "Shearwater Explorers Village", -17.9241715, 25.8410587, "087b9d34", "05:30:00", { title: "Check out of Shearwater Explorers Village" }),
  hotel("4dd508f2", "d22", "Eureka Camping Park", -15.5035103, 28.2645026, "ee27ab67", "17:00:00"),
  hotel("687eb6dd", "d23", "Croc Valley Camp", -13.1007165, 31.7944507, "edde0c4a", "19:00:00"),
];

const db = vi.hoisted(() => ({ inserted: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/client", () => {
  const client = {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const k of ["select", "eq", "not", "upsert"]) chain[k] = self;
      chain.single = async () => ({ data: { id: "pl-new" }, error: null });
      chain.insert = async (row: Record<string, unknown>) => { db.inserted.push(row); return { error: null }; };
      chain.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: table === "days" ? DAYS : table === "cards" ? CARDS : [], error: null }).then(ok);
      return chain;
    },
  };
  return { createClient: () => client };
});

import CreateCardSheet from "./CreateCardSheet";

function stubGoogle(types: string[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () => url.startsWith("/api/places/autocomplete")
      ? { predictions: [{ place_id: "gBus", description: "Mfuwe Bus Station", structured_formatting: { main_text: "Mfuwe Bus Station", secondary_text: "Mfuwe, Zambia" } }] }
      : url.startsWith("/api/places/details")
      ? { result: { name: "Mfuwe Bus Station", formatted_address: "Mfuwe, Zambia", geometry: { location: { lat: -13.2549974, lng: 31.9326952 } }, types } }
      : {},
  })));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); db.inserted = []; });

async function pickStation(types: string[], onCardCreated = vi.fn(), dayId = "d23") {
  stubGoogle(types);
  await act(async () => {
    render(<CreateCardSheet dayId={dayId} tripId="c4e1a7b2" endPosition={2} onClose={() => {}} onCardCreated={onCardCreated} dayLabel="Mon 22 Feb" />);
  });
  fireEvent.change(await screen.findByPlaceholderText("Search saved places, or anywhere"), { target: { value: "mfuwe bus" } });
  fireEvent.click((await screen.findByText("Mfuwe Bus Station", {}, { timeout: 2000 })).closest("button")!);
  return onCardCreated;
}

describe("CreateCardSheet — a leg added by hand starts at last night's stay (7 Oct 2026)", () => {
  it("a station waits for Add, with From already set to Eureka Camping Park", async () => {
    const onCardCreated = await pickStation(["bus_station"]);
    const leg = await screen.findByTestId("new-leg");
    await waitFor(() => expect(leg.textContent).toContain("Eureka Camping Park"));
    expect(onCardCreated).not.toHaveBeenCalled();
    // From is set, so the four pills show, and none is picked (mock t05).
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Drive", "Bus", "Train", "Ferry"]);
    for (const r of radios) expect(r.getAttribute("aria-checked")).toBe("false");
  });

  it("with no stay the night before, only From shows; the pills wait until From is set (mock t05)", async () => {
    await pickStation(["bus_station"], vi.fn(), "d20");
    const leg = await screen.findByTestId("new-leg");
    expect(leg.textContent).toContain("Where you leave from");
    expect(screen.queryByRole("radio")).toBeNull();
    // Set it by search: the pills appear, still none picked.
    fireEvent.click(screen.getByRole("button", { name: "Set where this starts" }));
    fireEvent.change(screen.getByPlaceholderText("Search a town, station or port"), { target: { value: "mfuwe bus" } });
    const hit = await within(screen.getByTestId("leg-from-search")).findByText("Mfuwe Bus Station", {}, { timeout: 2000 });
    await act(async () => { fireEvent.click(hit.closest("button")!); });
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(4));
    for (const r of screen.getAllByRole("radio")) expect(r.getAttribute("aria-checked")).toBe("false");
  });

  it("Add works with no mode picked: the start is written, no mode is", async () => {
    const onCardCreated = await pickStation(["bus_station"]);
    const leg = await screen.findByTestId("new-leg");
    await waitFor(() => expect(leg.textContent).toContain("Eureka Camping Park"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add Mfuwe Bus Station" })); });
    await waitFor(() => expect(onCardCreated).toHaveBeenCalled());
    const details = db.inserted[0].details as Record<string, unknown>;
    expect(details.from).toEqual({ title: "Eureka Camping Park", lat: -15.5035103, lng: 28.2645026, place_id: "ee27ab67" });
    expect("mode" in details).toBe(false);
  });

  it("Add writes the start and the mode into the card's details", async () => {
    const onCardCreated = await pickStation(["bus_station"]);
    const leg = await screen.findByTestId("new-leg");
    await waitFor(() => expect(leg.textContent).toContain("Eureka Camping Park"));
    fireEvent.click(screen.getByRole("radio", { name: "Bus" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add Mfuwe Bus Station" })); });
    await waitFor(() => expect(onCardCreated).toHaveBeenCalled());
    const details = db.inserted[0].details as Record<string, unknown>;
    expect(details.from).toEqual({ title: "Eureka Camping Park", lat: -15.5035103, lng: 28.2645026, place_id: "ee27ab67" });
    expect(details.mode).toBe("bus");
  });

  it("the sheet's ✕ and the picked place's ✕ are 44px to the finger (7 Oct 2026, phone harness)", async () => {
    await pickStation(["bus_station"]);
    await screen.findByTestId("new-leg");
    const close = screen.getByRole("button", { name: "Close" });
    const closeT = screen.getByTestId("create-close-target");
    expect(closeT.parentElement).toBe(close);
    expect(close.className).toContain("relative ");
    expect(closeT.className).toContain("-inset-1"); // 36 + 4 + 4
    const clear = screen.getByRole("button", { name: "Clear selection" });
    const clearT = screen.getByTestId("create-clear-target");
    expect(clearT.parentElement).toBe(clear);
    expect(clear.className).toContain("relative ");
    expect(clearT.className).toContain("-inset-[10px]"); // 24 + 10 + 10
  });

  it("a restaurant still adds in one tap, with no start", async () => {
    const onCardCreated = await pickStation(["restaurant"]);
    await waitFor(() => expect(onCardCreated).toHaveBeenCalled());
    expect(screen.queryByTestId("new-leg")).toBeNull();
    expect((db.inserted[0].details as Record<string, unknown>).from).toBeUndefined();
  });
});
