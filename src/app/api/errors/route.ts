// ── Where failures land ───────────────────────────────────────────────────
// The free stand-in for Sentry (scale audit, Sept 2026): an error the app
// couldn't handle is posted here and written to public.client_errors with
// the service role. Signed in only, counted against a daily allowance, and
// everything is truncated — a runaway loop can't fill the database.

import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";

const CAP = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : null);

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  // 60 a day: enough to see a bad release, not enough to be a weapon.
  if (!(await underQuota(gate.supabase, "errorLog", 60))) return NextResponse.json({ logged: false }, { status: 204 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const message = CAP(body.message, 500);
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("client_errors").insert({
    user_id:    gate.user.id,
    kind:       CAP(body.kind, 40) ?? "error",
    message,
    path:       CAP(body.path, 300),
    stack:      CAP(body.stack, 4000),
    user_agent: CAP(req.headers.get("user-agent"), 300),
  });
  if (error) console.error("[Roam] error log write failed:", error.message);
  return NextResponse.json({ logged: !error });
}
