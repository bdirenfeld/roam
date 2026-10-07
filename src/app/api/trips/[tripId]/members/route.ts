import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authUser";
import { getTripAccess } from "@/lib/trip-access";
import { firstName, type JoinedMember } from "@/lib/members/joined";

/**
 * Who has joined this journey, for the owner's "Isha joined Tuscany" toast
 * (7 Oct 2026, delight audit). Owner only: anyone else gets an empty list.
 *
 * trip_members is read with the signed-in client (owner_view_trip_members
 * lets the owner see them). Other people's `users` rows are RLS-blocked for
 * the owner, so their names come through the service role, scoped to the
 * member ids just read, the same way Settings' Share section shows "Joined".
 */
export async function GET(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return NextResponse.json({ members: [] }, { status: 401 });
  if ((await getTripAccess(supabase, tripId, user.id)) !== "owner") {
    return NextResponse.json({ members: [] }, { status: 403 });
  }

  const { data: rows } = await supabase
    .from("trip_members")
    .select("user_id, role, created_at")
    .eq("trip_id", tripId)
    .in("role", ["guest", "cohost"])
    .neq("user_id", user.id);
  const list = (rows ?? []) as { user_id: string; role: string; created_at: string }[];
  if (list.length === 0 || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ members: [] });
  }

  const { data: people } = await createAdminClient()
    .from("users")
    .select("id, name, email")
    .in("id", list.map((r) => r.user_id));
  const byId = new Map(((people ?? []) as { id: string; name: string | null; email: string | null }[]).map((p) => [p.id, p]));

  const members: JoinedMember[] = list.map((r) => ({
    userId: r.user_id,
    firstName: firstName(byId.get(r.user_id)?.name, byId.get(r.user_id)?.email),
    createdAt: r.created_at,
  }));
  return NextResponse.json({ members });
}
