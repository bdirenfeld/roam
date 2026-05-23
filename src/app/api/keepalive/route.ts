// ============================================================
// Roam — Keep-warm endpoint
// Hit by Vercel Cron every 5 minutes (see vercel.json) so the Node
// serverless container that hosts this lambda stays warm. No real
// work, no Anthropic, no Supabase, no DB — the *only* job here is
// to be a cheap, fast invocation that prevents cold-boot.
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response("ok", {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
