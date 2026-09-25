import { describe, it, expect } from "vitest";
import { placeBlocks, movedTimes, resizedEnd, resizedStart, minutesAtY, toMin, toTime, fmt12, PX_PER_HOUR, NO_END_MIN, HOUR_START } from "./layout";

/**
 * Times copied from Rome April 2026 (24 Sep 2026): Friday has Historic Center
 * Wandering 12:00–16:30 and the Banco 19 check-in at 15:00 with no end;
 * Monday has Villa Borghese 09:00–11:30 and the massage 10:30–11:30.
 */
describe("placeBlocks", () => {
  it("puts a block at its hour and sizes it by its length", () => {
    const [b] = placeBlocks([{ id: "a", startMin: toMin("09:00:00"), endMin: toMin("11:30:00") }]);
    expect(b.top).toBe((9 - HOUR_START) * PX_PER_HOUR);
    expect(b.height).toBe(2.5 * PX_PER_HOUR - 3);
    expect(b.lanes).toBe(1);
  });
  it("draws a card with no end NO_END_MIN tall", () => {
    const [b] = placeBlocks([{ id: "banco", startMin: toMin("15:00:00"), endMin: null }]);
    expect(b.height).toBe((NO_END_MIN / 60) * PX_PER_HOUR - 3);
  });
  it("gives Friday's overlap two lanes, Monday's too, and leaves the rest alone", () => {
    const fri = placeBlocks([
      { id: "walk", startMin: toMin("12:00:00"), endMin: toMin("16:30:00") },
      { id: "banco", startMin: toMin("15:00:00"), endMin: null },
      { id: "cook", startMin: toMin("17:30:00"), endMin: toMin("20:30:00") },
    ]);
    const by = Object.fromEntries(fri.map((b) => [b.id, b]));
    expect(by.walk.lanes).toBe(2); expect(by.banco.lanes).toBe(2);
    expect(by.walk.lane).not.toBe(by.banco.lane);
    expect(by.cook.lanes).toBe(1);
    const mon = placeBlocks([
      { id: "villa", startMin: toMin("09:00:00"), endMin: toMin("11:30:00") },
      { id: "spa", startMin: toMin("10:30:00"), endMin: toMin("11:30:00") },
    ]);
    expect(mon.every((b) => b.lanes === 2)).toBe(true);
  });
  it("does not treat back-to-back as overlap", () => {
    const out = placeBlocks([
      { id: "a", startMin: toMin("07:00:00"), endMin: toMin("08:30:00") },
      { id: "b", startMin: toMin("08:30:00"), endMin: toMin("09:30:00") },
    ]);
    expect(out.every((b) => b.lanes === 1)).toBe(true);
  });
});

describe("moves and resizes", () => {
  it("a move keeps the duration and snaps to 30 minutes", () => {
    const r = movedTimes({ id: "x", startMin: toMin("10:20:00"), endMin: toMin("11:20:00") }, 13 * 60 + 7);
    expect(r).toEqual({ start: "13:00:00", end: "14:00:00" });
  });
  it("a move of a no-end card stays no-end", () => {
    const r = movedTimes({ id: "x", startMin: toMin("15:00:00"), endMin: null }, 9 * 60 + 22);
    expect(r).toEqual({ start: "09:30:00", end: null });
  });
  it("a resize never ends within 30 minutes of the start", () => {
    expect(resizedEnd({ id: "x", startMin: toMin("09:00:00"), endMin: toMin("11:00:00") }, 9 * 60 + 5)).toBe("09:30:00");
    expect(resizedEnd({ id: "x", startMin: toMin("09:00:00"), endMin: toMin("11:00:00") }, 12 * 60 + 8)).toBe("12:00:00");
  });

  it("drags the start earlier or later, snapped, 30 minutes from the end at most", () => {
    const b = { id: "x", startMin: toMin("09:00:00"), endMin: toMin("11:00:00") };
    expect(resizedStart(b, 8 * 60 + 7)).toBe("08:00:00");
    expect(resizedStart(b, 10 * 60 + 50)).toBe("10:30:00");
    expect(resizedStart(b, 5 * 60)).toBe("07:00:00");
    expect(resizedStart({ id: "y", startMin: toMin("09:00:00"), endMin: null }, 12 * 60 + 20)).toBe("12:30:00");
  });
  it("maps grid pixels back to snapped minutes inside the drawn hours", () => {
    expect(minutesAtY(0)).toBe(HOUR_START * 60);
    expect(minutesAtY(PX_PER_HOUR * 3 + 10)).toBe(HOUR_START * 60 + 180);
    expect(minutesAtY(-500)).toBe(HOUR_START * 60);
  });
  it("round-trips the stored time shape", () => {
    expect(toTime(toMin("18:45:00"))).toBe("18:45:00");
    expect(fmt12(toMin("18:45:00"))).toBe("6:45pm");
    expect(fmt12(toMin("12:00:00"))).toBe("12pm");
  });
});
