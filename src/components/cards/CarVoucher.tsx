"use client";

/**
 * The rental voucher on a rental car card (19 Nov 2026, approved mock): the
 * top reads like the voucher a rental site sends, pick-up and drop-off side by
 * side; confirmation, price and phone in one strip; then Car, Pick-up and Fuel.
 * Same look as the flight's boarding pass (FlightPass). Logic: lib/cars/voucher.
 */

import { useEffect, useState } from "react";
import type { Card } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { formatTimeValue } from "@/lib/formatTime";
import { passDate } from "@/lib/flights/pass";
import { paidLabel, readPaid, type RentalVoucher } from "@/lib/cars/voucher";
import { PassText } from "./FlightPass";

const INK = "#1A1A2E";
const CAP = "rgba(26,26,46,0.55)";
const FAINT = "#9a9aa8";

/** The journey's rental car cards, to pair a pick-up with its return. */
export function useTripRentals(tripId: string | null | undefined, enabled: boolean): Card[] {
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
        if (!off) setCards(((data ?? []) as unknown as Card[]).filter((c) => c.place?.sub_type === "car_rental"));
      });
    return () => { off = true; };
  }, [tripId, enabled]);
  return cards;
}

export function CarVoucherTop({ v, readOnly, onSave }: { v: RentalVoucher; readOnly: boolean; onSave: (field: string, value: string | null) => void }) {
  return (
    <p data-testid="voucher-company" className="flex items-center gap-1 text-[13px] font-semibold pr-10" style={{ color: "rgba(26,26,46,0.75)" }}>
      <PassText label="rental company" value={v.company} placeholder="Rental company" onSave={readOnly ? undefined : (x) => onSave("company", x || null)} />
      <span aria-hidden="true">·</span>
      <span>{v.side === "return" ? "Return it" : "Rental car"}</span>
      {!v.booked && <span className="font-medium" style={{ color: "#B0541F" }}>· not booked yet</span>}
    </p>
  );
}

export function CarVoucherBody({ v, readOnly, onSave, onPatch, onTime }: {
  v: RentalVoucher; readOnly: boolean; onSave: (field: string, value: unknown) => void;
  /** Several fields in one write (the price and its currency). */
  onPatch: (patch: Record<string, unknown>) => void; onTime: () => void;
}) {
  const save = (f: string) => (readOnly ? undefined : (x: string) => onSave(f, x || null));
  const [paidHint, setPaidHint] = useState(false);
  const End = ({ which }: { which: "pickup" | "dropoff" }) => {
    const e = v[which];
    const mine = (which === "pickup") === (v.side === "pickup");
    const right = which === "dropoff";
    const time = e.time ? formatTimeValue(e.time) : null;
    return (
      <div className={`min-w-0 ${right ? "text-right" : ""}`} style={{ maxWidth: "44%" }}>
        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: mine ? INK : FAINT }}>{which === "pickup" ? "Pick up" : "Drop off"}</p>
        <p className="text-[19px] font-extrabold leading-tight mt-1" style={{ color: mine ? INK : FAINT }}>{e.date ? passDate(e.date) : "–"}</p>
        {mine && !readOnly ? (
          <button type="button" onClick={onTime} aria-label="Change the time" className={`block text-[15px] font-bold mt-0.5 ${right ? "ml-auto" : ""}`} style={{ color: INK }}>
            {time ?? <span className="italic font-normal text-[13px]" style={{ color: "rgba(26,26,46,0.35)" }}>Set time</span>}
          </button>
        ) : (
          <p className="text-[15px] font-bold mt-0.5" style={{ color: mine ? INK : FAINT }}>{time ?? "–"}</p>
        )}
        {e.where && <p className="text-[11.5px] mt-1 leading-snug" style={{ color: CAP }}>{e.where}</p>}
      </div>
    );
  };
  const strip: [string, string, string | null, ((x: string) => void) | undefined][] = [
    ...(readOnly ? [] : [["confirmation", "Confirmation", v.confirmation, save("confirmation")] as [string, string, string | null, ((x: string) => void) | undefined]]),
    // The price lives on the pick-up card (one per booking), so it is changed there.
    ["paid", "Paid", v.paid ? paidLabel(v.paid) : null, readOnly || v.side === "return" ? undefined : (x: string) => {
      const p = readPaid(x);
      if (!p) { setPaidHint(true); return; }
      setPaidHint(false);
      onPatch({ paid_total: p.amount, paid_currency: p.currency });
    }],
    ["phone", "Phone", v.phone, save("phone")],
  ];
  const lines: [string, string, string, string | null, string][] = [
    ["🚐", "Car", "car_class", v.carClass, "e.g. van for 5 + luggage, automatic"],
    ...(v.side === "pickup" ? [["🧭", "Pick-up", "pickup_instructions", v.pickupInfo, "Where the desk is: in the terminal, or a shuttle"] as [string, string, string, string | null, string]] : []),
    ["⛽", "Fuel", "fuel_policy", v.fuel, "e.g. return it full"],
  ];
  return (
    <div data-testid="car-voucher">
      <div className="mt-3 rounded-2xl px-3.5 pt-3.5 pb-3" style={{ background: "#F6F7F9" }}>
        <div className="flex items-start justify-between gap-2">
          <End which="pickup" />
          <div className="flex-1 pt-5 text-center text-[11px] min-w-0" style={{ color: CAP }}>
            <span data-testid="voucher-days">{v.days != null ? `${v.days} ${v.days === 1 ? "day" : "days"}` : " "}</span>
            <div className="relative h-3.5 my-1">
              <div className="absolute inset-x-0 top-[7px] border-t-[1.5px] border-dashed" style={{ borderColor: "#b9b9c4" }} />
              <span className="relative px-1 text-[13px]" style={{ background: "#F6F7F9" }}>🚗</span>
            </div>
          </div>
          <End which="dropoff" />
        </div>
        <div className="flex border-t border-dashed mt-3 pt-2.5" style={{ borderColor: "#d8d8e0" }}>
          {strip.map(([k, label, value, onS]) => (
            <div key={k} className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: FAINT }}>{label}</p>
              <PassText label={label.toLowerCase()} value={value} placeholder={k === "paid" ? "e.g. €450" : "Add"} onSave={onS} className="block text-[13px] font-bold truncate max-w-full" style={{ color: INK }} />
            </div>
          ))}
        </div>
        {paidHint && <p className="mt-1 text-[11.5px]" style={{ color: "#B0541F" }}>Say the currency too: €450, 450 EUR, US$300.</p>}
      </div>
      <div className="mt-3">
        {lines.map(([icon, label, field, value, ph]) => (
          <div key={field} className="flex gap-3 py-2 border-b border-gray-100 last:border-b-0">
            <span aria-hidden="true" className="w-5 text-center text-[15px]">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: FAINT }}>{label}</p>
              <PassText label={label.toLowerCase()} value={value} placeholder={ph} onSave={save(field)} className="block text-[13.5px] font-semibold leading-snug" style={{ color: INK }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
