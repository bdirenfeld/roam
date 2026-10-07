"use client";

// The page a crash shows instead of the framework's bare "Application error"
// (7 Oct 2026, delight audit, mock approved). It owns the problem, says the
// plan is safe (it is: everything lives on the server), and offers one way to
// try again and one way back. No codes, no console talk.

export default function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-6" style={{ background: "#F7F5F0", color: "#1A1A2E" }}>
      <div className="flex flex-col items-center text-center max-w-[320px]">
        <svg aria-hidden="true" width="128" height="96" viewBox="0 0 128 96" fill="none" stroke="#1A1A2E" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 26 L44 18 L72 27 L104 18 L110 70 L78 79 L50 70 L22 78 Z" fill="#E9E4D8" fillOpacity=".55" stroke="none" />
          <path d="M18.5 26.4 L44 18.2 L71.6 27.3 L103.8 17.6 L110.3 70.2 L78.2 79.4 L50.1 70.3 L21.7 78.4 Z" />
          <path d="M44 18.4 C45 36 48 53 50.2 70.1" /><path d="M71.8 27.4 C74 44 76 61 78.1 79.2" />
          <path d="M27 44 c6 -3 10 4 16 1 s9 -6 14 -2" strokeWidth="1" strokeDasharray="2.5 3" />
          <path d="M60 52 c5 2 9 -3 14 0 s8 4 14 -1" strokeWidth="1" strokeDasharray="2.5 3" />
          <path d="M92 40 c0 -6 9 -6 9 0 c0 5 -4.5 9 -4.5 13 c0 -4 -4.5 -8 -4.5 -13 Z" fill="#fff" />
          <circle cx="96.5" cy="40.3" r="1.6" />
          <path d="M30 60 l4 4 M34 60 l-4 4" strokeWidth="1.1" />
          <path d="M16 84 C40 86 88 86 112 83" strokeWidth=".8" opacity=".45" />
        </svg>
        <h1 className="mt-6 text-[24px] leading-snug font-medium">Something went wrong on our side.</h1>
        <p className="mt-2 text-[15px]" style={{ color: "rgba(26,26,46,0.55)" }}>Your plan is safe.</p>
        <button type="button" onClick={onRetry} className="mt-7 px-7 py-3 rounded-full text-[15px] font-semibold" style={{ background: "#1A1A2E", color: "#F7F5F0" }}>
          Try again
        </button>
        {/* A plain link so it works even when the app's router is what broke. */}
        <a href="/trips" className="mt-4 text-[14px] underline underline-offset-[3px]" style={{ color: "rgba(26,26,46,0.6)" }}>
          Back to your journeys
        </a>
      </div>
    </main>
  );
}
