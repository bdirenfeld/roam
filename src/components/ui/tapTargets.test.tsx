// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { readFileSync } from "node:fs";

/**
 * Finger-sized tap areas, no visual change (6 Oct 2026, taps audit). The
 * technique is the time chip's (CardSurface): an aria-hidden, absolutely
 * positioned span with a negative inset, inside a `relative` control, so a
 * near-miss still lands on the control. These render a few of them and tap
 * the span itself; the rest are read from source, since a target is only
 * worth having if it is inside its control and never on a neighbour's.
 */

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <span data-alt={p.alt} /> }));
vi.mock("@/components/search/GlobalSearch", async (orig) => ({ ...(await orig<object>()), useGlobalSearch: () => ({ open: vi.fn() }) }));
vi.mock("@/components/overlays/AppOverlays", () => ({
  NewJourneyLink: ({ children, className, ariaLabel }: { children: React.ReactNode; className?: string; ariaLabel?: string }) => <a href="/trips/new" className={className} aria-label={ariaLabel}>{children}</a>,
  ProfileLink: ({ children, className, ariaLabel }: { children: React.ReactNode; className?: string; ariaLabel?: string }) => <a href="/profile" className={className} aria-label={ariaLabel}>{children}</a>,
}));

import { ToastProvider, useToast } from "./Toast";
import AppHeader from "./AppHeader";
import PartyPicker from "@/components/trip/PartyPicker";

afterEach(cleanup);

/** The span is a hidden child of the control, positioned, with a negative inset. */
function expectTarget(target: HTMLElement, control: HTMLElement) {
  expect(target.getAttribute("aria-hidden")).toBe("true");
  expect(target.parentElement).toBe(control);
  expect(target.className).toMatch(/\babsolute\b/);
  expect(target.className).toMatch(/-inset|-top|-left/);
  expect(control.className).toMatch(/\brelative\b/);
  // Empty, so the control's name and look do not change.
  expect(target.textContent).toBe("");
}

describe("finger-sized tap areas (6 Oct 2026, taps audit)", () => {
  it("the toast's Undo: a tap on its wider area undoes, and the area stays inside the toast", async () => {
    const undo = vi.fn();
    function Fire() { const { toast } = useToast(); return <button onClick={() => toast({ message: "Taken off Fri · still on your map", undo })}>go</button>; }
    render(<ToastProvider><Fire /></ToastProvider>);
    fireEvent.click(screen.getByText("go"));
    const button = screen.getByRole("button", { name: "Undo" });
    const target = screen.getByTestId("undo-target");
    expectTarget(target, button);
    // Never past the toast's 6px padding onto the page under it.
    expect(target.className).toContain("-inset-y-1.5");
    expect(target.className).toContain("-right-1.5");
    await act(async () => { fireEvent.click(target); });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("the traveller steppers: a tap beside the − still counts, and the first row does not grow into the Travellers row", () => {
    const onChange = vi.fn();
    render(<PartyPicker party={{ adults: 2, seniors: 1, kids: [] }} onChange={onChange} labelClass="" />);
    fireEvent.click(screen.getByRole("button", { name: /Travellers/ }));
    const fewer = screen.getByLabelText("Fewer adults");
    const target = fewer.querySelector("span[aria-hidden='true']") as HTMLElement;
    expectTarget(target, fewer);
    expect(target.className).toContain("top-0");
    expect(target.className).not.toContain("-top-");
    fireEvent.click(target);
    expect(onChange).toHaveBeenLastCalledWith({ adults: 1, seniors: 1, kids: [] });
    // The next rows grow 5px up, inside the 10px between them.
    expect((screen.getByLabelText("Fewer kids").querySelector("span[aria-hidden='true']") as HTMLElement).className).toContain("-top-[5px]");
  });

  it("the Journeys header: search, + and the avatar each carry one, the avatar's outside its clipped circle", () => {
    render(<AppHeader showNewTrip />);
    expectTarget(screen.getByTestId("search-target"), screen.getByRole("button", { name: "Search" }));
    expectTarget(screen.getByTestId("new-journey-target"), screen.getByRole("link", { name: "Plan a journey" }));
    const profile = screen.getByRole("link", { name: "Profile" });
    const target = screen.getByTestId("profile-target");
    expectTarget(target, profile);
    // Half the 8px gap sideways, so neighbours never overlap.
    for (const id of ["search-target", "new-journey-target", "profile-target"]) expect(screen.getByTestId(id).className).toContain("-inset-x-1");
  });

  it("every listed control has its target, and the tight ones are held back", () => {
    const src = (p: string) => readFileSync(p, "utf8");
    const find = src("src/components/plan/FindSheet.tsx");
    expect(find).toMatch(/data-testid="find-close-target"/);
    expect(find).toMatch(/data-testid="find-save-target" className="absolute -inset-1\.5"/);
    // Chips: half their 6px gap, no more.
    expect(find.match(/className="absolute -inset-\[3px\]"/g)?.length).toBe(2);
    const sheet = src("src/components/cards/CardBottomSheet.tsx");
    expect(sheet.match(/className=\{DISC_TARGET\}/g)?.length).toBe(6);
    expect(sheet).toMatch(/const DISC_TARGET = "absolute -inset-x-\[3px\] -inset-y-2"/);
    expect(sheet).toMatch(/data-testid="sheet-close-target"/);
    const pin = src("src/components/map/MapPinPopup.tsx");
    expect(pin).toMatch(/data-testid="pin-close-target" className="absolute -top-2 -right-2 -bottom-2 -left-1"/);
    expect(pin).toMatch(/data-testid="pin-heart-target"/);
    const map = src("src/components/map/FullMapClient.tsx");
    expect(map.match(/className=\{CHIP_TARGET\}/g)?.length).toBe(3);
    expect(map).toMatch(/data-testid="pick-close-target"/);
    expect(src("src/components/trip/EstimateClient.tsx")).toMatch(/data-testid="include-target" className="absolute -inset-3"/);
    const day = src("src/components/day/DayViewClient.tsx");
    expect(day).toMatch(/data-testid="date-target"/);
    expect(day).toMatch(/data-testid="weather-target"/);
    const week = src("src/components/plan/WeekBoard.tsx");
    expect(week).toMatch(/data-testid="week-prev-target" className="absolute -inset-y-3 -left-\[5px\] -right-px"/);
    expect(week).toMatch(/data-testid="week-next-target" className="absolute -inset-y-3 -left-px -right-\[5px\]"/);
  });
});
