import { describe, it, expect } from "vitest";
import { extendJourney } from "./extendJourney";

/** A fake of the four Supabase calls extendJourney makes, recording each write. */
function fakeDb(days: { id: string; date: string; day_number: number; day_name?: string }[], fail?: string) {
  const writes: { table: string; op: string; row: unknown; id?: string }[] = [];
  let rows = days.map((d) => ({ day_name: `Day ${d.day_number}`, ...d }));
  const db = {
    from: (table: string) => ({
      select: () => ({
        eq: () => {
          const res = Promise.resolve({ data: [...rows].sort((a, b) => a.day_number - b.day_number), error: null });
          return Object.assign(res, { order: () => res });
        },
      }),
      update: (row: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          if (fail === `${table}.update`) return { error: { message: "no" } };
          writes.push({ table, op: "update", row, id });
          if (table === "days") rows = rows.map((r) => (r.id === id ? { ...r, ...row } as typeof r : r));
          return { error: null };
        },
      }),
      insert: async (list: typeof rows) => {
        if (fail === `${table}.insert`) return { error: { message: "no" } };
        writes.push({ table, op: "insert", row: list });
        rows = [...rows, ...list];
        return { error: null };
      },
    }),
  };
  return { db, writes };
}

const tuscany = [
  { id: "d1", date: "2027-08-24", day_number: 1 },
  { id: "d2", date: "2027-08-25", day_number: 2 },
];

describe("extendJourney", () => {
  it("adds a day before the start, renumbers the rest, and moves the trip's dates", async () => {
    const { db, writes } = fakeDb(tuscany);
    const out = await extendJourney(db, "t1", "2027-08-23", "2027-08-25");
    expect(writes[0]).toMatchObject({ table: "trips", row: { start_date: "2027-08-23", end_date: "2027-08-25" }, id: "t1" });
    expect(writes.filter((w) => w.table === "days" && w.op === "update").map((w) => [w.id, (w.row as { day_number: number }).day_number])).toEqual([["d1", 2], ["d2", 3]]);
    if (!("days" in out)) throw new Error("expected days");
    expect(out.days.map((d) => [d.date, d.day_number])).toEqual([["2027-08-23", 1], ["2027-08-24", 2], ["2027-08-25", 3]]);
    expect(out.days[0].day_name).toBe("Day 1");
    // Existing days keep their ids, so their plans stay put.
    expect(out.days.slice(1).map((d) => d.id)).toEqual(["d1", "d2"]);
  });

  it("adds days after the end without touching the others", async () => {
    const { db, writes } = fakeDb(tuscany);
    const out = await extendJourney(db, "t1", "2027-08-24", "2027-08-27");
    expect(writes.filter((w) => w.op === "update" && w.table === "days")).toHaveLength(0);
    if (!("days" in out)) throw new Error("expected days");
    expect(out.days.map((d) => d.date)).toEqual(["2027-08-24", "2027-08-25", "2027-08-26", "2027-08-27"]);
  });

  it("refuses a range that would remove a day, writing nothing", async () => {
    const { db, writes } = fakeDb(tuscany);
    expect(await extendJourney(db, "t1", "2027-08-25", "2027-08-26")).toEqual({ error: "Couldn't change the trip's dates. Try again." });
    expect(writes).toHaveLength(0);
  });

  it("says so when a write is refused", async () => {
    const { db } = fakeDb(tuscany, "days.insert");
    expect(await extendJourney(db, "t1", "2027-08-23", "2027-08-25")).toHaveProperty("error");
    const { db: db2, writes } = fakeDb(tuscany, "trips.update");
    expect(await extendJourney(db2, "t1", "2027-08-23", "2027-08-25")).toHaveProperty("error");
    expect(writes).toHaveLength(0);
  });
});
