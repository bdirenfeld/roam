// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

/**
 * Settings, rendered. Until 23 Sep 2026 it had a Save button, and closing with
 * × threw every edit away without a word. It now saves as you go.
 */

const updates: { table: string; values: Record<string, unknown> }[] = [];
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: () => { updates.push({ table, values }); return Promise.resolve({ error: null }); },
      }),
      select: () => ({ in: () => Promise.resolve({ count: 0 }), eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@phosphor-icons/react", () => ({ Camera: () => null }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/share-actions", () => ({
  createShareLink: vi.fn(), revokeShareLink: vi.fn(), removeGuest: vi.fn(),
  loadShareState: vi.fn(() => Promise.resolve({ shareAvailable: true, shareToken: null, guests: [], invites: [] })),
}));
vi.mock("./EntrySection", () => ({ default: () => null }));
vi.mock("@/components/trip/TravellersSection", () => ({ default: () => null }));

import TripSettingsClient from "./TripSettingsClient";
import type { Trip, Day } from "@/types/database";

const trip = {
  id: "t1", title: "Tuscany", destination: "Tuscany, Italy", start_date: "2027-08-24", end_date: "2027-09-04",
  party_size: 7, cover_image_url: null, share_token: null,
} as unknown as Trip;

// Tuscany is twelve days; with the days matching the dates nothing but the trip row is written.
const days = Array.from({ length: 12 }, (_, i) => ({ id: `d${i + 1}`, day_number: i + 1 })) as unknown as Day[];

beforeEach(() => { updates.length = 0; vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

function open(props: Record<string, unknown> = {}) {
  return render(
    <TripSettingsClient trip={trip} days={days} initialPeople={[]} initialShareToken={null}
      initialGuests={[]} shareAvailable={false} variant="overlay" {...props} />,
  );
}

describe("Settings saves as you go", () => {
  it("has no Save button", () => {
    open();
    expect(screen.queryByRole("button", { name: /^Save$/ })).toBeNull();
  });

  it("writes a change a moment after typing stops", async () => {
    open();
    fireEvent.change(screen.getByDisplayValue("Tuscany"), { target: { value: "Tuscany 2027" } });
    expect(updates).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(updates.at(-1)).toMatchObject({ table: "trips", values: { title: "Tuscany 2027" } });
  });

  it("closing straight away still saves the change", async () => {
    const onSaved = vi.fn(), onDismiss = vi.fn();
    open({ onSaved, onDismiss });
    fireEvent.change(screen.getByDisplayValue("Tuscany"), { target: { value: "Tuscany!" } });
    await act(async () => { fireEvent.click(screen.getByLabelText("Close")); });
    expect(updates.at(-1)).toMatchObject({ values: { title: "Tuscany!" } });
    expect(onSaved).toHaveBeenCalled();
  });

  it("closing with nothing changed writes nothing", async () => {
    const onDismiss = vi.fn();
    open({ onDismiss });
    await act(async () => { fireEvent.click(screen.getByLabelText("Close")); });
    expect(updates).toHaveLength(0);
    expect(onDismiss).toHaveBeenCalled();
  });
});
