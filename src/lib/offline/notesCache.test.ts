import { describe, it, expect } from "vitest";
import { rememberNotes, recallNotes } from "./notesCache";

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }
class Broken { getItem(): string | null { throw new Error("blocked"); } setItem() { throw new Error("full"); } }

describe("Journey notes kept on the phone for no signal (4 Oct 2026)", () => {
  it("what was read or typed comes back without the network", () => {
    const s = new Mem() as unknown as Storage;
    rememberNotes("t1", "Lockbox 4821", s);
    expect(recallNotes("t1", s)).toBe("Lockbox 4821");
    expect(recallNotes("t2", s)).toBeNull();
  });
  it("blocked or full storage never breaks opening the notes", () => {
    const s = new Broken() as unknown as Storage;
    expect(() => rememberNotes("t1", "x", s)).not.toThrow();
    expect(recallNotes("t1", s)).toBeNull();
  });
});
