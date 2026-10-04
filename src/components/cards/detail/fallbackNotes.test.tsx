// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Card } from "@/types/database";
import ActivityDetail from "./ActivityDetail";
import LogisticsDetail from "./LogisticsDetail";

// The fallback layouts (Shopping and other activity/logistics kinds without
// their own detail) printed Plan my trip's notes read-only: raw **Intent**,
// no line breaks, and no way to edit on the phone (Via Fillungo, 3 Oct 2026).
const note = "**Intent**\nLucca's main pedestrian street.\n\n**Know before you go**\n- Most shops close for a long lunch.";
const card = (type: string, sub: string) => ({ id: "c", details: { notes: note }, place: { type, sub_type: sub } }) as unknown as Card;

afterEach(cleanup);

describe("notes on the fallback card layouts", () => {
  for (const [name, Comp, type, sub] of [
    ["ActivityDetail", ActivityDetail, "activity", "shopping"],
    ["LogisticsDetail", LogisticsDetail, "logistics", "transit"],
  ] as const) {
    it(`${name}: headings bold, line breaks kept, tap to edit and it saves`, () => {
      const onSave = vi.fn();
      const { container } = render(<Comp card={card(type, sub)} onSaveDetails={onSave} />);
      expect(container.textContent).not.toContain("**");
      expect(screen.getByText("Intent").tagName).toBe("STRONG");
      const p = screen.getByText("Intent").closest("p")!;
      expect(p.className).toContain("whitespace-pre-wrap");
      fireEvent.click(p);
      const box = container.querySelector("textarea")!;
      fireEvent.change(box, { target: { value: "Shops shut 1 to 3:30." } });
      fireEvent.blur(box);
      expect(onSave).toHaveBeenCalledWith("notes", "Shops shut 1 to 3:30.");
    });
  }
});
