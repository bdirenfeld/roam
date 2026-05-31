import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LandingPage from "@/components/landing/LandingPage";

const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://your-project-ref.supabase.co";

// `/` is the logged-out front door (Direction A marketing page). A signed-in
// visitor never sees it — they're sent to /trips, where the existing has_paid
// gate routes unpaid users on to /checkout. The middleware exempts exactly `/`
// from the auth bounce so logged-out visitors land here.
export default async function Home() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/trips");
  }

  return <LandingPage />;
}
