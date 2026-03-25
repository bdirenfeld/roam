"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card, CardType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

// ── Sub-type options per card type ─────────────────────────────
const SUB_TYPES: Record<CardType, { value: string; label: string }[]> = {
  activity: [
    { value: "self_directed", label: "Self-directed" },
    { value: "guided",        label: "Guided" },
    { value: "wellness",      label: "Wellness" },
  ],
  food: [
    { value: "restaurant",   label: "Restaurant" },
    { value: "coffee",       label: "Coffee" },
    { value: "cocktail_bar", label: "Cocktail Bar" },
    { value: "fine_dining",  label: "Fine Dining" },
  ],
  logistics: [
    { value: "flight_arrival",   label: "Flight Arrival" },
    { value: "flight_departure", label: "Flight Departure" },
    { value: "hotel",            label: "Hotel" },
    { value: "transit",          label: "Transit" },
  ],
};

// ── Type tile config ───────────────────────────────────────────
interface TypeConfig {
  label: string;
  bg: string;
  selectedBg: string;
  border: string;
  selectedBorder: string;
  text: string;
  icon: React.ReactNode;
}

const TYPE_CONFIG: Record<CardType, TypeConfig> = {
  activity: {
    label: "Activity",
    bg: "bg-teal-50",
    selectedBg: "bg-teal-100",
    border: "border-teal-100",
    selectedBorder: "border-activity",
    text: "text-activity",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="2" />
        <path d="M12 10v5" />
        <path d="M9 14l3 3 3-3" />
        <path d="M7 20l2-3" />
        <path d="M17 20l-2-3" />
      </svg>
    ),
  },
  food: {
    label: "Food",
    bg: "bg-amber-50",
    selectedBg: "bg-amber-100",
    border: "border-amber-100",
    selectedBorder: "border-food",
    text: "text-food",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
        <path d="M7 2v20" />
        <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
      </svg>
    ),
  },
  logistics: {
    label: "Logistics",
    bg: "bg-slate-50",
    selectedBg: "bg-slate-100",
    border: "border-slate-100",
    selectedBorder: "border-logistics",
    text: "text-logistics",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 4c-1 0-2 .5-2.8 1.3L13 9 4.8 7.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.1z" />
      </svg>
    ),
  },
};

// ── Shared field styles ────────────────────────────────────────
const INPUT_CLS =
  "w-full text-[15px] text-gray-900 bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-activity placeholder:text-gray-300 transition-colors";
const LABEL_CLS =
  "block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className={LABEL_CLS}>{label}</label>
      {children}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────
interface Props {
  dayId: string;
  tripId: string;
  endPosition: number;
  onClose: () => void;
  onCardCreated: (card: Card) => void;
}

export default function CreateCardSheet({
  dayId,
  tripId,
  endPosition,
  onClose,
  onCardCreated,
}: Props) {
  const supabase   = createClient();
  const sheetRef   = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const dragY      = useRef(0);
  const dragging   = useRef(false);

  // ── Base fields ─────────────────────────────────────────────
  const [title,     setTitle]     = useState("");
  const [type,      setType]      = useState<CardType | null>(null);
  const [subType,   setSubType]   = useState<string | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime,   setEndTime]   = useState("");
  const [notes,     setNotes]     = useState("");

  // ── activity/guided ─────────────────────────────────────────
  const [supplier,     setSupplier]     = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [meetingTime,  setMeetingTime]  = useState("");
  const [cost,         setCost]         = useState("");
  const [paid,         setPaid]         = useState(false);

  // ── activity/wellness ────────────────────────────────────────
  const [treatment, setTreatment] = useState("");
  const [goal,      setGoal]      = useState("");
  const [duration,  setDuration]  = useState("");

  // ── food/coffee ──────────────────────────────────────────────
  const [primaryPick,  setPrimaryPick]  = useState("");
  const [backupOption, setBackupOption] = useState("");
  const [coffeeCost,   setCoffeeCost]   = useState("");
  const [vibeEnergy,   setVibeEnergy]   = useState("");

  // ── food/cocktail_bar ─────────────────────────────────────────
  const [cocktailBarAddress, setCocktailBarAddress] = useState("");
  const [cocktailBarWebsite, setCocktailBarWebsite] = useState("");

  // ── food/restaurant ──────────────────────────────────────────
  const [cuisine,       setCuisine]       = useState("");
  const [reservation,   setReservation]   = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [orderPlan,     setOrderPlan]     = useState("");

  // ── logistics/flight ─────────────────────────────────────────
  const [airline,          setAirline]          = useState("");
  const [arrivalAirport,   setArrivalAirport]   = useState("");
  const [departureAirport, setDepartureAirport] = useState("");
  const [flightNumber,     setFlightNumber]     = useState("");
  const [terminal,         setTerminal]         = useState("");
  const [confirmation,     setConfirmation]     = useState("");

  // ── logistics/hotel ──────────────────────────────────────────
  const [hotelAddress, setHotelAddress] = useState("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleTypeSelect = (t: CardType) => {
    setType(t);
    setSubType(null);
  };

  // ── Drag-to-dismiss ──────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragY.current  = e.touches[0].clientY;
    dragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragY.current);
    sheetRef.current.style.transform  = `translateY(${dy}px)`;
    sheetRef.current.style.transition = "none";
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    dragging.current = false;
    const dy = e.changedTouches[0].clientY - dragY.current;
    if (dy > 120) {
      sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32,0.72,0,1)";
      sheetRef.current.style.transform  = "translateY(100%)";
      setTimeout(onClose, 240);
    } else {
      sheetRef.current.style.transition = "transform 300ms cubic-bezier(0.34,1.56,0.64,1)";
      sheetRef.current.style.transform  = "translateY(0)";
    }
  }, [onClose]);

  // ── Create ───────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!title.trim() || !type || saving) return;
    setSaving(true);

    // Format times
    const startTimeFmt = startTime ? `${startTime}:00` : null;
    const endTimeFmt   = endTime   ? `${endTime}:00`   : null;

    // Build details object
    const details: Record<string, unknown> = {};
    if (notes.trim()) details.notes = notes.trim();

    const key = `${type}/${subType ?? ""}`;
    switch (key) {
      case "activity/guided":
        if (supplier.trim())     details.supplier     = supplier.trim();
        if (meetingPoint.trim()) details.meeting_point = meetingPoint.trim();
        if (meetingTime.trim())  details.meeting_time  = meetingTime.trim();
        if (cost.trim())         details.cost_per_person = parseFloat(cost);
        details.paid = paid;
        break;
      case "activity/wellness":
        if (supplier.trim())  details.supplier        = supplier.trim();
        if (treatment.trim()) details.treatment_type  = treatment.trim();
        if (goal.trim())      details.goal            = goal.trim();
        if (duration.trim())  details.duration_minutes = parseInt(duration, 10);
        break;
      case "food/coffee":
        if (primaryPick.trim())  details.primary     = primaryPick.trim();
        if (backupOption.trim()) details.alternative = backupOption.trim();
        if (coffeeCost.trim())   details.cost        = coffeeCost.trim();
        if (vibeEnergy.trim())   details.energy      = vibeEnergy.trim();
        break;
      case "food/cocktail_bar":
        if (cocktailBarWebsite.trim()) details.website = cocktailBarWebsite.trim();
        break;
      case "food/restaurant":
      case "food/fine_dining":
        if (cuisine.trim())       details.cuisine        = cuisine.trim();
        if (reservation.trim())   details.reservation    = reservation.trim();
        if (estimatedCost.trim()) details.estimated_cost = estimatedCost.trim();
        if (orderPlan.trim())     details.order_plan     = orderPlan.trim();
        break;
      case "logistics/flight_arrival":
        if (airline.trim())        details.airline         = airline.trim();
        if (arrivalAirport.trim()) details.arrival_airport = arrivalAirport.trim();
        if (flightNumber.trim())   details.flight_number   = flightNumber.trim();
        if (terminal.trim())       details.terminal        = terminal.trim();
        if (confirmation.trim())   details.confirmation    = confirmation.trim();
        break;
      case "logistics/flight_departure":
        if (airline.trim())          details.airline           = airline.trim();
        if (departureAirport.trim()) details.departure_airport = departureAirport.trim();
        if (arrivalAirport.trim())   details.arrival_airport   = arrivalAirport.trim();
        break;
    }

    // address is a top-level column (hotel and cocktail_bar)
    const address =
      key === "logistics/hotel"  ? (hotelAddress.trim() || null) :
      key === "food/cocktail_bar" ? (cocktailBarAddress.trim() || null) :
      null;

    const newCard: Card = {
      id: crypto.randomUUID(),
      day_id: dayId,
      trip_id: tripId,
      type,
      sub_type: subType,
      title: title.trim(),
      start_time: startTimeFmt,
      end_time:   endTimeFmt,
      position: endPosition,
      status: "in_itinerary",
      source_url: null,
      cover_image_url: null,
      lat: null,
      lng: null,
      address,
      details,
      ai_generated: false,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("cards").insert({
      id:         newCard.id,
      day_id:     dayId,
      trip_id:    tripId,
      type,
      sub_type:   subType,
      title:      newCard.title,
      start_time: startTimeFmt,
      end_time:   endTimeFmt,
      address,
      position:   endPosition,
      status:     "in_itinerary",
      details,
    });

    setSaving(false);
    if (!error) onCardCreated(newCard);
  }, [
    title, type, subType, startTime, endTime, notes, saving,
    supplier, meetingPoint, meetingTime, cost, paid,
    treatment, goal, duration,
    primaryPick, backupOption, coffeeCost, vibeEnergy,
    cocktailBarAddress, cocktailBarWebsite,
    cuisine, reservation, estimatedCost, orderPlan,
    airline, arrivalAirport, departureAirport, flightNumber, terminal, confirmation,
    hotelAddress,
    dayId, tripId, endPosition, supabase, onCardCreated,
  ]);

  const canCreate = title.trim().length > 0 && type !== null;
  const cfg = type ? TYPE_CONFIG[type] : null;
  const subKey = `${type ?? ""}/${subType ?? ""}`;

  return (
    <div
      className="fixed inset-0 z-60 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-200" />

      {/* Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet min-h-[40dvh] max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0 cursor-grab">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 flex-shrink-0">
          <h2 className="text-[17px] font-bold text-gray-900">New card</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-safe">

          {/* ── Title ── */}
          <Field label="Title">
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canCreate) handleCreate(); }}
              placeholder="Card title…"
              className={INPUT_CLS}
            />
          </Field>

          {/* ── Type ── */}
          <div className="mb-4">
            <label className={LABEL_CLS}>Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYPE_CONFIG) as CardType[]).map((t) => {
                const c = TYPE_CONFIG[t];
                const selected = type === t;
                return (
                  <button
                    key={t}
                    onClick={() => handleTypeSelect(t)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 transition-all ${
                      selected
                        ? `${c.selectedBg} ${c.selectedBorder} ${c.text}`
                        : `${c.bg} ${c.border} text-gray-400`
                    }`}
                  >
                    {c.icon}
                    <span className="text-[11px] font-bold">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Sub-type ── */}
          {type && (
            <div className="mb-4">
              <label className={LABEL_CLS}>Sub-type</label>
              <div className="flex flex-wrap gap-2">
                {SUB_TYPES[type].map(({ value, label }) => {
                  const selected = subType === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setSubType(selected ? null : value)}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
                        selected
                          ? `${cfg!.selectedBg} ${cfg!.selectedBorder} ${cfg!.text}`
                          : "bg-gray-50 border-gray-200 text-gray-500"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Base fields (shown once type is chosen) ── */}
          {type && (
            <>
              {/* Start / End time (relabelled for hotel) */}
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <label className={LABEL_CLS}>
                    {subKey === "logistics/hotel" ? "Check-in time" : "Start time"}
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="flex-1">
                  <label className={LABEL_CLS}>
                    {subKey === "logistics/hotel" ? "Check-out time" : "End time"}
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
              </div>

              {/* Notes */}
              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any notes…"
                  rows={3}
                  className={`${INPUT_CLS} resize-none`}
                />
              </Field>
            </>
          )}

          {/* ── Conditional fields ── */}

          {/* activity/guided */}
          {subKey === "activity/guided" && (
            <>
              <Field label="Supplier">
                <input value={supplier} onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Tour operator or company" className={INPUT_CLS} />
              </Field>
              <Field label="Meeting point">
                <input value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)}
                  placeholder="Where to meet" className={INPUT_CLS} />
              </Field>
              <Field label="Meeting time">
                <input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)}
                  className={INPUT_CLS} />
              </Field>
              <Field label="Cost per person">
                <input type="number" min="0" step="0.01" value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0.00" className={INPUT_CLS} />
              </Field>
              <div className="mb-4 flex items-center justify-between">
                <span className={LABEL_CLS + " mb-0"}>Paid</span>
                <button
                  onClick={() => setPaid((v) => !v)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${paid ? "bg-activity" : "bg-gray-200"}`}
                  aria-pressed={paid}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${paid ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            </>
          )}

          {/* food/coffee */}
          {subKey === "food/coffee" && (
            <>
              <Field label="Primary pick">
                <input value={primaryPick} onChange={(e) => setPrimaryPick(e.target.value)}
                  placeholder="Your first-choice café" className={INPUT_CLS} />
              </Field>
              <Field label="Backup option">
                <input value={backupOption} onChange={(e) => setBackupOption(e.target.value)}
                  placeholder="Alternative if first is closed" className={INPUT_CLS} />
              </Field>
              <Field label="Cost">
                <input value={coffeeCost} onChange={(e) => setCoffeeCost(e.target.value)}
                  placeholder="e.g. €4–6 pp" className={INPUT_CLS} />
              </Field>
              <Field label="Vibe / energy">
                <input value={vibeEnergy} onChange={(e) => setVibeEnergy(e.target.value)}
                  placeholder="e.g. quiet, busy, standing bar" className={INPUT_CLS} />
              </Field>
            </>
          )}

          {/* food/cocktail_bar */}
          {subKey === "food/cocktail_bar" && (
            <>
              <Field label="Address">
                <input value={cocktailBarAddress} onChange={(e) => setCocktailBarAddress(e.target.value)}
                  placeholder="Bar address" className={INPUT_CLS} />
              </Field>
              <Field label="Website">
                <input value={cocktailBarWebsite} onChange={(e) => setCocktailBarWebsite(e.target.value)}
                  placeholder="https://…" className={INPUT_CLS} />
              </Field>
            </>
          )}

          {/* activity/wellness */}
          {subKey === "activity/wellness" && (
            <>
              <Field label="Supplier">
                <input value={supplier} onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Spa or wellness centre" className={INPUT_CLS} />
              </Field>
              <Field label="Treatment">
                <input value={treatment} onChange={(e) => setTreatment(e.target.value)}
                  placeholder="e.g. Deep tissue massage" className={INPUT_CLS} />
              </Field>
              <Field label="Goal">
                <input value={goal} onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. Relaxation, recovery" className={INPUT_CLS} />
              </Field>
              <Field label="Duration (minutes)">
                <input type="number" min="0" value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="60" className={INPUT_CLS} />
              </Field>
            </>
          )}

          {/* food/restaurant + food/fine_dining */}
          {(subKey === "food/restaurant" || subKey === "food/fine_dining") && (
            <>
              <Field label="Cuisine">
                <input value={cuisine} onChange={(e) => setCuisine(e.target.value)}
                  placeholder={subKey === "food/fine_dining" ? "e.g. French, Modern European" : "e.g. Italian, Japanese"}
                  className={INPUT_CLS} />
              </Field>
              <Field label="Reservation">
                <input value={reservation} onChange={(e) => setReservation(e.target.value)}
                  placeholder="Booking reference or time" className={INPUT_CLS} />
              </Field>
              <Field label="Estimated cost">
                <input value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)}
                  placeholder="e.g. €35–50 pp" className={INPUT_CLS} />
              </Field>
              <Field label="Order plan">
                <textarea value={orderPlan} onChange={(e) => setOrderPlan(e.target.value)}
                  placeholder="What to order…" rows={2}
                  className={`${INPUT_CLS} resize-none`} />
              </Field>
            </>
          )}

          {/* logistics/flight_arrival */}
          {subKey === "logistics/flight_arrival" && (
            <>
              <Field label="Airline">
                <input value={airline} onChange={(e) => setAirline(e.target.value)}
                  placeholder="e.g. British Airways" className={INPUT_CLS} />
              </Field>
              <Field label="Arrival airport">
                <input value={arrivalAirport} onChange={(e) => setArrivalAirport(e.target.value)}
                  placeholder="e.g. LHR" className={INPUT_CLS} />
              </Field>
              <Field label="Flight number">
                <input value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)}
                  placeholder="e.g. AZ 123" className={INPUT_CLS} />
              </Field>
              <Field label="Terminal">
                <input value={terminal} onChange={(e) => setTerminal(e.target.value)}
                  placeholder="e.g. T2" className={INPUT_CLS} />
              </Field>
              <Field label="Confirmation">
                <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="Booking reference" className={INPUT_CLS} />
              </Field>
            </>
          )}

          {/* logistics/flight_departure */}
          {subKey === "logistics/flight_departure" && (
            <>
              <Field label="Airline">
                <input value={airline} onChange={(e) => setAirline(e.target.value)}
                  placeholder="e.g. British Airways" className={INPUT_CLS} />
              </Field>
              <Field label="Departure airport">
                <input value={departureAirport} onChange={(e) => setDepartureAirport(e.target.value)}
                  placeholder="e.g. JFK" className={INPUT_CLS} />
              </Field>
              <Field label="Arrival airport">
                <input value={arrivalAirport} onChange={(e) => setArrivalAirport(e.target.value)}
                  placeholder="e.g. LHR" className={INPUT_CLS} />
              </Field>
            </>
          )}

          {/* logistics/hotel */}
          {subKey === "logistics/hotel" && (
            <Field label="Address">
              <input value={hotelAddress} onChange={(e) => setHotelAddress(e.target.value)}
                placeholder="Hotel address" className={INPUT_CLS} />
            </Field>
          )}

          {/* ── Create button ── */}
          <div className="pb-8 pt-2">
            <button
              onClick={handleCreate}
              disabled={!canCreate || saving}
              className={`w-full py-3.5 rounded-xl text-[15px] font-bold transition-all ${
                canCreate && !saving
                  ? "bg-activity text-white active:scale-[0.98]"
                  : "bg-gray-100 text-gray-300 cursor-not-allowed"
              }`}
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
