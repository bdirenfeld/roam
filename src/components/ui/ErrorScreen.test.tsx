// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorScreen from "./ErrorScreen";
import AppError from "@/app/error";

describe("the calm error page (7 Oct 2026)", () => {
  it("says it's on us, the plan is safe, Try again calls reset, and links back to journeys", () => {
    const reset = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AppError error={new Error("boom")} reset={reset} />);
    expect(screen.getByText("Something went wrong on our side.")).toBeTruthy();
    expect(screen.getByText("Your plan is safe.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Back to your journeys" }).getAttribute("href")).toBe("/trips");
  });
  it("shows no error codes or console talk", () => {
    const { container } = render(<ErrorScreen onRetry={() => {}} />);
    expect(container.textContent).not.toMatch(/exception|console|digest|error/i);
  });
});
