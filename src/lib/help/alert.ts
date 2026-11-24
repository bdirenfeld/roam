// Tells Brennan someone wrote. Best effort: the message is saved either way,
// and /admin/feedback lists it. Resend's shared sender only delivers to the
// account's own address, which is the one place this goes.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface Alert { urgent: boolean; who: string; body: string; screen: string | null; code: string; origin: string }

export function alertEmail(a: Alert): { subject: string; text: string; html: string } {
  const who = a.who.replace(/[\r\n]+/g, " ").slice(0, 60);
  const link = `${a.origin}/admin/feedback`;
  return {
    subject: `${a.urgent ? "Urgent: " : ""}${who} wrote to Roam`,
    text: `${a.body}\n\n${a.screen ?? ""} ${a.code}\n${link}\n`,
    html: `<p style="white-space:pre-wrap">${esc(a.body)}</p><p>${esc(a.screen ?? "")} ${esc(a.code)}</p><p><a href="${esc(link)}">Answer</a></p>`,
  };
}

export async function alertBrennan(a: Alert): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  // Set in Vercel. No address lives in the code; unset means no alert.
  const to = process.env.HELP_ALERT_EMAIL;
  if (!key || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.SHARE_FROM_EMAIL ?? "Roam <onboarding@resend.dev>", to: [to], ...alertEmail(a) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("[Roam] help alert refused:", res.status);
    return res.ok;
  } catch (err) {
    console.error("[Roam] help alert failed:", err);
    return false;
  }
}
