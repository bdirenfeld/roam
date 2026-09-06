// The frame for /privacy and /terms: a readable column in the app's voice,
// public (no sign-in), one link back home.
import type { ReactNode } from "react";

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="min-h-screen" style={{ background: "#F5F4F1", color: "#1A1A2E" }}>
      <div className="mx-auto w-full max-w-[640px] px-5 py-10 md:py-16">
        <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "rgba(26,26,46,0.5)" }}>Roam</p>
        <h1 className="font-display italic text-[34px] mt-2" style={{ letterSpacing: "-0.01em" }}>{title}</h1>
        <p className="text-[12.5px] mt-1 mb-8" style={{ color: "rgba(26,26,46,0.5)" }}>Last updated {updated}</p>
        <div className="legal text-[15px] leading-[1.65]">{children}</div>
      </div>
      <style>{`
        .legal h2 { font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-weight: 500; font-size: 21px; margin: 28px 0 8px; }
        .legal p { margin: 0 0 12px; }
        .legal ul { margin: 0 0 12px; padding-left: 20px; }
        .legal li { margin: 0 0 8px; }
        .legal a { text-decoration: underline; text-underline-offset: 2px; }
      `}</style>
    </main>
  );
}
