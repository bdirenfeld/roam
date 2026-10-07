/**
 * /auth/loading — shown briefly during OAuth redirect dance
 * The middleware will redirect away once the session is established.
 *
 * Still and quiet (6 Oct 2026, delight audit): the map pin in the brand ink
 * and one line. The three bouncing dots under it went — motion that only says
 * "busy" is decoration, and it made a sub-second wait feel like a slow one.
 */
export default function AuthLoadingPage() {
  return (
    <div className="mobile-container flex flex-col items-center justify-center min-h-dvh bg-white">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-activity flex items-center justify-center shadow-sm mx-auto mb-5">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="10" r="3" />
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          </svg>
        </div>
        <p className="text-xs text-gray-400 font-medium">Signing you in…</p>
      </div>
    </div>
  );
}
