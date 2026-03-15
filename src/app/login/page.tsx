import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LoginButton from "@/components/auth/LoginButton";

interface Props {
  searchParams: Promise<{ error?: string; next?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "Sign-in failed. Please try again.",
  no_code: "Something went wrong with the Google redirect. Please try again.",
};

const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://your-project-ref.supabase.co";

export default async function LoginPage({ searchParams }: Props) {
  const { error, next } = await searchParams;

  // Skip auth check if Supabase isn't configured yet (dev mode)
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/trips");
  }

  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "An error occurred. Please try again.") : null;

  return (
    <div className="mobile-container flex flex-col items-center justify-center min-h-dvh bg-white px-6">
      {/* Logo mark */}
      <div className="mb-3">
        <div className="w-14 h-14 rounded-2xl bg-activity flex items-center justify-center shadow-sm">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="10" r="3" />
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          </svg>
        </div>
      </div>

      {/* Wordmark */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Roam</h1>
        <p className="mt-1.5 text-sm text-gray-400 font-medium">
          Your personal travel itinerary
        </p>
      </div>

      {/* Dev notice */}
      {!isSupabaseConfigured && (
        <div className="w-full mb-5 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-xs font-semibold text-amber-700 mb-1">Setup required</p>
          <p className="text-xs text-amber-600 leading-relaxed">
            Copy <code className="font-mono bg-amber-100 px-1 rounded">.env.local.example</code> to{" "}
            <code className="font-mono bg-amber-100 px-1 rounded">.env.local</code> and add your Supabase
            and Mapbox credentials before signing in.
          </p>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div className="w-full mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-xs text-red-600 font-medium">{errorMessage}</p>
        </div>
      )}

      {/* Sign-in button */}
      <LoginButton next={next} />

      <p className="mt-8 text-xs text-gray-300 text-center">
        By continuing you agree to our Terms of Service
      </p>
    </div>
  );
}
