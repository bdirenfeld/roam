// ── The journey, readable by anyone holding the link ──────────────────────
// Until Sept 2026 a share link opened a "Continue with Google" wall, so the
// people a journey was planned FOR mostly never saw it: five of the app's
// first eleven accounts existed only because somebody had to sign in to look.
// The link is the secret; holding it is the permission.
//
// What it shows is the itinerary and nothing else. Deliberately absent:
// attachments (flight confirmations carry passport and payment details),
// entry requirements, the budget, journey notes, travellers' names and ages.
// Someone forwarding the link to a taxi driver should not be handing over
// anybody's paperwork.

import { subTypeLabel } from "@/lib/subTypeLabel";
import { formatTimeRange } from "@/lib/formatTime";
import RefreshOnFocus from "./RefreshOnFocus";
import JoinButton from "./JoinButton";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";
const RULE = "rgba(26,26,46,0.10)";

export interface SharedPlace {
  title: string | null;
  sub_type: string | null;
  address: string | null;
  photo: string | null;
}
export interface SharedCard {
  id: string;
  dayId: string | null;
  start: string | null;
  end: string | null;
  place: SharedPlace | null;
  noteTitle: string | null;
}
export interface SharedDay {
  id: string;
  date: string;
  dayNumber: number;
  title: string | null;
}
export interface SharedJourney {
  title: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  cover: string | null;
  host: string | null;
  days: SharedDay[];
  cards: SharedCard[];
}

function longDate(iso: string): string {
  // Midday so a date-only value can't slip a day either side of UTC.
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function range(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const s = new Date(start + "T12:00:00"), e = new Date(end + "T12:00:00");
  const m = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  return sameMonth
    ? `${m(s)} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`
    : `${m(s)} ${s.getDate()} – ${m(e)} ${e.getDate()}, ${e.getFullYear()}`;
}

export default function SharedItinerary({ token, journey }: { token: string; journey: SharedJourney }) {
  const byDay = new Map<string, SharedCard[]>();
  for (const c of journey.cards) {
    if (!c.dayId) continue;
    const list = byDay.get(c.dayId) ?? [];
    list.push(c);
    byDay.set(c.dayId, list);
  }

  const dates = range(journey.startDate, journey.endDate);
  const firstName = journey.host ? journey.host.split(" ")[0] : null;
  const planned = journey.cards.length;

  return (
    <main style={{ background: "#F5F4F1", color: INK, minHeight: "100dvh" }}>
      <RefreshOnFocus />

      {journey.cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={journey.cover} alt="" className="w-full h-[180px] md:h-[260px] object-cover" />
      )}

      <div className="mx-auto w-full max-w-[640px] px-5 pb-16" style={{ paddingTop: journey.cover ? 20 : 40 }}>
        <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "rgba(26,26,46,0.5)" }}>
          {firstName ? `${firstName}'s journey` : "A journey"}
        </p>
        <h1 className="font-display italic text-[32px] mt-2 leading-tight" style={{ letterSpacing: "-0.01em" }}>
          {journey.title}
        </h1>
        {(journey.destination || dates) && (
          <p className="text-[14px] mt-1.5" style={{ color: CAPTION }}>
            {[journey.destination, dates].filter(Boolean).join(" · ")}
          </p>
        )}

        {planned === 0 ? (
          <p className="text-[14px] mt-8" style={{ color: CAPTION }}>
            Nothing is on the days yet. Check back — this page always shows the latest plan.
          </p>
        ) : (
          <div className="mt-8">
            {journey.days.map((day) => {
              const cards = byDay.get(day.id) ?? [];
              if (cards.length === 0) return null;
              return (
                <section key={day.id} className="mb-9">
                  <h2 className="font-display italic text-[20px]">{longDate(day.date)}</h2>
                  {day.title && (
                    <p className="text-[13px] mt-0.5" style={{ color: CAPTION }}>{day.title}</p>
                  )}
                  <div className="mt-3">
                    {cards.map((c) => {
                      const when = formatTimeRange(c.start, c.end);
                      const name = c.place?.title ?? c.noteTitle ?? "Something planned";
                      const detail = [subTypeLabel(c.place?.sub_type), c.place?.address].filter(Boolean).join(" · ");
                      return (
                        <div key={c.id} className="flex gap-3 py-3.5" style={{ borderBottom: `1px solid ${RULE}` }}>
                          <div className="w-[62px] shrink-0 pt-[3px]">
                            {when && (
                              <span className="text-[10px] uppercase" style={{ letterSpacing: "0.08em", color: "rgba(26,26,46,0.45)" }}>
                                {when.split(" – ")[0]}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-display text-[17px] leading-[1.25]">{name}</p>
                            {detail && (
                              <p className="text-[12.5px] mt-[3px] leading-[1.45]" style={{ color: CAPTION }}>{detail}</p>
                            )}
                          </div>
                          {c.place?.photo && (
                            // Only a photo already cached in our own bucket: the
                            // live photo route needs a session, and this page has none.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.place.photo} alt="" className="w-[52px] h-[52px] rounded-lg object-cover shrink-0" style={{ background: "rgba(26,26,46,0.04)" }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-10 pt-6 flex flex-col items-start gap-3" style={{ borderTop: `1px solid ${RULE}` }}>
          {/* The two ways back to it. Without an account the link IS the
              access, so say so; signing in puts the journey in their app and
              they never need the link again (Brennan, Sept 2026: "do they
              need the link all the time or can they get to it through the
              app?"). */}
          <p className="text-[13px] leading-[1.55]" style={{ color: CAPTION }}>
            This page always shows the latest plan{firstName ? ` as ${firstName} changes it` : ""}. Keep the link, or
            sign in and the journey lives in your app — no link needed.
          </p>
          <JoinButton token={token} label="Sign in to keep this journey" />
        </div>
      </div>
    </main>
  );
}
