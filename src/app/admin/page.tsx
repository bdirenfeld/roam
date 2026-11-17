import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/authUser";
import { isAdmin } from "@/lib/adminView";

export const dynamic = "force-dynamic";

type Row = { id: string; title: string | null; destination: string | null; start_date: string | null; end_date: string | null; owner: string | null; created_at: string; planned: number; saved: number };

const fmt = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

/**
 * Every journey, for helping testers (17 Nov 2026, beta). Admin only: anyone
 * else gets a 404, and the database's admin_journeys() returns nothing to them
 * either. A row opens the journey read only through /admin/view.
 */
export default async function AdminPage() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!isAdmin(user?.id)) notFound();
  const { data, error } = await supabase.rpc("admin_journeys");
  const rows = (data ?? []) as Row[];
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-[860px] mx-auto px-4 py-10">
        <h1 className="font-display text-[28px]">Everyone&apos;s journeys</h1>
        <p className="text-[14px] mt-1" style={{ color: "rgba(26,26,46,0.62)" }}>Opens read only, as the owner sees it. Nothing you do there changes their journey.</p>
        {error && <p className="mt-6 text-[14px]" style={{ color: "#B0541F" }}>Couldn&apos;t load the journeys. Try again.</p>}
        <ul className="mt-6">
          {rows.map((r) => (
            <li key={r.id} className="border-b border-black/5">
              {/* A plain link: entering the view is a full page load, so the browser's client picks up the cookie. */}
              <a href={`/admin/view/${r.id}`} data-testid="admin-journey" className="flex items-baseline gap-3 py-3.5 hover:bg-[#F7F7F5] px-2 -mx-2 rounded-lg">
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium truncate">{r.title || "Untitled"}{r.destination && r.destination !== r.title ? <span className="font-normal" style={{ color: "rgba(26,26,46,0.62)" }}> · {r.destination}</span> : null}</span>
                  <span className="block text-[13px]" style={{ color: "rgba(26,26,46,0.62)" }}>{r.owner ?? "Someone"} · {fmt(r.start_date)}{r.end_date ? ` – ${fmt(r.end_date)}` : ""}</span>
                </span>
                <span className="text-[13px] whitespace-nowrap" style={{ color: "rgba(26,26,46,0.62)" }}>{r.planned} planned · {r.saved} saved</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
