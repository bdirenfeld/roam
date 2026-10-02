import { describe, it, expect } from "vitest";
import { readBookingError, NO_BOOKING } from "./readError";

describe("a booking that can't be read", () => {
  it("an API refusal never reaches the person as JSON", () => {
    const raw = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}');
    const m = readBookingError(raw);
    expect(m).toBe("Couldn't read that booking just now. Try again in a little while.");
    expect(m).not.toMatch(/[{}]|credit|Anthropic|invalid_request/);
  });
  it("nothing in the file is said plainly", () => {
    expect(readBookingError(new Error(NO_BOOKING))).toMatch(/^Couldn't find a booking in that file/);
  });
  it("anything else, even a non-Error, gets the plain line", () => {
    expect(readBookingError("timeout")).toBe("Couldn't read that booking just now. Try again in a little while.");
    expect(readBookingError(undefined)).toBe("Couldn't read that booking just now. Try again in a little while.");
  });
});
