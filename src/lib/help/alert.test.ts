import { describe, it, expect, vi, afterEach } from "vitest";
import { alertBrennan, alertEmail } from "./alert";
const a = { urgent: true, who: "Dana\nBcc: x", body: "<b>charged</b> twice", screen: "/trips", code: "RM-1", origin: "https://roam.test" };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("the alert to Brennan", () => {
  it("says Urgent, keeps the subject on one line, escapes the words", () => {
    const m = alertEmail(a);
    expect(m.subject).toBe("Urgent: Dana Bcc: x wrote to Roam");
    expect(m.html).toContain("&lt;b&gt;charged");
    expect(m.text).toContain("https://roam.test/admin/feedback");
    expect(alertEmail({ ...a, urgent: false }).subject.startsWith("Urgent")).toBe(false);
  });
  it("never throws: no key, refused, or network down", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await alertBrennan(a)).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "k");
    expect(await alertBrennan(a)).toBe(false); // no address set
    vi.stubEnv("HELP_ALERT_EMAIL", "someone@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", () => Promise.resolve({ ok: false, status: 403 }));
    expect(await alertBrennan(a)).toBe(false);
    vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
    expect(await alertBrennan(a)).toBe(false);
    vi.stubGlobal("fetch", () => Promise.resolve({ ok: true }));
    expect(await alertBrennan(a)).toBe(true);
  });
});
