"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchPredictions,
  fetchPlaceDetails,
  predMain,
  predSecondary,
} from "@/lib/places/predictions";
import type { Prediction } from "@/lib/places/predictions";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.35)";
const RULE = "rgba(26,26,46,0.10)";
const SIENNA = "#C4622D";

export default function ShareCatchClient({
  ideaId,
  title,
  link,
  source,
  knownTags,
}: {
  ideaId: string | null;
  title: string | null;
  link: string | null;
  source: string | null;
  /** Tags already in use, most-used first — tapping one is the whole flow. */
  knownTags: string[];
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  // The heading is the only feedback on this screen, so it has to be the truth
  // rather than a greeting. It was the static word "Saved" from the moment the
  // page opened — which was true of the link, and told you nothing about the
  // title you were typing underneath it.
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Naming the place here rather than later. A title is whatever you type; a
  // *place* has coordinates, and only a place can become a pin on a map. So the
  // field suggests real ones as you type — and picking one resolves it now, so
  // promoting this idea later skips the search entirely.
  //
  // Suggestions, never a requirement: a reel about Puglia in general is not a
  // single place, and free text has to keep working.
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [resolved, setResolved] = useState<{ name: string; address: string } | null>(null);
  const placeToken = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  );

  // A pending debounce must not outlive the page — a share-target tab is often
  // closed the moment the tag is tapped.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const persist = async (next: {
    note?: string;
    tags?: string[];
    place?: Record<string, unknown> | null;
  }) => {
    if (!ideaId) return;
    setStatus("saving");
    const supabase = createClient();
    const patch: Record<string, unknown> = {
      note: next.note ?? note,
      tags: next.tags ?? tags,
    };
    // Only touch `place` when this write is about the place — otherwise a tag
    // tap would wipe a place resolved a moment earlier.
    if (next.place !== undefined) patch.place = next.place;
    const { error } = await supabase.from("ideas").update(patch).eq("id", ideaId);
    // A failed write used to be indistinguishable from a successful one.
    setStatus(error ? "error" : "saved");
  };

  // Predictions, debounced. Silent once a place has been picked — the field is
  // then showing an answer, not a query.
  useEffect(() => {
    if (resolved) return;
    const q = note.trim();
    if (q.length < 3) {
      setPreds([]);
      return;
    }
    const t = setTimeout(async () => {
      setPreds(await fetchPredictions(q, placeToken.current));
    }, 250);
    return () => clearTimeout(t);
  }, [note, resolved]);

  const choosePlace = async (p: Prediction) => {
    setPreds([]);
    const place = await fetchPlaceDetails(p.place_id, placeToken.current);
    if (!place) {
      // Keep what was typed — a failed lookup shouldn't cost the words.
      setStatus("error");
      return;
    }
    setNote(place.name);
    setResolved({ name: place.name, address: place.address });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    persist({
      note: place.name,
      place: {
        placeId: place.placeId,
        name: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        types: place.types,
      },
    });
  };

  const toggleTag = (t: string) => {
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    setTags(next);
    persist({ tags: next });
  };

  const addNewTag = () => {
    const t = newTag.trim().toLowerCase();
    if (!t || tags.includes(t)) return setNewTag("");
    const next = [...tags, t];
    setTags(next);
    setNewTag("");
    persist({ tags: next });
  };

  const chip = (t: string, on: boolean) => (
    <button
      key={t}
      onClick={() => toggleTag(t)}
      className="px-3 py-1.5 rounded-full text-[12.5px]"
      style={
        on
          ? { background: SIENNA, color: "#fff" }
          : { border: `1px solid ${RULE}`, color: CAPTION, background: "#fff" }
      }
    >
      {t}
    </button>
  );

  const unused = knownTags.filter((t) => !tags.includes(t));

  return (
    <div
      className="min-h-screen bg-parchment px-4"
      style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto w-full max-w-[520px]">
        <div className="flex items-center gap-2 mb-4">
          {status === "saved" && <Check size={18} weight="light" color={INK} />}
          <span
            className="font-display italic text-[24px]"
            style={{ color: status === "error" ? SIENNA : INK }}
          >
            {status === "saved" ? "Saved" : status === "saving" ? "Saving…" : "Not saved"}
          </span>
        </div>

        {status === "error" && (
          <p className="text-[12.5px] -mt-2 mb-4" style={{ color: SIENNA }}>
            Your connection dropped. It&rsquo;ll save when you edit again.
          </p>
        )}

        <div
          className="bg-white rounded-2xl p-4 mb-4"
          style={{ boxShadow: `0 0 0 1px ${RULE}` }}
        >
          <div className="text-[14px] mb-1" style={{ color: INK }}>
            {title ?? link ?? "Untitled"}
          </div>
          {source && (
            <div className="text-[11.5px]" style={{ color: SOFT }}>
              {source}
            </div>
          )}
        </div>

        {/* A TikTok hands over a shortlink and nothing else.
            Saves as you stop typing, not on blur: on a phone there is nothing
            to blur *to* — the keyboard covers the page and a bare text input
            doesn't submit on the keyboard's Go. Enter commits and closes the
            keyboard, and enterKeyHint labels that key "done" rather than "go".
            The heading above reports the result, and Done at the foot is the
            way out. */}
        <input
          value={note}
          enterKeyHint="done"
          onChange={(e) => {
            const v = e.target.value;
            setNote(v);
            setStatus("saving");
            // Editing after picking means the pick no longer describes what is
            // in the box, so the resolved place is dropped rather than left
            // silently attached to different words.
            if (resolved) {
              setResolved(null);
              if (saveTimer.current) clearTimeout(saveTimer.current);
              saveTimer.current = setTimeout(() => persist({ note: v, place: null }), 600);
              return;
            }
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => persist({ note: v }), 600);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (saveTimer.current) clearTimeout(saveTimer.current);
            persist({ note });
            e.currentTarget.blur();
          }}
          onBlur={() => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            persist({ note });
          }}
          placeholder="Which place is this?"
          className="w-full rounded-xl px-3.5 py-3 text-[14px]"
          style={{ background: "#fff", border: `1px solid ${RULE}`, color: INK }}
        />

        {/* Real places, as you type. Picking one binds coordinates to the idea
            now, so it can become a pin later without being searched for again.
            Ignoring them and typing freely is equally fine. */}
        {preds.length > 0 && (
          <div
            className="rounded-xl mt-1.5 overflow-hidden"
            style={{ background: "#fff", border: `1px solid ${RULE}` }}
          >
            {preds.map((p) => (
              <button
                key={p.place_id}
                onClick={() => choosePlace(p)}
                className="w-full text-left px-3.5 py-2.5"
                style={{ borderBottom: `1px solid ${RULE}` }}
              >
                <span className="block text-[13.5px]" style={{ color: INK }}>
                  {predMain(p)}
                </span>
                {predSecondary(p) && (
                  <span className="block text-[11.5px] mt-[1px]" style={{ color: SOFT }}>
                    {predSecondary(p)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {resolved && (
          <p className="text-[11.5px] mt-1.5 px-1" style={{ color: SOFT }}>
            {resolved.address} · can be pinned to a map
          </p>
        )}

        <div className="mb-4" />

        <div className="flex flex-wrap gap-2 mb-3">
          {tags.map((t) => chip(t, true))}
          {unused.map((t) => chip(t, false))}
        </div>

        <div className="flex gap-2 mb-5">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNewTag()}
            placeholder="New tag"
            className="flex-1 rounded-xl px-3.5 py-2.5 text-[13.5px]"
            style={{ background: "#fff", border: `1px solid ${RULE}`, color: INK }}
          />
          <button
            onClick={addNewTag}
            className="px-4 rounded-xl text-[13.5px]"
            style={{ border: `1px solid ${RULE}`, color: CAPTION, background: "#fff" }}
          >
            Add
          </button>
        </div>

        {/* The way out, and the only button on the screen.
            It was centred grey text, which reads as a caption rather than a
            control — the screen looked like it had no exit at all.

            It says "Done", not "Saved": a button names what it does, and one
            labelled "Saved" would be claiming something it can't know while a
            write is still in flight. The heading above carries the state; this
            waits for it, so you can't leave mid-save and wonder afterwards. */}
        <button
          onClick={() => router.push("/ideas")}
          disabled={status === "saving"}
          className="block w-full text-center rounded-xl py-3 text-[14px]"
          style={{
            background: INK,
            color: "#FAF7F2",
            opacity: status === "saving" ? 0.5 : 1,
          }}
        >
          {status === "saving" ? "Saving…" : "Done"}
        </button>
      </div>
    </div>
  );
}
