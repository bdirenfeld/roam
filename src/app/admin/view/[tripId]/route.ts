import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/authUser";
import { ADMIN_COOKIE, cleanTripId, isAdmin } from "@/lib/adminView";

/** Opens one journey in the admin view (lib/adminView): sets the cookie, then the journey. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  const id = cleanTripId(tripId);
  if (!isAdmin(user?.id) || !id) return new NextResponse("Not found", { status: 404 });
  const res = NextResponse.redirect(new URL(`/trips/${id}`, req.url));
  // Not httpOnly: the browser's Supabase client reads it to send the header. Two hours, then it lapses.
  res.cookies.set(ADMIN_COOKIE, id, { path: "/", sameSite: "lax", secure: true, maxAge: 2 * 60 * 60 });
  return res;
}
