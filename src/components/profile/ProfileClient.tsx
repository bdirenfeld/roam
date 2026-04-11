"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/lib/auth-actions";

interface Props {
  userId: string;
  initialHomeAirport: string | null;
  initialHomeCountry: string | null;
  initialPassportCountry: string | null;
}

export default function ProfileClient({
  userId,
  initialHomeAirport,
  initialHomeCountry,
  initialPassportCountry,
}: Props) {
  const [homeAirport, setHomeAirport] = useState(initialHomeAirport ?? "");
  const [homeCountry, setHomeCountry] = useState(initialHomeCountry ?? "");
  const [passportCountry, setPassportCountry] = useState(initialPassportCountry ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("users")
      .update({
        home_airport: homeAirport.trim() || null,
        home_country: homeCountry.trim() || null,
        passport_country: passportCountry.trim() || null,
      })
      .eq("id", userId);

    if (updateError) {
      setError("Failed to save. Please try again.");
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4 mb-8">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
        Travel profile
      </p>

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

      {error && (
        <p className="text-[13px] text-red-500 font-medium">{error}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-[#1A1A2E] text-white text-[14px] font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity active:scale-[0.99]"
      >
        {saving ? "Saving…" : saved ? "Saved!" : "Save"}
      </button>

      <div className="pt-4 border-t border-gray-100">
        <form action={signOut}>
          <button
            type="submit"
            className="text-sm font-semibold text-gray-400 hover:text-gray-500 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
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
