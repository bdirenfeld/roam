// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// The videos' reads are mocked: a test sets what is switched on and seen.
const vids = vi.hoisted(() => ({
  state: { ready: true, available: {} as Record<string, number>, seen: {} as Record<string, string> },
  markSeen: (() => {}) as (id: string) => void,
}));
vi.mock("@/hooks/useHowToVideos", () => ({
  SUPABASE_BASE: "https://x.supabase.co",
  useHowToVideos: () => ({ ...vids.state, markSeen: vids.markSeen }),
}));
import StartHere from "./StartHere";

/** A new journey's two ways to start (1 Oct 2026, mock start-here.png). */

afterEach(cleanup);
const hotel = { day_id: "d1", status: "in_itinerary", place: { type: "logistics", sub_type: "hotel" } };
const sight = { day_id: null, status: "interested", place: { type: "activity", sub_type: "self_directed" } };

describe("Start here", () => {
  it("a new journey: both buttons, in the journey's own words, and each does its job", () => {
    const onUpload = vi.fn(), onFind = vi.fn();
    render(<StartHere cards={[]} place="Tuscany, Italy" onUpload={onUpload} onFind={onFind} floating />);
    const upload = screen.getByRole("button", { name: /Upload a booking/ });
    expect(upload.textContent).toContain("A hotel, flight or car confirmation. Roam puts it on your days.");
    expect(screen.getByRole("button", { name: /Find places/ }).textContent).toContain("Things to do and places to eat in Tuscany.");
    fireEvent.click(upload);
    fireEvent.click(screen.getByRole("button", { name: /Find places/ }));
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onFind).toHaveBeenCalledTimes(1);
  });

  it("the hotel uploaded: only Find places is left", () => {
    render(<StartHere cards={[hotel]} place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Upload a booking/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Find places/ })).toBeTruthy();
  });

  it("while a booking is read, the button says so and waits", () => {
    render(<StartHere cards={[]} place="Rome, Italy" reading onUpload={vi.fn()} onFind={vi.fn()} />);
    const b = screen.getByRole("button", { name: /Reading your booking/ }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });

  it("not the journey's first day: Find places only (2 Oct 2026)", () => {
    render(<StartHere cards={[]} firstDay={false} place="Lisbon, Portugal" onUpload={vi.fn()} onFind={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Upload a booking/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Find places/ })).toBeTruthy();
  });

  it("both done: nothing at all, nothing to dismiss", () => {
    const { container } = render(<StartHere cards={[hotel, sight]} place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("Start here carries one how-to video (2 Oct 2026, video-placement-mock)", () => {
  const ALL = { "first-journey": 1, "planning-computer": 1, "on-the-trip": 1 };
  const seen = vi.fn();
  const reset = (available: Record<string, number>, s: Record<string, string> = {}) => {
    vids.state = { ready: true, available, seen: s };
    seen.mockReset();
    vids.markSeen = (id: string) => { seen(id); vids.state = { ...vids.state, seen: { ...vids.state.seen, [id]: "now" } }; };
  };

  it("nothing switched on: the card is exactly yesterday's two rows", () => {
    reset({});
    render(<StartHere cards={[]} place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} floating />);
    expect(screen.queryByTestId("start-video")).toBeNull();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toHaveLength(2);
  });

  it("phone, first day: video 1 leads the card; tapping it plays full screen and marks it gone", () => {
    reset({ "first-journey": 2 });
    render(<StartHere cards={[]} firstDay place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} />);
    const row = screen.getByRole("button", { name: /Watch: Your first journey/ });
    expect(row.textContent).toContain("1 min");
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBe(row);
    fireEvent.click(row);
    expect(seen).toHaveBeenCalledWith("first-journey");
    const video = screen.getByTestId("video-player").querySelector("video")!;
    expect(video.getAttribute("src")).toBe("https://x.supabase.co/storage/v1/object/public/how-to-videos/first-journey.mp4?v=2");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
  });

  it("phone, another day: no video row (it lives on day 1, like Upload)", () => {
    reset(ALL);
    render(<StartHere cards={[]} firstDay={false} place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} />);
    expect(screen.queryByTestId("start-video")).toBeNull();
  });

  it("✕ removes it for good and leaves Upload and Find as they are", () => {
    reset(ALL);
    const { rerender } = render(<StartHere cards={[]} place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} floating />);
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    expect(seen).toHaveBeenCalledWith("first-journey");
    rerender(<StartHere cards={[]} place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} floating />);
    expect(screen.queryByTestId("start-video")).toBeNull();
    expect(screen.getByRole("button", { name: /Upload a booking/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Find places/ })).toBeTruthy();
  });

  it("computer: video 2 waits for the next visit, then shows as one quiet line", () => {
    reset(ALL);
    const { rerender, unmount } = render(<StartHere cards={[]} place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} floating />);
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    rerender(<StartHere cards={[]} place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} floating />);
    expect(screen.queryByRole("button", { name: /Watch how/ })).toBeNull();
    unmount();
    render(<StartHere cards={[]} place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} floating />);
    const line = screen.getByRole("button", { name: /Watch how/ });
    expect(line.textContent).toContain("1 min");
    const all = screen.getAllByRole("button");
    expect(all.indexOf(line)).toBe(all.length - 2); // the line, then its ✕, at the bottom
    expect(screen.queryByRole("button", { name: /Watch: Your first journey/ })).toBeNull();
  });

  it("the phone never shows video 2", () => {
    reset(ALL, { "first-journey": "then" });
    render(<StartHere cards={[]} firstDay place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} />);
    expect(screen.queryByTestId("start-video")).toBeNull();
  });

  it("the card gone (booking and a place on the journey): no video either", () => {
    reset(ALL);
    const { container } = render(<StartHere cards={[hotel, sight]} place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} floating />);
    expect(container.innerHTML).toBe("");
  });
});
