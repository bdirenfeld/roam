import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// The phone Plan board keeps each day in clock order (27 Sep 2026). The rule
// itself is tested in lib/agendaOrder; this checks the board routes every
// write of its days through it, and that a drag persists the ordered days.
const board = readFileSync("src/components/plan/PlanBoard.tsx", "utf8");

describe("the Plan board orders each day by time", () => {
  it("every setDays goes through orderDays", () => {
    expect(board).toMatch(/useState<DayWithCards\[\]>\(\(\) => orderDays\(initialDays\)\)/);
    expect(board).toMatch(/setDaysRaw\(\(prev\) => orderDays\(/);
    expect(board).not.toMatch(/const \[days, setDays\] = useState/);
  });
  it("a drag within a day persists the ordered days, not the raw drop", () => {
    expect(board.match(/finalDays = orderDays\(finalDays\);/g)?.length).toBe(2);
  });
});
