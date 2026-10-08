// Session recording (Microsoft Clarity, 8 Oct 2026). Brennan wants strangers
// using Roam so he can SEE where they get stuck, rather than asking them to
// write feedback. Clarity records sessions and flags rage and dead clicks.
//
// Only on the live site, and never for Brennan's own accounts: his sessions
// would bury the testers'. Clarity masks typed text by default ("Balanced"
// masking); keep it that way.

// Clarity project "Roam" (Brennan's Clarity account). Not a secret: it is in
// every recorded page's source. NEXT_PUBLIC_CLARITY_PROJECT_ID overrides it;
// set that to "off" in Vercel and redeploy to stop recording without a code change.
export const CLARITY_PROJECT_ID = "yuj39nvz5w";
const LIVE_HOSTS = ["roam-roan.vercel.app"];

export function clarityProjectFor(hostname: string, override: string | undefined): string | null {
  if (!LIVE_HOSTS.includes(hostname)) return null;
  const id = override?.trim() || CLARITY_PROJECT_ID;
  return id === "off" ? null : id;
}

// His accounts, lower-case. `+` aliases (bdirenfeld+roamtest@) are his
// new-user test logins and are skipped too.
const OWNER_EMAILS = ["bdirenfeld@gmail.com", "brennan@direnfeld.com"];

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return false;
  const base = `${local.split("+")[0]}@${domain}`;
  return OWNER_EMAILS.includes(base);
}

// Record when a project ID is configured and the visitor is not Brennan.
// Signed-out visitors (a guest opening a shared journey) are recorded.
export function shouldRecord(projectId: string | null | undefined, email: string | null | undefined): boolean {
  if (!projectId || !/^[a-z0-9]+$/i.test(projectId)) return false;
  return !isOwnerEmail(email);
}

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };

// Microsoft's install snippet, unrolled: a queueing stub on window.clarity,
// then the async tag. Calls made before the tag loads are queued and replayed.
export function loadClarity(projectId: string, doc: Document = document): ClarityFn {
  const win = doc.defaultView as (Window & { clarity?: ClarityFn }) | null;
  if (!win) throw new Error("loadClarity needs a window");
  if (win.clarity) return win.clarity;
  const stub: ClarityFn = (...args: unknown[]) => {
    (stub.q = stub.q || []).push(args);
  };
  win.clarity = stub;
  const tag = doc.createElement("script");
  tag.async = true;
  tag.src = `https://www.clarity.ms/tag/${projectId}`;
  doc.head.appendChild(tag);
  return stub;
}
