import { describe, it, expect } from "vitest";
import { cleanAgenda, agendaNotes, expandAgenda, expandAll, agendaLine, MAX_AGENDA_ITEMS } from "./agenda";
import type { ParsedConfirmation } from "./toCards";

const summit: ParsedConfirmation = {
  type: "activity", title: "Negotiation Mastery Summit 2027", confirmation_number: "NMS1",
  date: "2027-03-15", time: "07:30", end_time: null, address: "500 W Las Colinas Blvd, Irving, TX 75039",
  phone: null, website: null, notes: "Bring badge", total_paid: 900, paid_currency: "USD",
  agenda: [
    { date: "2027-03-15", start: "07:30", end: "17:00", items: [{ time: "07:30", title: "Breakfast and registration" }, { time: "13:00", title: "Group exercise" }] },
    { date: "2027-03-16", start: "7:30", end: "16:00", items: [{ time: "08:30", title: "Session: Bargaining with anchors" }] },
  ],
};

describe("a conference's agenda", () => {
  it("one booking per event day, that day's times, its schedule in the notes, the price on day 1", () => {
    const days = expandAgenda(summit);
    expect(days).toHaveLength(2);
    expect(days.map((d) => [d.date, d.time, d.end_time])).toEqual([["2027-03-15", "07:30", "17:00"], ["2027-03-16", "07:30", "16:00"]]);
    expect(days[0].notes).toBe("**Day 1 schedule**\n- 7:30 Breakfast and registration\n- 1:00 Group exercise\n\nBring badge");
    expect(days[1].notes).toBe("**Day 2 schedule**\n- 8:30 Session: Bargaining with anchors\n\nBring badge");
    expect(days.map((d) => d.address)).toEqual([summit.address, summit.address]);
    expect(days.map((d) => d.title)).toEqual([summit.title, summit.title]);
    expect(days[0].total_paid).toBe(900);
    expect(days[1].total_paid).toBeNull();
    expect(days.every((d) => !("agenda" in d))).toBe(true);
    expect(days[1].agenda_day).toEqual({ n: 2, of: 2, sessions: 1 });
  });

  it("no agenda: the booking comes back exactly as it was", () => {
    const hotel: ParsedConfirmation = { ...summit, type: "hotel", agenda: undefined };
    delete hotel.agenda;
    expect(expandAgenda(hotel)).toEqual([hotel]);
    expect(expandAgenda({ ...hotel, agenda: null })).toEqual([hotel]);
  });

  it("caps sessions per day and drops junk", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ time: "09:00", title: `S${i}` }));
    const out = cleanAgenda([{ date: "2027-03-15", start: "09:00", end: "17:00", items: [...many, { title: "" }, null] }, "junk", {}]);
    expect(out).toHaveLength(1);
    expect(out![0].items).toHaveLength(MAX_AGENDA_ITEMS);
    expect(cleanAgenda("nope")).toBeNull();
    expect(cleanAgenda([])).toBeNull();
  });

  it("carries each day's file index", () => {
    const { items, fileOf } = expandAll([{ ...summit, agenda: null }, summit], [0, 1]);
    expect(items).toHaveLength(3);
    expect(fileOf).toEqual([0, 1, 1]);
  });

  it("notes with no times and no extra note", () => {
    expect(agendaNotes(3, [{ time: null, title: "Close" }], null)).toBe("**Day 3 schedule**\n- Close");
  });

  it("the sheet's line reads like the mock", () => {
    expect(agendaLine("2027-03-15", "07:30", "17:00", 7)).toBe("Mon 15 Mar · 7:30 AM – 5:00 PM · 7 sessions");
    expect(agendaLine("2027-03-16", "07:30", "", 1)).toBe("Tue 16 Mar · 7:30 AM · 1 session");
  });
});
