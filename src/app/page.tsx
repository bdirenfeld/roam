import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isPhone, landingTripId } from "@/lib/landing";
import LandingPage from "@/components/landing/LandingPage";

const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://your-project-ref.supabase.co";

// `/` is the logged-out front door (Direction A marketing page). A signed-in
// visitor never sees it — they're sent to /trips, where the existing has_paid
// gate routes unpaid users on to /checkout. The middleware exempts exactly `/`
// from the auth bounce so logged-out visitors land here.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string }>;
}) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // On a computer, open straight into the next journey (26 Sep 2026);
      // the phone, and anyone with nothing ahead, gets the Journeys list.
      const h = await headers();
      if (!isPhone(h.get("user-agent"), h.get("sec-ch-ua-mobile"))) {
        const { data: trips } = await supabase
          .from("trips")
          .select("id, title, start_date, end_date, archived");
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
        const id = landingTripId(trips ?? [], today);
        if (id) redirect(`/trips/${id}`);
      }
      redirect("/trips");
    }
  }

  const { signin } = await searchParams;
  return <LandingPage signInFailed={signin === "failed"} />;
}
