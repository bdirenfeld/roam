"use client";

import { useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

export interface Person {
  id: string;
  name: string;
  birthdate: string | null;
  notes: string | null;
  position: number;
}

interface Props {
  tripId: string;
  initialPeople: Person[];
}

function formatBornDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Monogram({
  letter,
  size = 48,
  outline = false,
}: {
  letter: string;
  size?: number;
  outline?: boolean;
}) {
  if (outline) {
    return (
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width: size,
          height: size,
          border: "1px dashed rgba(26,26,46,0.25)",
        }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center bg-[#1A1A2E] text-[#FAF7F2] flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <span
        className="font-display italic"
        style={{ fontSize: size * 0.46, lineHeight: 1, fontWeight: 500 }}
      >
        {letter}
      </span>
    </div>
  );
}

export default function TravellersSection({ tripId, initialPeople }: Props) {
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const [sheetMode, setSheetMode] = useState<"add" | "edit" | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);

  const openAdd = () => {
    setEditingPerson(null);
    setSheetMode("add");
  };
  const openEdit = (p: Person) => {
    setEditingPerson(p);
    setSheetMode("edit");
  };
  const closeSheet = () => {
    setSheetMode(null);
    setEditingPerson(null);
  };

  const handleAdded = (p: Person) => setPeople((prev) => [...prev, p]);
  const handleUpdated = (p: Person) =>
    setPeople((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  const handleRemoved = (repacked: Person[]) => setPeople(repacked);

  const sorted = [...people].sort((a, b) => a.position - b.position);
  const isEmpty = sorted.length === 0;

  return (
    <>
      <section className="px-5">
        <div className="pt-6 pb-3.5">
          <h2 className="font-display italic font-medium text-[22px] text-[#1A1A2E] leading-tight">
            Travellers
          </h2>
        </div>

        {isEmpty ? (
          <div
            className="rounded-md flex flex-col items-center text-center gap-3.5 px-5 py-8"
            style={{ border: "1px dashed rgba(26,26,46,0.25)" }}
          >
            <Monogram letter="" size={40} outline />
            <p className="font-display italic font-medium text-[18px] text-[#1A1A2E]">
              No one added yet.
            </p>
            <p
              className="font-display italic text-[14px] max-w-[32ch] leading-[1.55]"
              style={{ color: "rgba(26,26,46,0.5)" }}
            >
              Tell Roam who&apos;s coming and a small note on each. It plans
              around birthdays, pace, and tastes.
            </p>
            <button
              onClick={openAdd}
              className="mt-1 inline-flex items-center gap-2.5 px-4 py-2.5 rounded bg-[#1A1A2E] text-[#FAF7F2] text-[14px] font-medium active:scale-[0.99] transition-transform"
              style={{ letterSpacing: "-0.005em" }}
            >
              <Plus size={12} weight="light" />
              Add the first traveller
            </button>
          </div>
        ) : (
          <div>
            {sorted.map((p) => (
              <PersonCard key={p.id} person={p} onTap={() => openEdit(p)} />
            ))}
            <div className="border-t border-black/5" />
            <button
              onClick={openAdd}
              className="w-full flex items-center gap-3 py-[15px] text-left"
            >
              <span
                className="w-5 h-5 inline-flex items-center justify-center"
                style={{ color: "rgba(26,26,46,0.5)" }}
              >
                <Plus size={12} weight="light" />
              </span>
              <span
                className="font-display italic text-[16px]"
                style={{ color: "rgba(26,26,46,0.5)" }}
              >
                Add traveller
              </span>
            </button>
          </div>
        )}
      </section>

      {sheetMode && (
        <TravellerSheet
          mode={sheetMode}
          person={editingPerson}
          tripId={tripId}
          allPeople={people}
          onAdded={handleAdded}
          onUpdated={handleUpdated}
          onRemoved={handleRemoved}
          onClose={closeSheet}
        />
      )}
    </>
  );
}

function PersonCard({ person, onTap }: { person: Person; onTap: () => void }) {
  const initial = (person.name.trim()[0] ?? "?").toUpperCase();
  return (
    <button
      onClick={onTap}
      className="w-full flex items-start gap-4 border-t border-black/5 py-[18px] text-left active:opacity-70 transition-opacity"
    >
      <Monogram letter={initial} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <span className="font-display italic font-medium text-[20px] text-[#1A1A2E]">
            {person.name}
          </span>
          {person.birthdate && (
            <span
              className="text-[11px] uppercase whitespace-nowrap"
              style={{
                color: "rgba(26,26,46,0.5)",
                letterSpacing: "0.16em",
              }}
            >
              Born {formatBornDate(person.birthdate)}
            </span>
          )}
        </div>
        {person.notes && (
          <p
            className="font-display italic text-[14.5px] leading-[1.55] mt-2"
            style={{
              color: "rgba(26,26,46,0.65)",
              letterSpacing: "-0.005em",
            }}
          >
            {person.notes}
          </p>
        )}
      </div>
    </button>
  );
}

function TravellerSheet({
  mode,
  person,
  tripId,
  allPeople,
  onAdded,
  onUpdated,
  onRemoved,
  onClose,
}: {
  mode: "add" | "edit";
  person: Person | null;
  tripId: string;
  allPeople: Person[];
  onAdded: (p: Person) => void;
  onUpdated: (p: Person) => void;
  onRemoved: (repacked: Person[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [birthdate, setBirthdate] = useState(person?.birthdate ?? "");
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const trimmedName = name.trim();
  const monoLetter = (trimmedName[0] ?? "?").toUpperCase();
  const canSave = !!trimmedName && !busy;

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    const supabase = createClient();
    const payload = {
      name: trimmedName,
      birthdate: birthdate.trim() || null,
      notes: notes.trim() || null,
    };

    if (mode === "add") {
      const nextPosition =
        allPeople.length > 0
          ? Math.max(...allPeople.map((p) => p.position)) + 1
          : 1;
      const { data, error } = await supabase
        .from("people")
        .insert({ trip_id: tripId, position: nextPosition, ...payload })
        .select("id, name, birthdate, notes, position")
        .single();
      setBusy(false);
      if (!error && data) {
        onAdded(data as Person);
        onClose();
      }
    } else if (person) {
      const { data, error } = await supabase
        .from("people")
        .update(payload)
        .eq("id", person.id)
        .select("id, name, birthdate, notes, position")
        .single();
      setBusy(false);
      if (!error && data) {
        onUpdated(data as Person);
        onClose();
      }
    }
  };

  const handleRemove = async () => {
    if (!person || busy) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("people")
      .delete()
      .eq("id", person.id);
    if (!error) {
      const remaining = allPeople
        .filter((p) => p.id !== person.id)
        .sort((a, b) => a.position - b.position);
      const repacked = remaining.map((p, i) => ({ ...p, position: i + 1 }));
      const updates = repacked
        .filter((p, i) => remaining[i].position !== p.position)
        .map((p) =>
          supabase
            .from("people")
            .update({ position: p.position })
            .eq("id", p.id)
        );
      if (updates.length) await Promise.all(updates);
      onRemoved(repacked);
      onClose();
    }
    setBusy(false);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[60]"
        onClick={busy ? undefined : onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 bg-[#FAF7F2] rounded-t-2xl z-[60] max-w-mobile mx-auto flex flex-col"
        style={{ maxHeight: "85vh" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={busy}
            className="font-display italic text-[14px]"
            style={{ color: "rgba(26,26,46,0.5)" }}
          >
            Cancel
          </button>
          <span className="font-display italic font-medium text-[17px] text-[#1A1A2E]">
            {mode === "add" ? "Add traveller" : "Edit traveller"}
          </span>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="text-[14px] font-semibold text-[#1A1A2E] disabled:opacity-40"
            style={{ letterSpacing: "-0.005em" }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="border-t border-black/5 mx-5 flex-shrink-0" />

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
          {/* Live monogram preview */}
          <div className="flex items-center gap-4 py-4">
            <Monogram letter={monoLetter} size={56} />
            <div className="min-w-0">
              <span
                className="text-[9.5px] uppercase"
                style={{
                  color: "rgba(26,26,46,0.5)",
                  letterSpacing: "0.14em",
                }}
              >
                Monogram
              </span>
              <p
                className="font-display italic text-[13px] leading-[1.5] mt-1 max-w-[26ch]"
                style={{ color: "rgba(26,26,46,0.5)" }}
              >
                We use the first letter of the name.
              </p>
            </div>
          </div>

          <SheetField label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their name"
              autoFocus={mode === "add"}
              className="w-full bg-transparent outline-none text-[#1A1A2E] text-[15.5px] font-medium placeholder:text-[rgba(26,26,46,0.3)]"
              style={{ letterSpacing: "-0.005em" }}
            />
          </SheetField>

          <SheetField label="Birthday">
            <input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              className="w-full bg-transparent outline-none text-[#1A1A2E] text-[15.5px] font-medium placeholder:text-[rgba(26,26,46,0.3)]"
              style={{ letterSpacing: "-0.005em" }}
            />
          </SheetField>

          <SheetField label="Likes & dislikes" hint="One line is enough.">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="What they love, what to avoid."
              className="w-full resize-none bg-transparent outline-none text-[#1A1A2E] text-[14.5px] leading-[1.5] placeholder:text-[rgba(26,26,46,0.3)]"
              style={{ letterSpacing: "-0.005em" }}
            />
          </SheetField>

          {mode === "edit" && person && (
            <div className="pt-5 pb-1">
              <button
                onClick={handleRemove}
                disabled={busy}
                className="font-display italic text-[14px] disabled:opacity-40"
                style={{ color: "#C4622D" }}
              >
                Remove from this journey
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SheetField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3.5 border-b border-black/5">
      <div className="flex items-baseline justify-between mb-2">
        <span
          className="text-[10.5px] font-medium uppercase"
          style={{ color: "rgba(26,26,46,0.5)", letterSpacing: "0.14em" }}
        >
          {label}
        </span>
        {hint && (
          <span
            className="font-display italic text-[12px]"
            style={{ color: "rgba(26,26,46,0.5)" }}
          >
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
