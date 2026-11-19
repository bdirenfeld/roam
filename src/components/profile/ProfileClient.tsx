"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  userId: string;
  initialHomeAirport: string | null;
  initialHomeCountry: string | null;
  initialPassportCountry: string | null;
  /** Private (migration 020): only "leave home" / "home around" on home flights use it. */
  initialHomeAddress?: string | null;
}

/** Where a typed home address is, from Google (the same two routes the map's search uses). */
async function locateHome(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const ac = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(address)}`).then((r) => r.json()) as { predictions?: { place_id: string }[] };
    const id = ac.predictions?.[0]?.place_id;
    if (!id) return null;
    const det = await fetch(`/api/places/details?place_id=${encodeURIComponent(id)}`).then((r) => r.json()) as { result?: { geometry?: { location?: { lat: number; lng: number } } } };
    const loc = det.result?.geometry?.location;
    return loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? loc : null;
  } catch {
    return null;
  }
}

export default function ProfileClient({
  userId,
  initialHomeAirport,
  initialHomeCountry,
  initialPassportCountry,
  initialHomeAddress = null,
}: Props) {
  const [homeAddress, setHomeAddress] = useState(initialHomeAddress ?? "");
  const [savedAddress, setSavedAddress] = useState(initialHomeAddress ?? "");
  const [homeAirport, setHomeAirport] = useState(initialHomeAirport ?? "");
  const [homeCountry, setHomeCountry] = useState(initialHomeCountry ?? "");
  const [passportCountry, setPassportCountry] = useState(initialPassportCountry ?? "");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    airport: string;
    country: string;
    passport: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enterEdit = () => {
    setSnapshot({
      airport: homeAirport,
      country: homeCountry,
      passport: passportCountry,
    });
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    if (snapshot) {
      setHomeAddress(savedAddress);
      setHomeAirport(snapshot.airport);
      setHomeCountry(snapshot.country);
      setPassportCountry(snapshot.passport);
    }
    setSnapshot(null);
    setError(null);
    setEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    // A new home address is found on Google before saving (19 Nov 2026): the drive times need where it is.
    const addr = homeAddress.trim();
    let home: Record<string, unknown> = {};
    if (addr !== savedAddress.trim()) {
      if (!addr) home = { home_address: null, home_lat: null, home_lng: null };
      else {
        const loc = await locateHome(addr);
        if (!loc) { setError("Couldn't find that address. Try adding the city."); setSaving(false); return; }
        home = { home_address: addr, home_lat: loc.lat, home_lng: loc.lng };
      }
    }

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("users")
      .update({
        home_airport: homeAirport.trim() || null,
        home_country: homeCountry.trim() || null,
        passport_country: passportCountry.trim() || null,
        ...home,
      })
      .eq("id", userId);

    if (updateError) {
      setError("Couldn't save that. Try again.");
    } else {
      setSavedAddress(addr);
      setSnapshot(null);
      setEditing(false);
    }
    setSaving(false);
  };

  return (
    <div className="mb-8 md:mb-0 md:pt-8">
      {!editing ? (
        <div>
          {/* Section header — at md:+ the label sits in a row with a flex hairline
              rule and an italic-Playfair underlined Edit button, matching the
              desktop canvas. */}
          <div className="flex items-baseline justify-between mb-3 md:gap-3.5 md:mb-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-gray-400 md:text-[rgba(26,26,46,0.62)]">
              Travel profile
            </p>
            <div className="hidden md:block md:flex-1 md:h-px md:bg-[rgba(26,26,46,0.12)] md:-translate-y-[3px]" />
            <button
              type="button"
              onClick={enterEdit}
              className="font-display italic text-[13px] text-gray-400 active:opacity-60 transition-opacity md:text-[14px] md:text-[rgba(26,26,46,0.62)] md:underline md:underline-offset-[3px] md:decoration-[rgba(26,26,46,0.12)]"
            >
              Edit
            </button>
          </div>
          {/* At md:+ the cells sit in a white card with hairline border and a
              subtle inset shadow, per canvas. Mobile keeps the bare 3-col grid. */}
          <div className="grid grid-cols-3 gap-3.5 md:gap-6 md:bg-white md:rounded-xl md:px-6 md:py-5 md:shadow-[0_1px_2px_rgba(26,26,46,0.04),0_0_0_1px_rgba(26,26,46,0.12)]">
            <FactInline label="Home airport" value={homeAirport} />
            <FactInline label="Home country" value={homeCountry} />
            <FactInline label="Passport" value={passportCountry} />
          </div>
          {/* Home, for "leave home" and "home around" on your flights (19 Nov 2026). Only you see it. */}
          <div className="mt-3.5 md:mt-4">
            <FactInline label="Home address · only you see this" value={homeAddress} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between md:gap-3.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-gray-400 md:text-[rgba(26,26,46,0.62)]">
              Travel profile
            </p>
            <div className="hidden md:block md:flex-1 md:h-px md:bg-[rgba(26,26,46,0.12)] md:-translate-y-[3px]" />
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="font-display italic text-[13px] text-gray-400 active:opacity-60 transition-opacity disabled:opacity-40 md:text-[14px] md:text-[rgba(26,26,46,0.62)]"
            >
              Cancel
            </button>
          </div>

          <ProfileInput
            label="Home airport"
            value={homeAirport}
            onChange={setHomeAirport}
            placeholder="e.g. YYZ"
          />
          <ProfileInput
            label="Home country"
            value={homeCountry}
            onChange={setHomeCountry}
            placeholder="e.g. Canada"
          />
          <ProfileInput
            label="Passport country"
            value={passportCountry}
            onChange={setPassportCountry}
            placeholder="e.g. Canada"
          />
          <ProfileInput
            label="Home address · only you see this, for the drive to the airport"
            value={homeAddress}
            onChange={setHomeAddress}
            placeholder="e.g. 123 Main St, Toronto"
          />

          {error && (
            <p className="text-[13px] text-red-500 font-medium">{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-full bg-[#1A1A2E] text-white text-[14px] font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity active:scale-[0.99]"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function FactInline({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-gray-400">
        {label}
      </span>
      <span
        className="text-[14px] font-medium text-[#1A1A2E] truncate"
        style={{ letterSpacing: "-0.005em" }}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function ProfileInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-gray-400 mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3.5 py-3 text-[15px] bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-400 focus:bg-white transition-colors placeholder:text-gray-300"
      />
    </div>
  );
}
