import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth-actions";
import AppHeader from "@/components/ui/AppHeader";
import Image from "next/image";

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
        {/* Avatar + name */}
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
            <p className="text-sm text-gray-400 mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* Profile fields */}
        {profile && (
          <div className="space-y-4 mb-8">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Travel profile</p>
            <ProfileRow label="Home airport" value={profile.home_airport} placeholder="e.g. YYZ" />
            <ProfileRow label="Home country" value={profile.home_country} placeholder="e.g. Canada" />
            <ProfileRow label="Passport" value={profile.passport_country} placeholder="e.g. Canadian" />
          </div>
        )}

        {/* Sign out */}
        {user && (
          <div className="pt-4 border-t border-gray-100">
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-semibold text-red-500 hover:text-red-600 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileRow({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: string | null;
  placeholder: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-medium ${value ? "text-gray-800" : "text-gray-300"}`}>
        {value ?? placeholder}
      </span>
    </div>
  );
}
