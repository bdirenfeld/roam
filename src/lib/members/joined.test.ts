import { describe, it, expect } from "vitest";
import { firstName, joinedMessage, newJoiners, joinedToastFor, seenKey, type JoinedMember } from "./joined";

// "Isha joined Tuscany" (7 Oct 2026, delight audit).
const NOW = Date.parse("2026-10-07T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();
const isha: JoinedMember = { userId: "u-isha", firstName: "Isha", createdAt: daysAgo(1) };
const sam: JoinedMember = { userId: "u-sam", firstName: "Sam", createdAt: daysAgo(3) };
const old: JoinedMember = { userId: "u-old", firstName: "Priya", createdAt: daysAgo(60) };

function memStore(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

describe("firstName", () => {
  it("takes the first word of the name, else the email before @", () => {
    expect(firstName("Isha Seth", "x@y.com")).toBe("Isha");
    expect(firstName("  ", "sam.lee@example.com")).toBe("sam.lee");
    expect(firstName(null, null)).toBeNull();
  });
});

describe("joinedMessage", () => {
  it("names one, two or several in one sentence", () => {
    expect(joinedMessage(["Isha"], "Tuscany")).toBe("Isha joined Tuscany");
    expect(joinedMessage(["Isha", "Sam"], "Tuscany")).toBe("Isha and Sam joined Tuscany");
    expect(joinedMessage(["Isha", "Sam", "Jo"], "Tuscany")).toBe("Isha, Sam and Jo joined Tuscany");
  });
});

describe("newJoiners", () => {
  it("first run: joins older than 14 days are already seen, recent ones are news", () => {
    const { announce, nextSeen } = newJoiners([old, isha], null, NOW);
    expect(announce.map((m) => m.userId)).toEqual(["u-isha"]);
    expect(nextSeen.sort()).toEqual(["u-isha", "u-old"]);
  });

  it("after the first run, any unseen member is news however long ago they joined", () => {
    expect(newJoiners([old], [], NOW).announce).toEqual([old]);
  });

  it("a member with no readable name waits, unseen", () => {
    const nameless = { ...sam, firstName: null };
    const { announce, nextSeen } = newJoiners([nameless], [], NOW);
    expect(announce).toEqual([]);
    expect(nextSeen).toEqual([]);
  });
});

describe("joinedToastFor", () => {
  it("toasts a new member once, then never again on this device", () => {
    const s = memStore();
    expect(joinedToastFor(s, "t1", "Tuscany", [isha], NOW)).toBe("Isha joined Tuscany");
    expect(joinedToastFor(s, "t1", "Tuscany", [isha], NOW)).toBeNull();
    expect(JSON.parse(s.getItem(seenKey("t1"))!)).toEqual(["u-isha"]);
  });

  it("several new members are one toast", () => {
    expect(joinedToastFor(memStore({ [seenKey("t1")]: "[]" }), "t1", "Tuscany", [isha, sam], NOW)).toBe(
      "Isha and Sam joined Tuscany",
    );
  });

  it("does not toast old members on the first run, but does toast a later join", () => {
    const s = memStore();
    expect(joinedToastFor(s, "t1", "Tuscany", [old], NOW)).toBeNull();
    expect(joinedToastFor(s, "t1", "Tuscany", [old, sam], NOW)).toBe("Sam joined Tuscany");
  });

  it("the seen list is per journey", () => {
    const s = memStore();
    joinedToastFor(s, "t1", "Tuscany", [isha], NOW);
    expect(joinedToastFor(s, "t2", "Japan", [isha], NOW)).toBe("Isha joined Japan");
  });

  it("shows nothing when storage cannot be read or written, rather than repeating", () => {
    const broken = memStore();
    broken.setItem = () => { throw new Error("QuotaExceeded"); };
    expect(joinedToastFor(broken, "t1", "Tuscany", [isha], NOW)).toBeNull();
    const unreadable = memStore();
    unreadable.getItem = () => { throw new Error("SecurityError"); };
    expect(joinedToastFor(unreadable, "t1", "Tuscany", [isha], NOW)).toBeNull();
    expect(joinedToastFor(null, "t1", "Tuscany", [isha], NOW)).toBeNull();
  });
});
