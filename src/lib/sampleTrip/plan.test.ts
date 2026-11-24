import { describe, expect, it } from "vitest";
import places from "./places.json";
import { P, SAMPLE_DAYS, SAMPLE_INTERESTED, SAMPLE_TITLE } from "./itinerary";
import { addDays, buildSample, onlySample, sampleStart, type SamplePlace } from "./plan";
import { flightPass } from "@/lib/flights/pass";
import { rentalVoucher } from "@/lib/cars/voucher";
import { isTravelLeg } from "@/lib/travel/leg";
import { readRecommendedBy, recommendedLink } from "@/lib/recommendedBy";

type Row = SamplePlace & { sub_type: string; type: string; hours?: { weekday_text?: string[] } | null };
type Card = { id: string; day_id: string | null; place_id: string | null; start_time: string | null; end_time: string | null; confirmed: boolean; position: number; source_url: string | null; details: Record<string, unknown> };
type Place = { title: string; type: string; sub_type: string; lat: number; lng: number };

const snapshot = places as unknown as Row[];
let n = 0;
const build = () =>
  buildSample({
    userId: "u",
    today: new Date("2026-11-24T12:00:00Z"),
    newId: () => `id${n++}`,
    placeId: new Map(snapshot.map((p) => [p.google_place_id, `pl-${p.google_place_id}`])),
    snapshot,
  });
const withPlace = (rows: ReturnType<typeof build>) => {
  const byId = new Map<string, Place>();
  for (const p of snapshot) byId.set(`pl-${p.google_place_id}`, p);
  for (const p of rows.legPlaces) byId.set(p.id as string, p as unknown as Place);
  return (rows.cards as unknown as Card[]).map((c) => ({ ...c, place: c.place_id ? byId.get(c.place_id)! : null }));
};

describe("the sample journey's dates", () => {
  it("start on the first Thursday of the next June a month away", () => {
    expect(sampleStart(new Date("2026-11-24T12:00:00Z"))).toBe("2027-06-03");
    expect(sampleStart(new Date("2027-04-20T12:00:00Z"))).toBe("2027-06-03");
    expect(sampleStart(new Date("2027-05-20T12:00:00Z"))).toBe("2028-06-01");
  });

  it("always fall on a Thursday", () => {
    for (let i = 0; i < 1500; i += 13) {
      const s = sampleStart(new Date(Date.UTC(2026, 10, 24 + i)));
      expect(new Date(`${s}T12:00:00Z`).getUTCDay()).toBe(4);
    }
  });

  it("cross a month", () => expect(addDays("2027-06-29", 3)).toBe("2027-07-02"));
});

describe("the sample journey", () => {
  const rows = build();
  const cards = withPlace(rows);
  const dayOf = new Map(rows.days.map((d) => [d.id, d.date]));

  it("uses only places in the snapshot, and the snapshot carries nobody's account", () => {
    const gids = new Set(snapshot.map((p) => p.google_place_id));
    for (const gid of Object.values(P)) expect(gids.has(gid)).toBe(true);
    for (const p of snapshot) expect(p).not.toHaveProperty("user_id");
  });

  it("has eight days, contiguous positions and every place pinned", () => {
    expect(rows.days).toHaveLength(8);
    for (const d of rows.days) {
      expect(cards.filter((c) => c.day_id === d.id).map((c) => c.position)).toEqual(SAMPLE_DAYS[d.day_number - 1].map((_, i) => i + 1));
    }
    for (const c of cards) if (c.place) expect(Number.isFinite(c.place.lat) && Number.isFinite(c.place.lng)).toBe(true);
    expect(cards.filter((c) => !c.day_id)).toHaveLength(SAMPLE_INTERESTED.length);
  });

  it("starts every stop on the hour or half hour, in order", () => {
    for (const day of SAMPLE_DAYS) {
      const starts = day.map((c) => c.startTime!);
      expect([...starts].sort()).toEqual(starts);
      for (const s of starts) expect(["00", "30"]).toContain(s.slice(3));
    }
  });

  it("puts nothing on a day it is closed", () => {
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let checked = 0;
    for (const c of cards) {
      const date = c.day_id ? dayOf.get(c.day_id) : null;
      const row = snapshot.find((p) => `pl-${p.google_place_id}` === c.place_id);
      if (!date || !row) continue;
      const line = row.hours?.weekday_text?.find((t) => t.startsWith(names[new Date(`${date}T12:00:00Z`).getUTCDay()]));
      if (!line) continue;
      checked++;
      expect(`${row.title} ${line}`).not.toMatch(/Closed/);
    }
    expect(checked).toBeGreaterThan(15);
  });

  it("shows both flights with their length", () => {
    const flights = cards.filter((c) => c.place?.sub_type === "flight_arrival");
    expect(flights).toHaveLength(2);
    const [out, home] = flights.map((c) => flightPass(c, dayOf.get(c.day_id!)!));
    expect(out).toMatchObject({ minutes: 420, nextDay: true });
    expect(home).toMatchObject({ minutes: 495, nextDay: false });
  });

  it("pairs the rental car's pick-up with its return", () => {
    const list = cards.filter((c) => c.place?.sub_type === "car_rental").map((card) => ({ card, date: dayOf.get(card.day_id!)! }));
    expect(list).toHaveLength(2);
    expect(rentalVoucher(list[0].card, list[0].date, list)).toMatchObject({ side: "pickup", days: 2, company: "Hertz", confirmation: "EXAMPLE6" });
  });

  it("draws every train and drive as a leg", () => {
    const legs = cards.filter((c) => c.details.from);
    expect(legs).toHaveLength(9);
    for (const c of legs) expect(isTravelLeg(c as never)).toBe(true);
  });

  it("checks in and out of two hotels with no gap", () => {
    const stays = cards.filter((c) => c.place?.sub_type === "hotel").map((c) => [dayOf.get(c.day_id!), c.details.check_out]);
    expect(stays).toEqual([[rows.days[1].date, rows.days[5].date], [rows.days[5].date, rows.days[7].date]]);
  });

  it("puts every kind of pin on the map", () => {
    const kinds = new Set(cards.map((c) => c.place?.sub_type).filter(Boolean));
    for (const k of [
      "hotel", "flight_arrival", "transit", "car_rental", "grocery", "pharmacy", "medical", "hospital",
      "restaurant", "coffee", "bakery", "dessert", "bar", "market",
      "museum", "park", "beach", "hike", "zoo", "theme_park", "event", "wellness", "shopping", "guided", "self_directed",
    ]) expect([...kinds]).toContain(k);
  });

  it("shows who recommended a place, and the TikTok behind it", () => {
    expect(new Set(cards.map((c) => readRecommendedBy(c.details)).filter(Boolean))).toEqual(new Set(["Sarah", "Uncle Mike", "TikTok"]));
    const links = cards.map((c) => recommendedLink(c.source_url)).filter(Boolean);
    expect(links).toHaveLength(4);
    for (const l of links) expect(l!.host).toBe("tiktok.com");
  });

  it("marks every confirmation as an example", () => {
    for (const c of cards) if (c.details.confirmation) expect(String(c.details.confirmation)).toMatch(/^EXAMPLE/);
  });
});

describe("onlySample", () => {
  it("is true with nothing, or nothing but the example", () => {
    expect(onlySample([])).toBe(true);
    expect(onlySample([{ title: SAMPLE_TITLE }])).toBe(true);
    expect(onlySample([{ title: SAMPLE_TITLE }, { title: "Rome" }])).toBe(false);
  });
});
