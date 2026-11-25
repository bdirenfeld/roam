// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Card, DayWithCards, Trip } from "@/types/database";

/**
 * Journeys' booking marks open a journey's Bookings on the week (25 Nov 2026):
 * the link carries ?bookings=1, the week opens the sheet once and drops the
 * flag, so a reload does not open it again.
 */

const replace = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(query) }));
vi.mock("@/hooks/useCardNotes", () => ({ useCardNotes: () => {}, withNotes: (c: Card) => c, warmNotes: () => {} }));
vi.mock("@/components/day/EntryLine", () => ({ default: () => null }));
vi.mock("./WeekMap", () => ({ default: () => null }));
vi.mock("./DocumentsSheet", () => ({ default: ({ tripId }: { tripId: string }) => <div data-testid="bookings">{tripId}</div> }));
vi.mock("@/components/cards/CardBottomSheet", () => ({ default: () => null }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedUpdate: vi.fn(), queuedInsert: vi.fn(), queuedDelete: vi.fn() }));
vi.mock("@/components/trip/useBookingUpload", () => ({ useBookingUpload: () => ({ pick: vi.fn(), reading: false, element: null }) }));

import WeekBoard from "./WeekBoard";

const dates = Array.from({ length: 4 }, (_, i) => new Date(Date.UTC(2027, 2, 14 + i)).toISOString().slice(0, 10));
const days = dates.map((date, i) => ({ id: `d${i + 1}`, trip_id: "t", day_number: i + 1, date, theme: null, cards: [] as Card[] })) as unknown as DayWithCards[];
const trip = { id: "t", title: "Chris Voss Training", destination: "Irving, TX, USA", start_date: dates[0], end_date: dates[3] } as unknown as Trip;

afterEach(() => { cleanup(); replace.mockClear(); query = ""; });

describe("the week opened from Journeys' booking marks", () => {
  it("?bookings=1 opens Bookings for this journey and drops the flag", () => {
    query = "bookings=1";
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    expect(screen.getByTestId("bookings").textContent).toBe("t");
    expect(replace).toHaveBeenCalledWith("/trips/t/plan");
  });

  it("without the flag the week opens as it always did: no sheet, no redirect", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    expect(screen.queryByTestId("bookings")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
