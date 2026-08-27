import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/ui/AppHeader";
import ProfileForm from "@/components/profile/ProfileForm";

// The real route. The masthead dropdown and the mobile avatar now open the
// same screen as an overlay, but /profile stays a page so a bookmark, a
// shared link, or a ctrl/cmd-click still renders it in full.
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("users").select("*").eq("id", user.id).single()
    : { data: null };

  const displayName = profile?.name ?? user?.user_metadata?.full_name ?? user?.email ?? "Guest";
  const avatarUrl = profile?.avatar_url ?? user?.user_metadata?.avatar_url ?? null;

  return (
    <div>
      <AppHeader avatarUrl={avatarUrl} />

      {/* No user means the middleware already bounced them; render nothing
          rather than a half-populated profile. */}
      {user && (
        <ProfileForm
          variant="page"
          initial={{
            userId: user.id,
            email: user.email ?? null,
            displayName,
            avatarUrl,
            homeAirport: profile?.home_airport ?? null,
            homeCountry: profile?.home_country ?? null,
            passportCountry: profile?.passport_country ?? null,
          }}
        />
      )}
    </div>
  );
}
