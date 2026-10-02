import { describe, it, expect } from "vitest";
import { cleanNote, foldNote } from "./sharedNote";

// Notes as stored (cards.details.notes, 2 Oct 2026).
const forno = "**Intent**\nA historic Lucca bakery famous for buccellato, a local anise-and-raisin sweet bread sold by the slice or whole loaf.\n\n**Know before you go**\n- Buccellato is the thing to buy here; it is a mild, lightly sweet bread that children generally accept well.\n- It is a small shop and can get busy mid-morning; go early or off-peak.\n- Cash is commonly preferred in small Lucchese bakeries; carry euros.\n- Open 8:00 AM – 7:00 PM that day";
const zita = "**Intent**\nA small café and biscuit shop on Piazza San Frediano selling traditional Lucchese biscuits and coffee in a quiet square.\n\n**Know before you go**\n- The shop is known for traditional biscotti and local sweet pastries.\n- I have limited verified operational detail for this specific place beyond its name and location; confirm opening days locally on arrival.\n- Open 7:30 AM – 7:30 PM that day";
const shodai = "**Intent**\nA small, focused restaurant in Ebisu; from the name and location it appears to be a Japanese dining spot worth visiting for quality cooking.\n\n**Know before you go**\n- I cannot verify specific details about Shodai with confidence; confirm opening days and reservation requirements before going.\n- Open 11:30 AM – 9:30 PM that day";
const mario = "Florence, since 1953. Google 4.6 (4,600). Lunch only, no bookings, communal tables, cash. Arrive before 12 or queue. Ribollita, bistecca, the tripe.\n\nTikTok: current Trattoria Mario videos, the queue and the meat brought to the table.";

describe("the shared page's notes", () => {
  it("shows Plan my trip's first sentence, without the Intent heading, and the bullets behind more", () => {
    const f = foldNote(forno);
    expect(f.lead).toBe("A historic Lucca bakery famous for buccellato, a local anise-and-raisin sweet bread sold by the slice or whole loaf.");
    expect(f.rest.startsWith("Know before you go\n• Buccellato")).toBe(true);
    expect(f.rest).toContain("• Cash is commonly preferred in small Lucchese bakeries; carry euros.");
    expect(`${f.lead}${f.rest}`).not.toMatch(/Intent|\*\*/);
  });

  it("drops the planner talking about itself, and leaves no gap where it was", () => {
    const z = cleanNote(zita);
    expect(z).not.toMatch(/I have limited/);
    expect(z).toContain("• The shop is known for traditional biscotti and local sweet pastries.\n• Open 7:30 AM");
    expect(cleanNote(shodai)).not.toMatch(/I cannot verify/);
    expect(cleanNote(shodai)).toContain("• Open 11:30 AM – 9:30 PM that day");
    // Not a bullet: the line goes with its line break.
    expect(cleanNote("Book the 10 am slot.\nI could not confirm the price.\nBring water.")).toBe("Book the 10 am slot.\nBring water.");
  });

  it("keeps a line that only starts with an I-word", () => {
    expect(cleanNote("- Ice cream next door\n- In August, book ahead")).toBe("• Ice cream next door\n• In August, book ahead");
  });

  it("a note in Brennan's own short style shows enough to say something", () => {
    const m = foldNote(mario);
    expect(m.lead).toBe("Florence, since 1953. Google 4.6 (4,600). Lunch only, no bookings, communal tables, cash.");
    expect(m.rest).toBe("Arrive before 12 or queue. Ribollita, bistecca, the tripe.\n\nTikTok: current Trattoria Mario videos, the queue and the meat brought to the table.");
  });

  it("a short note is shown whole, with nothing behind more", () => {
    expect(foldNote("Bring cash.")).toEqual({ lead: "Bring cash.", rest: "" });
    expect(foldNote("Kids eat free before 6 pm on weekdays, so we go early.")).toEqual({ lead: "Kids eat free before 6 pm on weekdays, so we go early.", rest: "" });
  });

  it("does not stop at an abbreviation or a decimal", () => {
    const f = foldNote("We take the long flat path around the 4.2 km walls and then up toward St. Peter's for the view. Then the gardens open at nine.");
    expect(f.lead).toBe("We take the long flat path around the 4.2 km walls and then up toward St. Peter's for the view.");
    expect(f.rest).toBe("Then the gardens open at nine.");
  });
});
