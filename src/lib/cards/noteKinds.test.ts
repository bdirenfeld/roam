import { describe, it, expect } from "vitest";
import { NOTE_KINDS, noteKind, convertedDetails } from "./noteKinds";
import { isTravelLeg, iconSubType } from "@/lib/travel/leg";
import { materialFontUrl } from "@/lib/mapPins";

/**
 * A note becomes a card (10 Nov 2026). The fixture is the live Tuscany note
 * "Drive to My Tuscan Kitchen, Montefoscoli (~1 h)" as it sat on Thu 2 Sep
 * before it became a leg by hand: place_id null, a title, no mode.
 */
const VILLA = { title: "Villa Zambaldi", lat: 43.8298808, lng: 10.4497198, place_id: "villa-place" };
const noteDetails = { title: "Drive to My Tuscan Kitchen, Montefoscoli (~1 h)", notes: "About an hour." };
// My Tuscan Kitchen as the live places row holds it: an activity, not transit.
const mtk = { type: "activity", sub_type: "guided", title: "My Tuscan Kitchen", lat: 43.5844149, lng: 10.7564421 };

describe("NOTE_KINDS — the dropdown", () => {
  it("offers the seven kinds in the approved order", () => {
    expect(NOTE_KINDS.map((k) => k.label)).toEqual(["Note", "Activity", "Food", "Hotel", "Drive", "Train", "Flight"]);
  });
  it("every glyph is in the font subset, or it would show as a word", () => {
    const url = materialFontUrl();
    for (const k of NOTE_KINDS) expect(url, k.glyph).toContain(k.glyph);
  });
  it("only Note has no place prompt", () => {
    expect(NOTE_KINDS.filter((k) => !k.prompt).map((k) => k.key)).toEqual(["note"]);
  });
});

describe("convertedDetails", () => {
  it("Drive keeps the notes, drops the note title, and becomes a leg from last night's stay", () => {
    const d = convertedDetails(noteDetails, noteKind("drive"), VILLA);
    expect(d).toEqual({ notes: "About an hour.", mode: "drive", from: VILLA });
    // …and the app now treats it as a leg with a car, though the place is an activity.
    const card = { start_time: "09:40:00", end_time: "10:40:00", details: d, place: mtk };
    expect(isTravelLeg(card)).toBe(true);
    expect(iconSubType(card)).toBe("leg_drive");
  });
  it("Drive with no known stay still gets the mode, and waits for a start", () => {
    const d = convertedDetails(noteDetails, noteKind("drive"), null);
    expect(d.mode).toBe("drive");
    expect(d.from).toBeUndefined();
    expect(isTravelLeg({ start_time: "09:40:00", end_time: "10:40:00", details: d, place: mtk })).toBe(false);
  });
  it("Food or Activity never carries a stale leg", () => {
    const d = convertedDetails({ ...noteDetails, mode: "drive", from: VILLA, mode_label: "Van" }, noteKind("food"), VILLA);
    expect(d).toEqual({ notes: "About an hour." });
  });
  it("keeps a checklist and anything else on the note", () => {
    const checklist = [{ id: "a", text: "Bring aprons", done: false }];
    expect(convertedDetails({ ...noteDetails, checklist, recommended_by: "Rita" }, noteKind("activity"), null))
      .toEqual({ notes: "About an hour.", checklist, recommended_by: "Rita" });
  });
});

describe("type now, place later (10 Nov 2026)", () => {
  it("withNoteKind saves the kind on the note and Note clears it", async () => {
    const { withNoteKind, readNoteKind } = await import("./noteKinds");
    const food = withNoteKind({ title: "Dinner in Lucca", notes: "Early." }, "food");
    expect(food).toEqual({ title: "Dinner in Lucca", notes: "Early.", kind: "food" });
    expect(readNoteKind(food)?.label).toBe("Food");
    expect(readNoteKind(food)?.cardType).toBe("food");
    const back = withNoteKind(food, "note");
    expect(back).toEqual({ title: "Dinner in Lucca", notes: "Early." });
    expect(readNoteKind(back)).toBeNull();
  });
  it("a junk kind reads as no kind", async () => {
    const { readNoteKind } = await import("./noteKinds");
    expect(readNoteKind({ kind: "spaceship" })).toBeNull();
    expect(readNoteKind({ kind: 7 })).toBeNull();
    expect(readNoteKind(null)).toBeNull();
  });
  it("adding the place later drops the stored kind (the place says what it is)", () => {
    const d = convertedDetails({ title: "Dinner in Lucca", kind: "food", notes: "Early." }, noteKind("food"), null);
    expect(d).toEqual({ notes: "Early." });
  });
});
