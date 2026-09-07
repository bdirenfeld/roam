// ── The journey, readable by anyone holding the link ──────────────────────
// Until Sept 2026 a share link opened a "Continue with Google" wall, so the
// people a journey was planned FOR mostly never saw it: five of the app's
// first eleven accounts existed only because somebody had to sign in to look.
// The link is the secret; holding it is the permission.
//
// Still deliberately absent: attachments, the budget, travellers' names and
// ages. Someone forwarding the link to a taxi driver should not be handing
// over anybody's paperwork — flight confirmations carry passport and payment
// details, and that has not changed.
//
// Card notes DO show, from Sept 2026. They were withheld under the same blanket
// rule and should not have been: they are the answer to "what is this place and
// why are we going", written by the host for exactly these readers. Checked
// before the change — across 262 notes none carried a secret, and the habit is
// already to keep them out ("Lockbox is outside the main door — code stored
// separately"). If that ever stops being true the fix is on the writing end,
// not here.

import { subTypeLabel } from "@/lib/subTypeLabel";
import { formatTimeRange } from "@/lib/formatTime";
import { plainNote } from "@/lib/plainNote";
import DayHeading from "./DayHeading";
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
  note: string | null;
}
export interface SharedDay {
  id: string;
  date: string;
  dayNumber: number;
  title: string | null;
}
export interface SharedEntryLine {
  label: string;
  text: string;
}
export interface SharedJourney {
  title: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  cover: string | null;
  host: string | null;
  staying: { name: string | null; address: string | null } | null;
  entry: SharedEntryLine[];
  days: SharedDay[];
  cards: SharedCard[];
}

/** A maps search for the place. Universal link: opens the maps app on a
 *  phone and Google Maps in a browser, with no key and no API call. */
function mapsHref(title: string | null, address: string): string {
  const q = [title, address].filter(Boolean).join(", ");
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
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

export default function SharedItinerary({
  token,
  journey,
  preview = false,
}: {
  token: string;
  journey: SharedJourney;
  preview?: boolean;
}) {
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

      {preview && (
        // Only ever rendered for a signed-in owner who asked for it. Says which
        // view this is, because the guest page and the app look enough alike
        // at a glance to be confusing, and gives a way back.
        <div
          className="px-5 py-2.5 flex items-center justify-between gap-3 text-[12.5px]"
          style={{ background: INK, color: "rgba(255,255,255,0.92)" }}
        >
          <span>Preview · what someone with the link sees</span>
          <a href="/trips" className="underline underline-offset-2 shrink-0" style={{ color: "#FFFFFF" }}>
            Back to Roam
          </a>
        </div>
      )}

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

        {(journey.staying || journey.entry.length > 0) && (
          // Above the plan, not inside it: these are true on every day of the
          // trip, so burying them on day one would just move the question.
          <section
            className="mt-7 rounded-xl px-4 py-4"
            style={{ background: "#FFFFFF", border: `1px solid ${RULE}` }}
          >
            <h2 className="text-[10px] uppercase" style={{ letterSpacing: "0.14em", color: "rgba(26,26,46,0.5)" }}>
              Good to know
            </h2>
            <dl className="mt-3 flex flex-col gap-3">
              {journey.staying && (
                <div>
                  <dt className="text-[10px] uppercase" style={{ letterSpacing: "0.07em", color: "rgba(26,26,46,0.5)" }}>
                    Where we&rsquo;re staying
                  </dt>
                  <dd className="text-[13.5px] mt-[3px] leading-[1.45] m-0">
                    {journey.staying.address ? (
                      <a
                        href={mapsHref(journey.staying.name, journey.staying.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                        style={{ textDecorationColor: "rgba(26,26,46,0.25)" }}
                      >
                        {[journey.staying.name, journey.staying.address].filter(Boolean).join(" — ")}
                      </a>
                    ) : (
                      journey.staying.name
                    )}
                  </dd>
                </div>
              )}
            </dl>

            {journey.entry.length > 0 && (
              // Folded, because entry rules get read once before the trip and
              // never again, while the plan is read every day. Open, Tuscany's
              // seven lines ran 416px and pushed the first card of the first day
              // to 902px — past the fold on a phone, which only swaps one
              // missing answer for another (measured on the live page).
              // <details> so it needs no JavaScript and no session.
              <details className="mt-3">
                <summary
                  className="text-[13px] cursor-pointer list-none marker:content-none"
                  style={{ color: "rgba(26,26,46,0.62)" }}
                >
                  What you need to get in
                  <span className="ml-1.5" style={{ color: "rgba(26,26,46,0.4)" }}>
                    ({journey.entry.length})
                  </span>
                </summary>
                <dl className="mt-3 flex flex-col gap-3">
              {journey.entry.map((line) => (
                <div key={line.label}>
                  <dt className="text-[10px] uppercase" style={{ letterSpacing: "0.07em", color: "rgba(26,26,46,0.5)" }}>
                    {line.label}
                  </dt>
                  <dd className="text-[13.5px] mt-[3px] leading-[1.45] m-0">{line.text}</dd>
                </div>
              ))}
                </dl>
              </details>
            )}
          </section>
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
                  <DayHeading date={day.date} label={longDate(day.date)} title={day.title} />
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
                              // The address opens the reader's own maps app — the one
                              // thing a passenger standing on the street actually needs,
                              // and the only tap on this page besides signing in
                              // (Brennan, Sept 2026: "can they click on any of the stuff").
                              c.place?.address ? (
                                <a
                                  href={mapsHref(c.place.title, c.place.address)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block text-[12.5px] mt-[3px] leading-[1.45] underline underline-offset-2"
                                  style={{ color: CAPTION, textDecorationColor: "rgba(26,26,46,0.25)" }}
                                >
                                  {detail}
                                </a>
                              ) : (
                                <p className="text-[12.5px] mt-[3px] leading-[1.45]" style={{ color: CAPTION }}>{detail}</p>
                              )
                            )}
                            {c.note && (
                              // Subordinate on purpose: the times are what you
                              // scan, the note is what you read when you want to
                              // know why. Line breaks are kept because the notes
                              // are written in short blocks, not prose.
                              <p
                                className="text-[12.5px] mt-2 leading-[1.55] pl-2.5"
                                style={{ color: "rgba(26,26,46,0.72)", borderLeft: `2px solid ${RULE}`, whiteSpace: "pre-line" }}
                              >
                                {plainNote(c.note)}
                              </p>
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
            {preview
              ? "This is the whole of it. A guest sees the plan, your notes and what they need to get in — not the map, Bookings, Ideas, or anything they could change."
              : `This page always shows the latest plan${firstName ? ` as ${firstName} changes it` : ""}. Keep the link, or sign in and the journey lives in your app — no link needed.`}
          </p>
          {!preview && <JoinButton token={token} label="Sign in to keep this journey" />}
        </div>
      </div>
    </main>
  );
}
