"use client";

// ── One candidate stay, opened from the Where-to-stay list ────────────────
// The screen from the mock: photos across the top, then five lines, each a
// fact against this journey — who it fits, the dates and the price, the
// drives, what the reviews say, what to ask the host — and Choose / Save /
// the listing at the bottom. Nothing on it is a label that only introduces
// the next line (Brennan, Sep 2026).

import { useEffect, useRef, useState } from "react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { scoreLabel, siteName } from "@/lib/stays/price";
import type { StayBrief } from "@/lib/stays/brief";
import type { StayCandidate } from "@/types/database";

const INK = "#1A1A2E";
const SIENNA = "#B0541F";
const CAPTION = "rgba(26,26,46,0.62)";

interface Props {
  /** Desktop: slide in over the list inside the right-hand panel, with a way back. */
  inPanel?: boolean;
  backLabel?: string;
  candidate: StayCandidate;
  brief: StayBrief | null;
  startDate: string;
  endDate: string;
  nights: number;
  /** The year the prices are for, when it is not the journey's own. */
  priceYear?: number | null;
  busy: boolean;
  onChoose: () => void;
  onSave: () => void;
  onClose: () => void;
}

function cad(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-CA");
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sameMonth = s.getMonth() === e.getMonth();
  const mon = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
  return sameMonth ? `${s.getDate()}–${e.getDate()} ${mon(e)}` : `${s.getDate()} ${mon(s)} – ${e.getDate()} ${mon(e)}`;
}

/** The photos Google holds for the place, through the app's own photo route. */
async function loadPhotos(googlePlaceId: string): Promise<{ photos: string[]; website: string | null }> {
  const res = await fetch(`/api/places/details?place_id=${encodeURIComponent(googlePlaceId)}`);
  const json = await res.json();
  const refs: string[] = ((json.result?.photos ?? []) as { photo_reference?: string }[])
    .map((p) => p.photo_reference).filter((r): r is string => !!r).slice(0, 8);
  const urls = (await Promise.all(refs.map(async (r) => {
    const pr = await fetch(`/api/places/photo/by-reference?photo_reference=${encodeURIComponent(r)}&maxwidth=800`);
    const pj = await pr.json();
    return (pj.url as string | undefined) ?? null;
  }))).filter((u): u is string => !!u);
  return { photos: urls, website: (json.result?.website as string | undefined) ?? null };
}

export default function StayCardSheet({ inPanel = false, backLabel = "Back", candidate: c, brief, startDate, endDate, nights, priceYear = null, busy, onChoose, onSave, onClose }: Props) {
  // The search already resolved the first few photos; only an older row still fetches.
  const [photos, setPhotos] = useState<string[] | null>(c.photos?.length ? c.photos : null);
  const [website, setWebsite] = useState<string | null>(c.url);
  const [idx, setIdx] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useEffect(() => { cardRef.current?.focus(); }, []);
  const step = (dir: 1 | -1) => { const el = stripRef.current; if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" }); };

  useEffect(() => {
    let cancelled = false;
    if (c.photos?.length) return;
    if (!c.google_place_id) { setPhotos([]); return; }
    loadPhotos(c.google_place_id)
      .then((r) => { if (!cancelled) { setPhotos(r.photos); if (r.website) setWebsite(r.website); } })
      .catch(() => { if (!cancelled) setPhotos([]); });
    return () => { cancelled = true; };
  }, [c.google_place_id, c.photos]);

  const chosen = c.status === "chosen";
  const scale: 5 | 10 = c.score_scale === 10 ? 10 : 5;
  // Only what the listing actually says. "Fits your 7 · needs 4 bedrooms" was
  // a floor dressed up as a fact (Brennan, 9 Sept 2026); without a bed count
  // the line is not shown at all.
  const fitLine = c.beds != null || c.baths != null
    ? [c.beds != null ? `${c.beds} ${c.beds === 1 ? "bedroom" : "bedrooms"}` : null, c.baths != null ? `${c.baths} ${c.baths === 1 ? "bath" : "baths"}` : null, c.sleeps != null ? `sleeps ${c.sleeps}` : null].filter(Boolean).join(" · ")
    : null;
  const fitShort = brief && c.beds != null && c.beds < brief.fit.bedrooms
    ? `${brief.fit.bedrooms - c.beds} bedroom${brief.fit.bedrooms - c.beds === 1 ? "" : "s"} short for your ${brief.party.total}`
    : null;
  const partyN = brief?.party.total;

  return (
    <div className={inPanel ? "absolute inset-0 z-[70] flex" : "fixed inset-0 z-[70] flex items-end"} role="dialog" aria-label={c.name}>
      {!inPanel && <div className="absolute inset-0 bg-black/40" onClick={onClose} />}
      <div ref={cardRef} tabIndex={-1} className={inPanel
        ? "relative w-full h-full bg-white flex flex-col overflow-hidden outline-none"
        : "relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet h-[95dvh] flex flex-col overflow-hidden outline-none"}>
        {/* Photos */}
        <div className={`relative flex-shrink-0 bg-gray-100 ${inPanel ? "h-[190px]" : "h-[220px]"}`}>
          {photos === null ? (
            <p className="absolute inset-0 flex items-center justify-center text-[13px]" style={{ color: CAPTION }}>Loading photos…</p>
          ) : photos.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center text-[13px]" style={{ color: CAPTION }}>No photos on Google for this one.</p>
          ) : (
            <div
              ref={stripRef}
              className="absolute inset-0 flex overflow-x-auto no-scrollbar"
              style={{ scrollSnapType: "x mandatory" }}
              onScroll={(e) => { const el = e.currentTarget; setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}
            >
              {photos.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={u} alt="" className="w-full h-full flex-none object-cover" style={{ scrollSnapAlign: "start" }} loading={i < 2 ? "eager" : "lazy"} />
              ))}
            </div>
          )}
          {photos && photos.length > 1 && idx > 0 && (
            <button type="button" aria-label="Previous photo" onClick={() => step(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-700">‹</button>
          )}
          {photos && photos.length > 1 && idx < photos.length - 1 && (
            <button type="button" aria-label="Next photo" onClick={() => step(1)} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-700">›</button>
          )}
          {photos && photos.length > 1 && (
            <div className="absolute bottom-2.5 inset-x-0 flex justify-center gap-1.5 pointer-events-none">
              {photos.map((_, i) => <span key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: i === idx ? "#fff" : "rgba(255,255,255,0.55)" }} />)}
            </div>
          )}
          {inPanel ? (
            <button type="button" onClick={onClose} aria-label={backLabel} className="absolute top-3 left-3 h-8 px-3 rounded-full bg-white/90 flex items-center gap-1.5 text-[12.5px] font-medium text-gray-800 shadow">
              <span aria-hidden="true">‹</span>{backLabel}
            </button>
          ) : (
            <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-gray-600 shadow">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-28">
          <h2 className="text-[19px] font-bold text-gray-900 leading-snug">
            {c.name}{chosen && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide align-middle" style={{ color: SIENNA }}>Your stay</span>}
          </h2>
          {c.address && <p className="text-[13px] mt-1" style={{ color: CAPTION }}>{c.address}</p>}
          {c.flags?.length > 0 && <p className="text-[12px] font-medium mt-2" style={{ color: SIENNA }}>{c.flags.join(" · ")}</p>}

          <div className="mt-5 space-y-4">
            {fitLine && (
              <Row icon="🛏" k={partyN ? `Fits your ${partyN}` : "Fit"}>
                {fitLine}
                {fitShort && <span className="block font-normal" style={{ color: SIENNA }}>{fitShort}</span>}
                {(c.pool != null || c.ac != null) && (
                  <span className="block font-normal" style={{ color: CAPTION }}>{[c.pool ? "Pool" : c.pool === false ? "No pool" : null, c.ac ? "AC" : c.ac === false ? "No AC" : null].filter(Boolean).join(" · ")}</span>
                )}
              </Row>
            )}
            <Row icon="💶" k={`${fmtRange(startDate, endDate)} · ${nights} ${nights === 1 ? "night" : "nights"}`}>
              {c.total != null ? (
                <>
                  {`${cad(Number(c.total))}${c.nightly_cad != null ? ` · ${cad(Number(c.nightly_cad))} a night` : ""}${c.site ? ` · ${siteName(c.site)}` : ""}`}
                  {priceYear && (
                    <span className="block font-normal" style={{ color: SIENNA }}>
                      Typical: this is the same week in {priceYear}, the closest anyone quotes.
                    </span>
                  )}
                </>
              ) : (
                <span className="font-normal" style={{ color: CAPTION }}>No price yet — nobody is quoting these dates.</span>
              )}
            </Row>
            {c.drive?.line && <Row icon="🚗" k="From here">{c.drive.line}</Row>}
            {(c.score != null || c.review_notes) && (
              <Row icon="💬" k={c.score != null ? `${scoreLabel(c.score, scale, c.reviews)}${c.site ? ` on ${siteName(c.site)}` : ""}` : "Reviews"}>
                {c.review_notes ? <span className="font-normal">{c.review_notes}</span> : <span className="font-normal" style={{ color: CAPTION }}>{c.reviews ?? 0} reviews on Google</span>}
              </Row>
            )}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-white border-t border-gray-100 px-5 pt-3 pb-6 flex gap-2">
          <button
            type="button"
            disabled={busy || chosen}
            onClick={onChoose}
            className="flex-1 h-12 rounded-full text-[15px] font-semibold text-white disabled:opacity-60"
            style={{ background: INK }}
          >
            {chosen ? "Chosen" : busy ? "…" : "Choose"}
          </button>
          {c.status === "candidate" && (
            <button type="button" disabled={busy} onClick={onSave} className="flex-1 h-12 rounded-full text-[15px] font-semibold" style={{ color: INK, border: "1px solid rgba(26,26,46,0.25)" }}>
              Save
            </button>
          )}
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer" className="h-12 px-4 inline-flex items-center text-[14px] font-medium" style={{ color: CAPTION }}>
              {c.site && c.site !== "google" ? siteName(c.site) : "Website"} ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ icon, k, children }: { icon: string; k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex-shrink-0 w-5 text-center text-base mt-0.5 leading-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{k}</p>
        <p className="text-[14px] font-medium text-gray-800 leading-snug">{children}</p>
      </div>
    </div>
  );
}
