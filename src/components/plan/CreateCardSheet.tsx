"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card, CardType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { PIN_COLORS } from "@/lib/mapPins";

// ── Type options (includes virtual "note" type) ────────────────
type UiType = CardType | "note";

const TYPE_OPTIONS: { value: UiType; label: string; color: string }[] = [
  { value: "activity",  label: "Activity",  color: PIN_COLORS.activity  },
  { value: "food",      label: "Food",       color: PIN_COLORS.food      },
  { value: "logistics", label: "Logistics", color: PIN_COLORS.logistics },
  { value: "note",      label: "Note",       color: "#6B7280"            },
];

// ── Sub-type options per card type ─────────────────────────────
const SUB_TYPES: Record<CardType, { value: string; label: string }[]> = {
  activity: [
    { value: "challenge",     label: "Challenge"     },
    { value: "guided",        label: "Guided"        },
    { value: "self_directed", label: "Self-Directed" },
    { value: "wellness",      label: "Wellness"      },
  ],
  food: [
    { value: "restaurant", label: "Restaurant" },
    { value: "coffee",     label: "Coffee"     },
    { value: "dessert",    label: "Dessert"    },
    { value: "bar",        label: "Bar"        },
  ],
  logistics: [
    { value: "flight_arrival",   label: "Flight Arrival"   },
    { value: "flight_departure", label: "Flight Departure" },
    { value: "hotel",            label: "Hotel"            },
  ],
};

// ── Shared field styles ────────────────────────────────────────
const INPUT_CLS =
  "w-full text-[15px] text-gray-900 bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-gray-300 focus:bg-white placeholder:text-gray-300 transition-colors";
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
  initialLat?: number;
  initialLng?: number;
  initialStatus?: Card["status"];
  initialStartTime?: string;
}

export default function CreateCardSheet({
  dayId, tripId, endPosition, onClose, onCardCreated,
  initialLat, initialLng, initialStatus, initialStartTime,
}: Props) {
  const supabase  = createClient();
  const sheetRef  = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const dragY     = useRef(0);
  const dragging  = useRef(false);

  // ── Base fields ─────────────────────────────────────────────
  const [title,     setTitle]     = useState("");
  const [type,      setType]      = useState<UiType | null>(null);
  const [subType,   setSubType]   = useState<string | null>(null);
  const [startTime, setStartTime] = useState(initialStartTime ?? "");
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

  const handleTypeSelect = (t: UiType) => {
    setType(t);
    setSubType(null);
  };

  // ── Drag-to-dismiss ──────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragY.current = e.touches[0].clientY; dragging.current = true;
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

    const cardStatus = initialStatus ?? "in_itinerary";

    // ── Note card (virtual type) ─────────────────────────────
    if (type === "note") {
      const newCard: Card = {
        id:              crypto.randomUUID(),
        day_id:          dayId,
        trip_id:         tripId,
        type:            "activity",
        sub_type:        "note",
        title:           title.trim(),
        start_time:      null,
        end_time:        null,
        position:        endPosition,
        status:          cardStatus,
        source_url:      null,
        cover_image_url: null,
        lat:             initialLat ?? null,
        lng:             initialLng ?? null,
        address:         null,
        details:         notes.trim() ? { notes: notes.trim() } : {},
        ai_generated:    false,
        created_at:      new Date().toISOString(),
      };
      const { error } = await supabase.from("cards").insert({
        id: newCard.id, day_id: dayId, trip_id: tripId,
        type: "activity", sub_type: "note", title: newCard.title,
        start_time: null, end_time: null, position: endPosition,
        status: cardStatus, source_url: null, cover_image_url: null,
        lat: initialLat ?? null, lng: initialLng ?? null, address: null,
        details: newCard.details, ai_generated: false,
      });
      setSaving(false);
      if (!error) onCardCreated(newCard);
      return;
    }

    // ── Regular card ─────────────────────────────────────────
    const cardType: CardType = type;
    const startTimeFmt = startTime ? `${startTime}:00` : null;
    const endTimeFmt   = endTime   ? `${endTime}:00`   : null;

    const details: Record<string, unknown> = {};
    if (notes.trim()) details.notes = notes.trim();

    const key = `${cardType}/${subType ?? ""}`;
    switch (key) {
      case "activity/guided":
        if (supplier.trim())     details.supplier      = supplier.trim();
        if (meetingPoint.trim()) details.meeting_point = meetingPoint.trim();
        if (meetingTime.trim())  details.meeting_time  = meetingTime.trim();
        if (cost.trim())         details.cost_per_person = parseFloat(cost);
        details.paid = paid;
        break;
      case "activity/challenge":
        if (supplier.trim()) details.supplier = supplier.trim();
        break;
      case "activity/wellness":
        if (supplier.trim())  details.supplier         = supplier.trim();
        if (treatment.trim()) details.treatment_type   = treatment.trim();
        if (goal.trim())      details.goal             = goal.trim();
        if (duration.trim())  details.duration_minutes = parseInt(duration, 10);
        break;
      case "food/coffee":
        if (primaryPick.trim())  details.primary     = primaryPick.trim();
        if (backupOption.trim()) details.alternative = backupOption.trim();
        if (coffeeCost.trim())   details.cost        = coffeeCost.trim();
        if (vibeEnergy.trim())   details.energy      = vibeEnergy.trim();
        break;
      case "food/bar":
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

    const address =
      key === "logistics/hotel" ? (hotelAddress.trim() || null) :
      key === "food/bar"        ? (cocktailBarAddress.trim() || null) :
      null;

    const newCard: Card = {
      id:              crypto.randomUUID(),
      day_id:          dayId,
      trip_id:         tripId,
      type:            cardType,
      sub_type:        subType,
      title:           title.trim(),
      start_time:      startTimeFmt,
      end_time:        endTimeFmt,
      position:        endPosition,
      status:          cardStatus,
      source_url:      null,
      cover_image_url: null,
      lat:             initialLat ?? null,
      lng:             initialLng ?? null,
      address,
      details,
      ai_generated:    false,
      created_at:      new Date().toISOString(),
    };

    const { error } = await supabase.from("cards").insert({
      id: newCard.id, day_id: dayId, trip_id: tripId,
      type: cardType, sub_type: subType, title: newCard.title,
      start_time: startTimeFmt, end_time: endTimeFmt,
      address, position: endPosition, status: cardStatus,
      lat: initialLat ?? null, lng: initialLng ?? null,
      details, ai_generated: false,
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
    dayId, tripId, endPosition, initialLat, initialLng, initialStatus, supabase, onCardCreated,
  ]);

  const canCreate  = title.trim().length > 0 && type !== null;
  const isNote     = type === "note";
  const cardType   = isNote ? null : (type as CardType | null);
  const typeColor  = type ? (isNote ? "#6B7280" : PIN_COLORS[type as CardType]) : null;
  const subKey     = `${cardType ?? ""}/${subType ?? ""}`;

  return (
    <div
      className="fixed inset-0 z-60 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-200" />

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
          <h2 className="text-[17px] font-bold text-gray-900">Add a place</h2>
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

          {/* ── Type pills ── */}
          <div className="mb-3">
            <label className={LABEL_CLS}>Type</label>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map(({ value, label, color }) => {
                const selected = type === value;
                return (
                  <button
                    key={value}
                    onClick={() => handleTypeSelect(value)}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                    style={selected
                      ? { background: color, color: "white", border: `1px solid ${color}` }
                      : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Sub-type pills (not for Note) ── */}
          {cardType && (
            <div className="mb-4">
              <div className="flex flex-wrap gap-2">
                {SUB_TYPES[cardType].map(({ value, label }) => {
                  const selected = subType === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setSubType(selected ? null : value)}
                      className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                      style={selected
                        ? { background: typeColor!, color: "white", border: `1px solid ${typeColor}` }
                        : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Note: just a textarea ── */}
          {isNote && (
            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Start writing…"
                rows={5}
                className={`${INPUT_CLS} resize-none`}
                autoFocus
              />
            </Field>
          )}

          {/* ── Time + notes (for regular card types) ── */}
          {cardType && (
            <>
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

          {/* ── Conditional sub-type fields ── */}

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

          {subKey === "food/bar" && (
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

          {subKey === "activity/challenge" && (
            <Field label="Organizer">
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)}
                placeholder="Race organizer or company" className={INPUT_CLS} />
            </Field>
          )}

          {(subKey === "food/restaurant" || subKey === "food/fine_dining") && (
            <>
              <Field label="Cuisine">
                <input value={cuisine} onChange={(e) => setCuisine(e.target.value)}
                  placeholder="e.g. Italian, Japanese" className={INPUT_CLS} />
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
              className="w-full py-3.5 rounded-xl text-[15px] font-bold transition-all active:scale-[0.98]"
              style={canCreate && !saving
                ? { background: typeColor ?? "#6B7280", color: "white" }
                : { background: "#F3F4F6", color: "#D1D5DB", cursor: "not-allowed" }}
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
