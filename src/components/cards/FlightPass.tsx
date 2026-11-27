"use client";

/**
 * The boarding-pass flight card (19 Nov 2026, Brennan approved the mocks):
 * the top of a flight card reads like a boarding pass, from → to, both times,
 * how long, "next day"; seat, terminal and confirmation in one strip. Under it,
 * the layover row when the flight connects (lib/week/flightTime: worked out,
 * never typed), and on the owner's card "+ Add a connecting flight".
 */

import { useEffect, useRef, useState } from "react";
import { firstName, travellersOf, viewFor, type BoardingPass } from "@/lib/flights/travellers";
import type { Card, Day } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { formatTimeValue } from "@/lib/formatTime";
import { lengthLabel } from "@/lib/flights/airportZones";
import { passDate, airportSearch, type FlightPassView } from "@/lib/flights/pass";
import { placeName, type Layover } from "@/lib/week/flightTime";
import { flightTitle } from "@/lib/confirmations/byHand";
import { resolvePlace } from "@/lib/confirmations/resolvePlace";
import { scheduleCardOnDay } from "@/lib/scheduleCard";

const INK = "#1A1A2E";
const CAP = "rgba(26,26,46,0.55)";
const AMBER = "#B0541F";
const HATCH = "repeating-linear-gradient(135deg, #F5F5F7 0 6px, #ECECF0 6px 8px)";

/** The journey's flight cards (with their places), for the layover row. Refetched when `version` changes. */
export function useTripFlights(tripId: string | null | undefined, enabled: boolean, version: number): Card[] {
  const [cards, setCards] = useState<Card[]>([]);
  useEffect(() => {
    if (!enabled || !tripId) return;
    let off = false;
    createClient()
      .from("cards")
      .select("*, place:places(*)")
      .eq("trip_id", tripId)
      .not("archived", "is", true)
      .then(({ data }) => {
        if (off) return;
        setCards(((data ?? []) as unknown as Card[]).filter((c) => {
          const d = (c.details ?? {}) as Record<string, unknown>;
          return typeof d.origin_airport === "string" && typeof d.arriving_at === "string";
        }));
      });
    return () => { off = true; };
  }, [tripId, enabled, version]);
  return cards;
}

/** Tap to change, the way the card's fields work today. */
export function PassText({ value, placeholder, onSave, className, style, label, plain }: {
  value: string | null; placeholder: string; onSave?: (v: string) => void; className?: string; style?: React.CSSProperties; label: string;
  /** An upright, underlined placeholder (27 Nov 2026: an italic "Add" read as "Ada"). */
  plain?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { if (!editing) setDraft(value ?? ""); }, [value, editing]);
  if (!onSave) return <span className={className} style={style}>{value ?? ""}</span>;
  if (editing) {
    const commit = () => { setEditing(false); if (draft.trim() !== (value ?? "")) onSave(draft.trim()); };
    return (
      <input
        autoFocus aria-label={label} value={draft} placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
        className="w-full min-w-0 bg-white rounded-md px-1.5 py-0.5 text-[13px] font-medium outline-none border border-gray-300"
        style={{ color: INK }}
      />
    );
  }
  return (
    <button type="button" aria-label={value ? `Change ${label}` : `Add ${label}`} onClick={() => setEditing(true)} className={`text-left ${className ?? ""}`} style={style}>
      {value || (plain
        ? <span className="font-normal underline underline-offset-2" style={{ color: "rgba(26,26,46,0.5)" }}>{placeholder}</span>
        : <span className="italic font-normal" style={{ color: "rgba(26,26,46,0.35)" }}>{placeholder}</span>)}
    </button>
  );
}

export function FlightPassTop({ view, readOnly, onSave }: { view: FlightPassView; readOnly: boolean; onSave: (field: string, value: string | null) => void }) {
  const save = (f: string) => (readOnly ? undefined : (v: string) => onSave(f, v || null));
  return (
    <p data-testid="pass-airline" className="flex flex-wrap items-center gap-x-1 text-[13px] font-semibold pr-10 [&>*]:whitespace-nowrap" style={{ color: "rgba(26,26,46,0.75)" }}>
      <PassText label="airline" value={view.airline} placeholder="Airline" onSave={save("airline")} />
      <span aria-hidden="true">·</span>
      <PassText label="flight number" value={view.number} placeholder="Flight no." onSave={save("flight_number")} />
    </p>
  );
}

export function FlightPassBody({ view, details, readOnly, onSave, onTime, name, footer, slide }: {
  view: FlightPassView; details: Record<string, unknown>; readOnly: boolean;
  onSave: (field: string, value: string | null) => void; onTime: () => void;
  /** Whose pass this is, on a card with more than one person (27 Nov 2026). */
  name?: string | null;
  /** Under the seat strip: the person's boarding pass. */
  footer?: React.ReactNode;
  /** One of several passes in the swipe track: it sizes to the track, not the card. */
  slide?: boolean;
}) {
  const save = (f: string) => (readOnly ? undefined : (v: string) => onSave(f, v || null));
  const str = (k: string) => (typeof details[k] === "string" && (details[k] as string).trim() ? (details[k] as string).trim() : null);
  const time = (t: string | null) => (t ? formatTimeValue(t) : null);
  const Time = ({ t, right }: { t: string | null; right?: boolean }) => (
    readOnly ? <p className="text-[16px] font-bold mt-2" style={{ color: INK }}>{time(t) ?? "–"}</p> : (
      <button type="button" onClick={onTime} aria-label="Change the times" className={`block text-[16px] font-bold mt-2 ${right ? "ml-auto" : ""}`} style={{ color: INK }}>
        {time(t) ?? <span className="italic font-normal text-[14px]" style={{ color: "rgba(26,26,46,0.35)" }}>Set time</span>}
      </button>
    )
  );
  const End = ({ which, right }: { which: "from" | "to"; right?: boolean }) => {
    const e = view[which];
    return (
      <div className={`min-w-0 ${right ? "text-right" : ""}`} style={{ maxWidth: "40%" }}>
        <PassText
          label={which === "from" ? "where it leaves from" : "where it lands"}
          value={e.code ?? e.name}
          placeholder={which === "from" ? "From" : "To"}
          onSave={save(which === "from" ? "origin_airport" : "arriving_at")}
          className={`block ${e.code ? "text-[30px] font-extrabold leading-none tracking-tight" : "text-[17px] font-bold leading-tight"} ${right ? "ml-auto text-right" : ""}`}
          style={{ color: INK }}
        />
        {e.code && <p className="text-[11.5px] mt-1 truncate" style={{ color: CAP }}>{e.name}</p>}
        <Time t={which === "from" ? view.departs : view.arrives} right={right} />
        {(which === "from" ? view.departDate : view.arriveDate) && (
          <p className="text-[11px]" style={{ color: which === "to" && view.nextDay ? "#C2620A" : CAP, fontWeight: which === "to" && view.nextDay ? 600 : 400 }}>
            {passDate((which === "from" ? view.departDate : view.arriveDate)!)}{which === "to" && view.nextDay ? " · next day" : ""}
          </p>
        )}
        {/* Terminal sits under the time it leaves (27 Nov 2026 mock): the strip is the person's. */}
        {which === "from" && (str("terminal") || !readOnly) && (
          <p className="text-[11px] mt-0.5" data-testid="pass-terminal" style={{ color: CAP }}>
            Terminal{" "}<PassText label="terminal" value={str("terminal")} placeholder="Add" onSave={save("terminal")} plain className="text-[11px] font-semibold" style={{ color: INK }} />
          </p>
        )}
      </div>
    );
  };
  return (
    <div data-testid="flight-pass" className={`${slide ? "" : "mt-3 "}rounded-2xl px-3.5 pt-3.5 pb-3`}
      style={slide ? { background: "#F6F7F9", flex: "0 0 calc(100% - 22px)", scrollSnapAlign: "center", scrollSnapStop: "always" } : { background: "#F6F7F9" }}>
      <div className="flex items-start justify-between gap-2">
        <End which="from" />
        <div className="flex-1 pt-2.5 text-center text-[11px] min-w-0" style={{ color: CAP }}>
          <span data-testid="pass-length">{view.minutes ? lengthLabel(view.minutes) : " "}</span>
          <div className="relative h-3.5 my-1">
            <div className="absolute inset-x-0 top-[7px] border-t-[1.5px] border-dashed" style={{ borderColor: "#b9b9c4" }} />
            <span className="relative px-1 text-[13px]" style={{ background: "#F6F7F9", color: INK }}>✈</span>
          </div>
        </div>
        <End which="to" right />
      </div>
      <div className="flex border-t border-dashed mt-3 pt-2.5" style={{ borderColor: "#d8d8e0" }}>
        {name && (
          <div className="flex-1 min-w-0" data-testid="pass-name">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#9a9aa8" }}>Traveller</p>
            <span className="block text-[13.5px] font-bold truncate" style={{ color: INK }}>{name}</span>
          </div>
        )}
        {([["seat", "Seat"], ...(readOnly ? [] : [["confirmation", "Confirmation"]])] as [string, string][]).map(([k, label]) => (
          <div key={k} className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#9a9aa8" }}>{label}</p>
            <PassText label={label.toLowerCase()} value={str(k)} placeholder="Add" onSave={save(k)} plain className="block text-[13.5px] font-bold truncate max-w-full" style={{ color: INK }} />
          </div>
        ))}
      </div>
      {footer}
    </div>
  );
}

/** A private file's address, signed for an hour (card-attachments is a private bucket). */
export function useSignedUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let off = false;
    createClient().storage.from("card-attachments").createSignedUrl(path, 3600)
      .then(({ data }) => { if (!off) setUrl(data?.signedUrl ?? null); })
      .catch(() => { /* no picture: the row still says Boarding pass */ });
    return () => { off = true; };
  }, [path]);
  return url;
}

const isImageFile = (bp: BoardingPass) => (bp.type ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(bp.name);

/** Under the seat strip: the boarding pass to show at the gate, or a slim row to add one (27 Nov 2026). */
export function BoardingPassRow({ bp, who, readOnly, onAdd, onOpen }: {
  bp: BoardingPass | null | undefined; who: string | null; readOnly: boolean; onAdd: () => void; onOpen: () => void;
}) {
  const url = useSignedUrl(bp?.path);
  if (!bp) {
    if (readOnly) return null;
    // Slim, one line (his note on the mock: "a little smaller height-wise").
    return (
      <button type="button" data-testid="add-boarding-pass" onClick={onAdd}
        className="mt-3 w-full h-10 rounded-xl text-[13px] font-semibold active:opacity-70"
        style={{ color: INK, border: "1.5px dashed #c6c6d0" }}>
        + Add {who ? `${who}'s` : "a"} boarding pass
      </button>
    );
  }
  return (
    <button type="button" data-testid="boarding-pass" onClick={onOpen}
      className="mt-3 w-full flex items-center gap-3 rounded-xl bg-white px-2.5 py-2 text-left active:opacity-70"
      style={{ boxShadow: "inset 0 0 0 1px #E4E4EA" }}>
      {url && isImageFile(bp)
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" className="w-11 h-11 rounded-md object-cover flex-shrink-0" />
        : <span aria-hidden="true" className="w-11 h-11 rounded-md grid place-items-center text-[10px] font-extrabold flex-shrink-0" style={{ background: "#EEEFF2", color: INK }}>{isImageFile(bp) ? "" : "PDF"}</span>}
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold" style={{ color: INK }}>Boarding pass</span>
        <span className="block text-[12px]" style={{ color: CAP }}>Tap to enlarge</span>
      </span>
    </button>
  );
}

/**
 * Everyone's pass, one swipe apart (27 Nov 2026, approved mock). One person:
 * the pass as it always was, with their boarding pass under it. Several: a
 * sideways track of passes, the dots and whose it is under them. Only the
 * passes move; the rest of the card stays where it is.
 */
export function FlightPasses({ view, details, readOnly, onSave, onTime, index, onIndex, onAddPass, onOpenPass }: {
  view: FlightPassView; details: Record<string, unknown>; readOnly: boolean;
  onSave: (field: string, value: string | null) => void; onTime: () => void;
  index: number; onIndex: (i: number) => void;
  onAddPass: (i: number) => void; onOpenPass: (i: number) => void;
}) {
  const people = travellersOf(details);
  const trackRef = useRef<HTMLDivElement>(null);
  const footer = (i: number) => (
    <BoardingPassRow bp={people[i].boarding_pass} who={people.length > 1 ? firstName(people[i].name) : null} readOnly={readOnly}
      onAdd={() => onAddPass(i)} onOpen={() => onOpenPass(i)} />
  );
  if (people.length < 2) {
    return <FlightPassBody view={view} details={details} readOnly={readOnly} onSave={onSave} onTime={onTime} footer={footer(0)} />;
  }
  const onScroll = () => {
    const el = trackRef.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const i = Math.round(el.scrollLeft / (first.getBoundingClientRect().width + 10));
    const next = Math.max(0, Math.min(people.length - 1, i));
    if (next !== index) onIndex(next);
  };
  // A mouse can't swipe (27 Nov 2026, his computer): the dots, the arrows and the
  // edge of the next pass all go to that person.
  const go = (i: number) => {
    const el = trackRef.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    const to = slide.offsetLeft - (el.firstElementChild as HTMLElement).offsetLeft;
    if (typeof el.scrollTo === "function") el.scrollTo({ left: to, behavior: "smooth" }); else el.scrollLeft = to;
    onIndex(i);
  };
  const who = (i: number) => firstName(people[i]?.name) ?? `Traveller ${i + 1}`;
  const arrow = (dir: -1 | 1) => {
    const to = index + dir;
    return (
      <button type="button" data-testid={dir > 0 ? "pass-next" : "pass-prev"} disabled={to < 0 || to >= people.length} onClick={() => go(to)}
        aria-label={to >= 0 && to < people.length ? `Show ${who(to)}'s pass` : dir > 0 ? "No next pass" : "No previous pass"}
        className="hidden md:grid w-7 h-7 rounded-full place-items-center text-[15px] disabled:opacity-30 hover:bg-gray-100"
        style={{ color: INK }}>
        {dir > 0 ? "›" : "‹"}
      </button>
    );
  };
  return (
    <div className="mt-3">
      <div ref={trackRef} data-testid="pass-track" onScroll={onScroll}
        onClickCapture={(e) => {
          // A tap on the next pass's edge goes to it, rather than editing a field you can barely see.
          const slide = (e.target as HTMLElement).closest('[data-testid="flight-pass"]');
          const i = slide && trackRef.current ? Array.prototype.indexOf.call(trackRef.current.children, slide) : -1;
          if (i >= 0 && i !== index) { e.preventDefault(); e.stopPropagation(); go(i); }
        }}
        className="flex gap-2.5 overflow-x-auto -mx-5 px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x mandatory", overscrollBehaviorX: "contain" }}>
        {people.map((p, i) => (
          <FlightPassBody key={i} slide view={view} details={viewFor(details, i)} readOnly={readOnly} onSave={onSave} onTime={onTime}
            name={firstName(p.name) ?? `Traveller ${i + 1}`} footer={footer(i)} />
        ))}
      </div>
      <div className="flex items-center justify-center gap-2.5 mt-1.5">
        {arrow(-1)}
        <div className="flex">
          {people.map((_, i) => (
            <button key={i} type="button" data-testid="pass-dot" onClick={() => go(i)} aria-label={`Show ${who(i)}'s pass`} aria-current={i === index}
              className="py-2.5 px-[2.5px]">
              <span className="block h-1.5 rounded-full transition-all" style={{ width: i === index ? 16 : 6, background: i === index ? INK : "#D3D3DB" }} />
            </button>
          ))}
        </div>
        {arrow(1)}
        <span data-testid="pass-count" className="sr-only">
          {firstName(people[index]?.name) ?? `Traveller ${index + 1}`} · {index + 1} of {people.length}
        </span>
      </div>
    </div>
  );
}

/** The boarding passes full screen, for the scanner at the gate; swipe for the next person. */
export function BoardingPassViewer({ details, start, readOnly, onRemove, onClose }: {
  details: Record<string, unknown>; start: number; readOnly: boolean; onRemove: (i: number) => void; onClose: () => void;
}) {
  const people = travellersOf(details);
  const withPass = people.map((p, i) => ({ p, i })).filter((x) => !!x.p.boarding_pass);
  const [at, setAt] = useState(Math.max(0, withPass.findIndex((x) => x.i === start)));
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollLeft = at * el.clientWidth;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  if (!withPass.length) return null;
  const cur = withPass[Math.min(at, withPass.length - 1)];
  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-white" role="dialog" aria-label="Boarding pass" data-testid="pass-viewer"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-[15px] font-bold" style={{ color: INK }}>{firstName(cur.p.name) ? `${firstName(cur.p.name)}'s boarding pass` : "Boarding pass"}</p>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button type="button" onClick={() => onRemove(cur.i)} className="px-3 h-9 rounded-full text-[13px]" style={{ color: CAP }}>Remove</button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full grid place-items-center" style={{ background: "#F2F2F5", color: INK }}>✕</button>
        </div>
      </div>
      <div ref={trackRef} className="flex-1 flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollSnapType: "x mandatory" }}
        onScroll={(e) => { const el = e.currentTarget; setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}>
        {withPass.map(({ p, i }) => <PassPage key={i} bp={p.boarding_pass!} />)}
      </div>
      {withPass.length > 1 && <p className="text-center text-[12px] pb-4 pt-2" style={{ color: CAP }}>Swipe for the next person · {Math.min(at, withPass.length - 1) + 1} of {withPass.length}</p>}
    </div>
  );
}

function PassPage({ bp }: { bp: BoardingPass }) {
  const url = useSignedUrl(bp.path);
  return (
    <div className="flex-[0_0_100%] flex items-center justify-center px-4" style={{ scrollSnapAlign: "center" }}>
      {!url ? <p className="text-[13px]" style={{ color: CAP }}>Opening…</p>
        : isImageFile(bp)
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="Boarding pass" className="max-w-full max-h-full object-contain" />
          : <iframe src={url} title="Boarding pass" className="w-full h-full border-0" />}
    </div>
  );
}

const flightName = (c: Card) => {
  const d = (c.details ?? {}) as Record<string, unknown>;
  const n = typeof d.flight_number === "string" ? d.flight_number.replace(/^([A-Z0-9]{2})\s*(\d+)$/i, "$1 $2").toUpperCase() : null;
  return n || "the flight";
};
const placeOf = (c: Card, k: "origin_airport" | "arriving_at") => {
  const v = ((c.details ?? {}) as Record<string, unknown>)[k];
  return typeof v === "string" ? placeName(v) : "";
};

/** "1 h 25 layover in Frankfurt · Then LH 330 to Pisa, 10:00 AM ›" (or "After AC 876 from Toronto"). */
export function LayoverRow({ layover, side, onOpen }: { layover: Layover<Card>; side: "before" | "after"; onOpen?: (c: Card) => void }) {
  const mins = layover.end - layover.start;
  const tight = mins < 60;
  const other = side === "after" ? layover.leaves : layover.arrived;
  const line = side === "after"
    ? `Then ${flightName(other)} to ${placeOf(other, "arriving_at")}${other.start_time ? `, ${formatTimeValue(other.start_time)}` : ""}`
    : `After ${flightName(other)} from ${placeOf(other, "origin_airport")}`;
  const body = (
    <>
      <span aria-hidden="true" className="text-[15px]">⇄</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold" style={{ color: tight ? AMBER : "#4a4c5c" }}>
          {tight ? `Tight connection · ${lengthLabel(mins)} in ${layover.at}` : `${lengthLabel(mins)} layover in ${layover.at}`}
        </span>
        <span className="block text-[12px] truncate" style={{ color: CAP }}>{line}</span>
      </span>
      {onOpen && <span aria-hidden="true" className="text-[16px]" style={{ color: "#8a8a99" }}>›</span>}
    </>
  );
  const cls = "mt-2.5 w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left";
  const style = { background: HATCH, border: `1px dashed ${tight ? "#E2B48E" : "#C9C9D2"}` };
  return onOpen
    ? <button type="button" data-testid={`layover-${side}`} onClick={() => onOpen(other)} className={cls} style={style}>{body}</button>
    : <div data-testid={`layover-${side}`} className={cls} style={style}>{body}</div>;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/** "+ Add a connecting flight": a short form, From and Day filled in from where and when this one lands. */
export function ConnectingFlight({ card, view, days, onAdded, fromMenu, onDone }: {
  card: Card; view: FlightPassView; days: Day[]; onAdded: (c: Card) => void;
  /** Opened from the card's ⋯ (27 Nov 2026): the form shows at once, and closing it leaves nothing behind. */
  fromMenu?: boolean; onDone?: () => void;
}) {
  const [open, setOpenRaw] = useState(!!fromMenu);
  const setOpen = (v: boolean) => { setOpenRaw(v); if (!v) onDone?.(); };
  const landDay = days.find((d) => d.date === view.arriveDate) ?? days.find((d) => d.id === card.day_id) ?? null;
  const [f, setF] = useState({ number: "", from: view.to.raw, to: "", dayId: landDay?.id ?? "", departs: "", arrives: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) {
    if (fromMenu) return null;
    return (
      <button type="button" data-testid="add-connecting" onClick={() => { setF((x) => ({ ...x, from: view.to.raw, dayId: landDay?.id ?? x.dayId })); setOpen(true); }}
        className="relative mt-3 min-h-[44px] text-[13.5px] font-semibold underline underline-offset-[3px]" style={{ color: INK }}>
        + Add a connecting flight
      </button>
    );
  }
  const input = "w-full mt-1 px-3 py-2 text-[14px] bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white";
  const lab = "text-[10.5px] font-semibold uppercase tracking-wide";
  const ready = f.to.trim() && f.dayId && f.departs;
  const save = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr(null);
    const sub = (card.place?.sub_type === "flight_departure" ? "flight_departure" : "flight_arrival") as "flight_arrival" | "flight_departure";
    const flight = { flight_number: f.number.trim() || null, origin_airport: f.from.trim(), arriving_at: f.to.trim() };
    const place = await resolvePlace({ type: sub, title: f.to.trim(), address: airportSearch(f.to), confirmation_number: null, date: null, time: null, end_time: null, phone: null, website: null, notes: null });
    const d = card.details as Record<string, unknown>;
    // Same airline code as this flight (AC → AC): the airline carries over.
    const prefix = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, 2).toUpperCase() : "");
    const airline = typeof d.airline === "string" && prefix(f.number) !== "" && prefix(f.number) === prefix(d.flight_number) ? d.airline : null;
    const made = await scheduleCardOnDay(createClient(), {
      tripId: card.trip_id, dayId: f.dayId, placeId: place?.id ?? null, place: place ?? null,
      details: { title: flightTitle(flight), ...flight, ...(airline ? { airline } : {}) } as Card["details"],
      startTime: `${f.departs}:00`, endTime: f.arrives ? `${f.arrives}:00` : null, sourceUrl: null,
    });
    setBusy(false);
    if (!made) { setErr("Couldn't add the flight. Nothing was added. Try again."); return; }
    setOpen(false);
    setF({ number: "", from: view.to.raw, to: "", dayId: landDay?.id ?? "", departs: "", arrives: "" });
    onAdded(made);
  };
  return (
    <div data-testid="connecting-form" className="mt-3 rounded-2xl p-3.5" style={{ boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.12)" }}>
      <p className="text-[15px] font-bold" style={{ color: INK }}>Connecting flight</p>
      {view.arriveDate && view.arrives && (
        <p className="text-[12px] mb-2" style={{ color: CAP }}>After {view.number ?? "this flight"} lands in {view.to.name} · {passDate(view.arriveDate)}, {formatTimeValue(view.arrives)}</p>
      )}
      <label className={lab} style={{ color: "#8a8a99" }}>Flight
        <input className={input} value={f.number} placeholder="e.g. LH 330" onChange={(e) => setF({ ...f, number: e.target.value })} />
      </label>
      <div className="flex gap-2 mt-2">
        <label className={`flex-1 min-w-0 ${lab}`} style={{ color: "#8a8a99" }}>From
          <input className={input} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </label>
        <label className={`flex-1 min-w-0 ${lab}`} style={{ color: "#8a8a99" }}>To
          <input className={input} value={f.to} placeholder="Pisa PSA" onChange={(e) => setF({ ...f, to: e.target.value })} />
        </label>
      </div>
      <div className="flex gap-2 mt-2">
        <label className={`flex-[1.2] min-w-0 ${lab}`} style={{ color: "#8a8a99" }}>Day
          <select className={`${input} appearance-none`} value={f.dayId} onChange={(e) => setF({ ...f, dayId: e.target.value })}>
            {days.filter((d) => !view.departDate || d.date >= view.departDate).filter((d) => !view.departDate || d.date <= addDays(view.departDate, 2)).map((d) => (
              <option key={d.id} value={d.id}>{passDate(d.date)}</option>
            ))}
          </select>
        </label>
        <label className={`flex-1 min-w-0 ${lab}`} style={{ color: "#8a8a99" }}>Departs
          <input type="time" className={input} value={f.departs} onChange={(e) => setF({ ...f, departs: e.target.value })} />
        </label>
        <label className={`flex-1 min-w-0 ${lab}`} style={{ color: "#8a8a99" }}>Arrives
          <input type="time" className={input} value={f.arrives} onChange={(e) => setF({ ...f, arrives: e.target.value })} />
        </label>
      </div>
      {err && <p className="mt-2 text-[13px]" style={{ color: AMBER }}>{err}</p>}
      <div className="flex items-center gap-3 mt-3">
        <button type="button" onClick={() => void save()} disabled={!ready || busy}
          className="flex-1 h-11 rounded-full text-[14px] font-semibold text-white disabled:opacity-40" style={{ background: INK }}>
          {busy ? "Adding…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] px-2 text-[13.5px] underline underline-offset-2" style={{ color: CAP }}>Cancel</button>
      </div>
    </div>
  );
}
