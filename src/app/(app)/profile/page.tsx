import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/ui/AppHeader";
import Image from "next/image";
import ProfileClient from "@/components/profile/ProfileClient";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // TODO: re-enable auth before deploy
  // if (!user) redirect("/login");

  const { data: profile } = user
    ? await supabase.from("users").select("*").eq("id", user.id).single()
    : { data: null };

  const displayName = profile?.name ?? user?.user_metadata?.full_name ?? user?.email ?? "Guest";
  const avatarUrl = profile?.avatar_url ?? user?.user_metadata?.avatar_url ?? null;

  return (
    <div>
      <AppHeader avatarUrl={avatarUrl} />

      <div className="px-4 pt-6 pb-8">
        {/* Avatar + name — display only, pulled from Google OAuth */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200 flex-shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName ?? "Avatar"}
                width={64}
                height={64}
                className="object-cover"
              />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">{displayName}</p>
            <p className="text-sm text-gray-400 mt-0.5">{user?.email}</p>
          </div>
        </div>

        {/* Editable travel profile + save + sign out */}
        {user && profile ? (
          <ProfileClient
            userId={user.id}
            initialHomeAirport={profile.home_airport ?? null}
            initialHomeCountry={profile.home_country ?? null}
            initialPassportCountry={profile.passport_country ?? null}
          />
        ) : user ? (
          <ProfileClient
            userId={user.id}
            initialHomeAirport={null}
            initialHomeCountry={null}
            initialPassportCountry={null}
          />
        ) : null}
      </div>
    </div>
  );
}
