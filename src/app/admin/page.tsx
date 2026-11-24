import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/authUser";
import { isAdmin } from "@/lib/adminView";
import type { AdminRow } from "@/lib/adminJourneys";
import AdminTable from "@/components/admin/AdminTable";

export const dynamic = "force-dynamic";

/**
 * Every journey, for helping testers (17 Nov 2026, beta). Admin only: anyone
 * else gets a 404, and the database's admin_journeys() returns nothing to them
 * either. The table (components/admin/AdminTable) opens a journey read only.
 */
export default async function AdminPage() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!isAdmin(user?.id)) notFound();
  const { data, error } = await supabase.rpc("admin_journeys");
  const rows = ((data ?? []) as AdminRow[]).map((r) => ({ ...r, planned: Number(r.planned), saved: Number(r.saved), guests: Number(r.guests) }));
  return (
    <main className="min-h-screen bg-white">
      <div className="sticky top-0 z-20 h-14 flex items-center gap-3.5 px-7" style={{ background: "#1A1A2E", color: "#fff" }}>
        <a href="/trips" className="font-display text-[21px]">Roam</a>
        <span className="text-[11px] tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.62)" }}>ADMIN</span>
        <a href="/admin/feedback" className="text-[13px] underline underline-offset-4">Feedback</a>
      </div>
      <div className="max-w-[1180px] mx-auto px-7 pb-8">
        {error ? <p className="text-[14px]" style={{ color: "#B0541F" }}>Couldn&apos;t load the journeys. Try again.</p> : <AdminTable rows={rows} />}
      </div>
    </main>
  );
}
