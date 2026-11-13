import { describe, it, expect } from "vitest";
import { dayFlow, dropTown } from "./dayFlow";

// Tuscany Sat 28 Aug 2027 as the live rows hold it (12 Nov 2026).
type C = { id: string; start_time: string | null; end_time: string | null; leg?: boolean; dest?: string };
const SAT28: C[] = [
  { id: "drive", start_time: "08:00:00", end_time: "08:10:00", leg: true, dest: "Lucca station" },
  { id: "train", start_time: "08:25:00", end_time: "09:25:00", leg: true, dest: "Florence (Santa Maria Novella)" },
  { id: "david", start_time: "10:00:00", end_time: "11:15:00" },
  { id: "duomo", start_time: "11:30:00", end_time: "12:45:00" },
  { id: "pucci", start_time: "12:50:00", end_time: "13:05:00" },
  { id: "pino", start_time: "13:20:00", end_time: "14:05:00" },
  { id: "vivoli", start_time: "14:10:00", end_time: "14:40:00" },
  { id: "trainHome", start_time: "15:00:00", end_time: "16:20:00", leg: true, dest: "Lucca" },
  { id: "driveHome", start_time: "16:25:00", end_time: "16:40:00", leg: true, dest: "Villa Zambaldi" },
  { id: "dinner", start_time: "18:00:00", end_time: "19:00:00" },
];
const flow = (cards: C[]) => dayFlow(cards, (c) => !!c.leg, (c) => c.dest ?? "", ["Villa Zambaldi"]);
const shape = (cards: C[]) => flow(cards).map((i) => i.kind === "travel" ? `${i.leave ? "LEAVE " : ""}${i.ids.join("+")}→${i.dest}` : i.kind === "heading" ? `# ${i.text}` : i.card.id);

describe("dayFlow", () => {
  it("Sat 28: leave, In Florence, back, Back at the villa", () => {
    expect(shape(SAT28)).toEqual([
      "LEAVE drive+train→Florence",
      "# In Florence",
      "david", "duomo", "pucci", "pino", "vivoli",
      "trainHome+driveHome→Villa",
      "# Back at the villa",
      "dinner",
    ]);
  });

  it("a day with no travel is just its cards", () => {
    const quiet = SAT28.filter((c) => !c.leg);
    expect(shape(quiet)).toEqual(quiet.map((c) => c.id));
  });

  it("a drive after breakfast is not 'Leave'; nothing after the last leg means no heading", () => {
    const day: C[] = [
      { id: "coffee", start_time: "08:00:00", end_time: "08:30:00" },
      { id: "drive", start_time: "09:40:00", end_time: "10:40:00", leg: true, dest: "My Tuscan Kitchen" },
      { id: "class", start_time: "10:45:00", end_time: "13:15:00" },
      { id: "home", start_time: "13:30:00", end_time: "14:30:00", leg: true, dest: "Villa Zambaldi" },
    ];
    expect(shape(day)).toEqual(["coffee", "drive→My Tuscan Kitchen", "# In My Tuscan Kitchen", "class", "home→Villa"]);
  });

  it("the run's times span the whole run", () => {
    const t = flow(SAT28)[0];
    expect(t.kind === "travel" && [t.startMin, t.endMin]).toEqual([480, 565]);
  });
});

describe("dropTown", () => {
  it("drops the last part only when there is more than one", () => {
    expect(dropTown("Via Ricasoli, 58/60, Firenze")).toBe("Via Ricasoli, 58/60");
    expect(dropTown("Firenze")).toBe("Firenze");
    expect(dropTown(null)).toBeNull();
  });
});

describe("the phone day uses it", () => {
  it("CardTimeline draws travel lines and headings from dayFlow, and a joined line opens a sheet of its legs", async () => {
    const { readFileSync } = await import("node:fs");
    const t = readFileSync("src/components/day/CardTimeline.tsx", "utf8");
    expect(t).toContain("dayFlow(");
    expect(t).toContain('data-travel-line="1"');
    expect(t).toContain('data-testid="travel-sheet"');
    const m = readFileSync("src/components/day/DayMap.tsx", "utf8");
    expect(m).toMatch(/!isTravelLeg\(c\)/);
  });
});

describe("the trip map shows no travel", () => {
  it("FullMapClient's place check leaves travel legs out (no pin, so no line); the popup X always closes", async () => {
    const { readFileSync } = await import("node:fs");
    const f = readFileSync("src/components/map/FullMapClient.tsx", "utf8");
    expect(f).toMatch(/function isRealPlace[\s\S]{0,400}!isTravelLeg\(card\)/);
    const p = readFileSync("src/components/map/MapPinPopup.tsx", "utf8");
    expect(p).not.toContain("setPhotosOpen(false) : onClose()");
  });
});
