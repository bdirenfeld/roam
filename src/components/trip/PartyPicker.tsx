"use client";

import { useState } from "react";
import { partySize, partyLine, type Party } from "@/lib/party";

/**
 * Who is travelling: adults, kids with their ages, seniors (30 Sep 2026,
 * Brennan: "put in kids, their ages, and if people are seniors"). One control
 * for New journey and Trip settings, in the row style both already use. The
 * ages feed Plan my trip's pace and Find (lib/party).
 *
 * One line until tapped ("2 adults · 3 kids (10, 8, 5)"): set once a trip,
 * so the counters and age pickers are not on the screen the rest of the time
 * (his "is this the best design", same day).
 */

const KID_DEFAULT = 8;

function Stepper({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] text-[#1A1A2E] w-16">{label}</span>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-[14px] leading-none disabled:opacity-30 active:scale-90 transition-transform"
        aria-label={`Fewer ${label.toLowerCase()}`}
      >
        −
      </button>
      <span className="text-[14px] text-[#1A1A2E] tabular-nums w-4 text-center">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-[14px] leading-none active:scale-90 transition-transform"
        aria-label={`More ${label.toLowerCase()}`}
      >
        +
      </button>
    </div>
  );
}

export default function PartyPicker({ party, onChange, labelClass }: { party: Party; onChange: (p: Party) => void; labelClass: string }) {
  const [open, setOpen] = useState(false);
  const total = partySize(party);
  // Never fewer than one traveller.
  const min = (n: number) => (total - n >= 1 ? 0 : n);
  return (
    <div className="border-b border-black/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center px-5 py-[14px] text-left"
      >
        <span className={`text-[10px] uppercase tracking-widest w-20 flex-shrink-0 ${labelClass}`}>Travellers</span>
        <span className="flex-1 text-[14px] text-[#1A1A2E]">{partyLine(party)}</span>
        <span className="text-[12px] text-gray-400 flex-shrink-0">{open ? "Done" : "Change"}</span>
      </button>
      {open && (
      <div className="flex flex-col gap-2.5 pl-[100px] pr-5 pb-[14px]">
        <Stepper label="Adults" value={party.adults} min={min(party.adults)} onChange={(n) => onChange({ ...party, adults: n })} />
        <Stepper
          label="Kids"
          value={party.kids.length}
          min={min(party.kids.length)}
          onChange={(n) => onChange({ ...party, kids: n > party.kids.length ? [...party.kids, KID_DEFAULT] : party.kids.slice(0, n) })}
        />
        {party.kids.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pl-[76px] -mt-1">
            {party.kids.map((age, i) => (
              <select
                key={i}
                value={age}
                onChange={(e) => onChange({ ...party, kids: party.kids.map((a, k) => (k === i ? Number(e.target.value) : a)) })}
                aria-label={`Kid ${i + 1}'s age`}
                className="h-7 rounded-full bg-gray-100 px-2.5 text-[12.5px] text-[#1A1A2E] tabular-nums outline-none"
              >
                {Array.from({ length: 18 }, (_, a) => (
                  <option key={a} value={a}>{a === 0 ? "Under 1" : `${a} yr${a === 1 ? "" : "s"}`}</option>
                ))}
              </select>
            ))}
          </div>
        )}
        <Stepper label="Seniors" value={party.seniors} min={min(party.seniors)} onChange={(n) => onChange({ ...party, seniors: n })} />
      </div>
      )}
    </div>
  );
}
