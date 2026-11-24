// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/sampleTrip/actions", () => ({ createSampleJourney: vi.fn() }));
vi.mock("@/components/overlays/AppOverlays", () => ({ NewJourneyLink: ({ children }: { children: React.ReactNode }) => <a href="/trips/new">{children}</a> }));
vi.mock("@/components/ui/TripCard", () => ({ default: ({ trip }: { trip: { title: string } }) => <div data-testid="trip-card">{trip.title}</div> }));
vi.mock("@/components/ui/TripCover", () => ({ default: () => <div /> }));
vi.mock("@/components/videos/FirstJourneyVideo", () => ({ default: () => null }));

import FirstScreen from "./FirstScreen";

afterEach(cleanup);

describe("the first screen", () => {
  it("offers planning first, then the example", () => {
    render(<FirstScreen sample={null} free />);
    expect(screen.getByText("Plan a journey").closest("a")).toHaveAttribute("href", "/trips/new");
    expect(screen.getByText("Your first journey is free.")).toBeInTheDocument();
    expect(screen.getByTestId("sample-tile")).toHaveTextContent("ExampleParis and Normandy8 days · Look around");
  });

  it("shows the example as a normal card once it is built, so it can be deleted", () => {
    render(<FirstScreen sample={{ title: "Sample trip — look around" } as never} free />);
    expect(screen.getByTestId("trip-card")).toBeInTheDocument();
    expect(screen.queryByTestId("sample-tile")).toBeNull();
  });

  it("does not tell someone who has paid that the first is free", () => {
    render(<FirstScreen sample={null} free={false} />);
    expect(screen.queryByText("Your first journey is free.")).toBeNull();
  });
});
