import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LoginScreen from "@/components/auth/LoginScreen";

interface Props {
  searchParams: Promise<{ error?: string; next?: string }>;
}

// OAuth error copy keyed to the codes /auth/callback redirects back with.
// Sienna is reserved for editorial accents — error text renders in Ink.
const ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "Couldn't reach Google. Try again.",
  no_code: "Something interrupted the sign-in. Try again.",
};

// One image per day, deterministic by date — no backend, no stored state.
const LOGIN_IMAGES = [
  { file: "ice-tea-joT0LcIUU8U-unsplash.jpg",          place: "Kyoto",        descriptor: "the golden pavilion at first light" },
  { file: "jorgen-hendriksen-RNkEeWhRT7k-unsplash.jpg", place: "Rome",         descriptor: "the Colosseum, quiet morning" },
  { file: "dylan-shaw-A8Ig1GNYfSk-unsplash.jpg",        place: "Petra",        descriptor: "the Treasury, rose-red city" },
  { file: "snowscat-H3oXiq7_bII-unsplash.jpg",          place: "Patagonia",    descriptor: "the towers above the lake" },
  { file: "jordan-steranka-z0L0mo__9bg-unsplash.jpg",   place: "Cinque Terre", descriptor: "Manarola above the sea" },
  { file: "rumman-amin-bzFHhYKdla0-unsplash.jpg",       place: "Marrakech",    descriptor: "the Koutoubia at dusk" },
];

const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://your-project-ref.supabase.co";

export default async function LoginPage({ searchParams }: Props) {
  const { error, next } = await searchParams;

  // Existing session guard — skip the screen if already signed in.
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/trips");
  }

  const todays = LOGIN_IMAGES[Math.floor(Date.now() / 86_400_000) % LOGIN_IMAGES.length];
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? "Something went wrong. Try again.")
    : null;

  return <LoginScreen image={todays} errorMessage={errorMessage} next={next} />;
}
