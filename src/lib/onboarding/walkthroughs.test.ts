import { describe, expect, it } from "vitest";
import { GROUPS, TOURS, TOUR_IDS, advance, fromTile, mergeRecords, onOpen, parseRecord, pickAnchor, statusLine, tourStepLabel, type TourState } from "./walkthroughs";

const s = (status: TourState["status"], step = 0, updatedAt = 1): TourState => ({ status, step, updatedAt });

describe("which walkthrough a screen gets", () => {
  it("starts the first time, unless the feature has already been used", () => {
    expect(onOpen(undefined, false)).toBe("start");
    expect(onOpen(undefined, true)).toBe("quiet-done");
  });
  it("picks one under way back up, and stays quiet once skipped or done", () => {
    expect(onOpen(s("underway", 1), true)).toBe("resume");
    expect(onOpen(s("skipped"), false)).toBe("none");
    expect(onOpen(s("done"), false)).toBe("none");
  });
});

describe("moving through a walkthrough", () => {
  it("steps forward and finishes on the last step", () => {
    expect(advance("budget", s("underway", 0), 5)).toEqual(s("underway", 1, 5));
    expect(advance("budget", s("underway", 2), 5)).toEqual(s("done", 2, 5));
    expect(advance("stays", s("underway", 1), 5).status).toBe("done");
  });
  it("the tile resumes one under way and replays a finished one from the top", () => {
    expect(fromTile(s("underway", 2), 9)).toEqual(s("underway", 2, 9));
    expect(fromTile(s("done", 2), 9)).toEqual(s("underway", 0, 9));
    expect(fromTile(s("skipped", 1), 9)).toEqual(s("underway", 0, 9));
    expect(fromTile(undefined, 9)).toEqual(s("underway", 0, 9));
  });
  it("numbers each step against its own walkthrough", () => {
    expect(tourStepLabel(0, TOURS.bookings.steps.length)).toBe("Step 1 of 2");
    expect(tourStepLabel(2, TOURS.day.steps.length)).toBe("Step 3 of 3");
  });
});

describe("the saved record", () => {
  it("keeps valid walkthroughs and drops anything malformed", () => {
    expect(parseRecord(null)).toEqual({});
    expect(parseRecord({ budget: s("done", 2), day: { status: "bogus", step: 0, updatedAt: 1 }, notes: s("underway", 9), nope: s("done") })).toEqual({ budget: s("done", 2) });
  });
  it("merges this device and the account walkthrough by walkthrough, newest wins", () => {
    expect(mergeRecords({ budget: s("done", 2, 5), day: s("underway", 1, 1) }, { budget: s("underway", 0, 3), day: s("skipped", 0, 4), notes: s("done", 2, 2) }))
      .toEqual({ budget: s("done", 2, 5), day: s("skipped", 0, 4), notes: s("done", 2, 2) });
  });
});

describe("the walkthroughs themselves", () => {
  it("every walkthrough has two or three steps, each with something to point at and words to say", () => {
    for (const id of TOUR_IDS) {
      expect(TOURS[id].id).toBe(id);
      expect(TOURS[id].steps.length).toBeGreaterThanOrEqual(2);
      expect(TOURS[id].steps.length).toBeLessThanOrEqual(3);
      for (const step of TOURS[id].steps) {
        expect(step.anchors.length).toBeGreaterThan(0);
        for (const a of step.anchors) { expect(a.selector).toBeTruthy(); expect(a.text.length).toBeLessThan(110); }
      }
    }
  });
  it("no two steps say the same thing", () => {
    const texts = TOUR_IDS.flatMap((id) => TOURS[id].steps.map((st) => st.anchors[0].text));
    expect(new Set(texts).size).toBe(texts.length);
  });
  it("points at the first anchor on screen, falling back in order", () => {
    const step = TOURS.budget.steps[0];
    expect(pickAnchor(step, (sel) => (sel.includes("budget-standard") ? "bar" : null))).toEqual({ el: "bar", text: "Tap Standard to see each cost." });
    expect(pickAnchor(step, () => "tick")?.text).toContain("Tick a cost");
    expect(pickAnchor(step, () => null)).toBeNull();
  });
});

describe("the Walkthroughs list", () => {
  it("every walkthrough sits in a group, with a one-line benefit and a way to its screen", () => {
    for (const id of TOUR_IDS) {
      expect(GROUPS).toContain(TOURS[id].group);
      expect(TOURS[id].benefit.length).toBeGreaterThan(10);
      expect(TOURS[id].benefit.length).toBeLessThan(70);
      expect(TOURS[id].door).toBeTruthy();
    }
    for (const g of GROUPS) expect(TOUR_IDS.some((id) => TOURS[id].group === g)).toBe(true);
  });
  it("says where each one stands", () => {
    expect(statusLine("budget", undefined)).toBe(TOURS.budget.benefit);
    expect(statusLine("budget", s("underway", 1))).toBe("Continue · Step 2 of 3");
    expect(statusLine("stays", s("underway", 0))).toBe("Continue · Step 1 of 2");
    expect(statusLine("notes", s("done", 2))).toBe("Done · Run it again");
    expect(statusLine("notes", s("skipped", 0))).toBe("Skipped · Run it again");
  });
  it("Next opens a fold only for a step that has one to open", () => {
    expect(TOURS.budget.steps[1].reveal).toBe('[data-walk="budget-standard"]');
    expect(TOURS.budget.steps[2].reveal).toBe('[data-walk="budget-additional"]');
    expect(TOURS.budget.steps[0].reveal).toBeUndefined();
  });
});
