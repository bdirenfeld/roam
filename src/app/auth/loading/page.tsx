import { MapPin } from "@phosphor-icons/react";

/**
 * /auth/loading — shown briefly during OAuth redirect dance
 * The middleware will redirect away once the session is established.
 */
export default function AuthLoadingPage() {
  return (
    <div className="mobile-container flex flex-col items-center justify-center min-h-dvh bg-white">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-activity flex items-center justify-center shadow-sm mx-auto mb-5">
          <MapPin size={28} weight="light" color="white" />
        </div>
        <LoadingDots />
        <p className="text-xs text-gray-400 mt-4 font-medium">Signing you in…</p>
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-activity animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}
