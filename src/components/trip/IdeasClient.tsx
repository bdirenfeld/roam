"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import PromoteToWishlistSheet from "./PromoteToWishlistSheet";
import type { JourneySummary, PromoteOutcome, ResolvedIdeaPlace } from "./PromoteToWishlistSheet";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.35)";
const RULE = "rgba(26,26,46,0.10)";
const SIENNA = "#C4622D";

export interface Idea {
  id: string;
  url: string | null;
  title: string | null;
  note: string | null;
  source: string | null;
  status: string;
  tags: string[] | null;
  created_at: string;
  /** Set once the idea has been promoted to a wishlist destination. The idea
   *  stays either way — the saved link is still what you want when planning. */
  wishlist_destination_id: string | null;
  /** How many places this idea produced as journey pins, and where they went.
   *  A thread of fifteen restaurants is one idea and many places, so this is a
   *  count rather than a single outcome — and an idea can do both. */
  pins_added: number;
  pinned_trip_id: string | null;
  /** Resolved through Google Places when the idea was captured, when it named
   *  somewhere real. Lets promoting skip the search step. */
  place: ResolvedIdeaPlace | null;
}

/** "vt.tiktok.com" → "tiktok". The row has one line for provenance and the
 *  subdomain is never the part you recognise. */
function shortSource(source: string | null): string | null {
  if (!source) return null;
  const host = source.replace(/^https?:\/\//, "").split("/")[0];
  const parts = host.split(".").filter((p) => p && p !== "www");
  if (parts.length <= 1) return parts[0] ?? null;
  return parts[parts.length - 2];
}

function ideaTitle(i: Idea): string {
  return i.note || i.title || i.url || "Untitled";
}

/**
 * One idea, two lines.
 *
 * At module scope on purpose. Defined inside IdeasClient it would be a new
 * component type on every render, so the tag input below would be unmounted and
 * remade on each keystroke and lose focus — the same defect that made the
 * Estimate screen unusable.
 */
function IdeaRow({
  idea,
  open,
  allTags,
  onToggle,
  onToggleTag,
  onPromote,
  onRemove,
  onOpenWishlist,
  journeys,
}: {
  idea: Idea;
  open: boolean;
  allTags: string[];
  onToggle: () => void;
  onToggleTag: (idea: Idea, tag: string) => void;
  onPromote: (idea: Idea) => void;
  onRemove: () => void;
  onOpenWishlist: () => void;
  journeys: JourneySummary[];
}) {
  const [tagging, setTagging] = useState(false);
  const [draft, setDraft] = useState("");

  const tags = idea.tags ?? [];
  const src = shortSource(idea.source);

  // What became of it. The meta line already carries source and tags; the
  // outcome joins them, so you can see at a glance which ideas you have
  // actually done something with.
  const pinnedTo = idea.pinned_trip_id
    ? journeys.find((j) => j.id === idea.pinned_trip_id)?.title ?? "a journey"
    : null;
  const outcome =
    idea.pins_added > 0 && pinnedTo
      ? `${idea.pins_added} ${idea.pins_added === 1 ? "pin" : "pins"} on ${pinnedTo}`
      : idea.wishlist_destination_id
        ? "on your wishlist"
        : null;

  return (
    <div style={{ borderTop: `1px solid ${RULE}` }}>
      <div className="flex items-baseline">
      <button
        onClick={onToggle}
        className="flex-1 min-w-0 text-left flex items-baseline gap-2.5 pl-4 pr-2 py-2.5"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] truncate" style={{ color: INK }}>
            {ideaTitle(idea)}
          </span>
          {(src || tags.length > 0 || outcome) && (
            <span className="block text-[10.5px] truncate mt-[1px]" style={{ color: SOFT }}>
              {src}
              {src && tags.length > 0 && " · "}
              {tags.length > 0 && <span style={{ color: SIENNA }}>{tags.join(", ")}</span>}
              {outcome && (src || tags.length > 0) && " · "}
              {outcome && <span style={{ color: SIENNA }}>{outcome}</span>}
            </span>
          )}
        </span>
        <span className="shrink-0 text-[13px]" style={{ color: "rgba(26,26,46,0.25)" }}>
          {open ? "⌄" : "›"}
        </span>
      </button>

      {/* Removing an idea is one tap on the row itself. It used to be a "Pass"
          button hidden inside the expanded state, next to a "Keep" that only
          moved it between two sections. */}
      <button
        onClick={onRemove}
        aria-label={`Remove ${ideaTitle(idea)}`}
        className="shrink-0 pr-4 pl-1 py-2.5 text-[15px] leading-none"
        style={{ color: "rgba(26,26,46,0.22)" }}
      >
        ×
      </button>
      </div>

      {open && (
        <div className="px-4 pb-3" style={{ background: "#FCFBF8" }}>
          <div className="flex flex-wrap gap-1.5">
            {/* One action, not two. An idea can produce a destination *and*
                pins — a Puglia guide justifies the region on the wishlist and
                three restaurants on the trip — so this stays available after
                it has already been used once. */}
            <button
              onClick={() => onPromote(idea)}
              className="px-3 py-1.5 rounded-full text-[11.5px]"
              style={{ background: INK, color: "#fff" }}
            >
              Add to a journey
            </button>

            {idea.wishlist_destination_id && (
              <button
                onClick={onOpenWishlist}
                className="px-3 py-1.5 rounded-full text-[11.5px]"
                style={{ background: "rgba(196,98,45,0.12)", color: SIENNA }}
              >
                On your wishlist
              </button>
            )}

            {idea.url && (
              <a
                href={idea.url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-full text-[11.5px]"
                style={{ border: `1px solid ${RULE}`, color: CAPTION }}
              >
                Open link
              </a>
            )}

            <button
              onClick={() => setTagging((v) => !v)}
              className="px-3 py-1.5 rounded-full text-[11.5px]"
              style={{ border: `1px solid ${RULE}`, color: CAPTION }}
            >
              Tag
            </button>
          </div>

          {tagging && (
            <div className="mt-2.5">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => onToggleTag(idea, t)}
                    className="px-2.5 py-1 rounded-full text-[11px]"
                    style={{ background: "rgba(196,98,45,0.12)", color: SIENNA }}
                  >
                    {t} ×
                  </button>
                ))}
                {allTags
                  .filter((t) => !tags.includes(t))
                  .map((t) => (
                    <button
                      key={t}
                      onClick={() => onToggleTag(idea, t)}
                      className="px-2.5 py-1 rounded-full text-[11px]"
                      style={{ border: `1px solid ${RULE}`, color: CAPTION }}
                    >
                      {t}
                    </button>
                  ))}
              </div>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const t = draft.trim().toLowerCase();
                  if (t) onToggleTag(idea, t);
                  setDraft("");
                  setTagging(false);
                }}
                placeholder="New tag"
                className="w-full rounded-lg px-3 py-2 text-[12.5px] outline-none"
                style={{ background: "#fff", border: `1px solid ${RULE}`, color: INK }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function IdeasClient({
  initial,
  journeys,
}: {
  initial: Idea[];
  journeys: JourneySummary[];
}) {
  const router = useRouter();
  const [ideas, setIdeas] = useState(initial);
  const [filter, setFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<Idea | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  // × deletes. It used to set status "passed" and hide the row, which left the
  // idea in memory and in the table — and the tag counts kept counting things
  // Brennan had deleted. A hidden state nothing can reach is not a feature, it
  // is a place for bugs to live.
  const remove = async (id: string) => {
    setIdeas((p) => p.filter((i) => i.id !== id));
    if (openId === id) setOpenId(null);
    const supabase = createClient();
    await supabase.from("ideas").delete().eq("id", id);
  };

  const save = async (id: string, patch: Partial<Idea>) => {
    setIdeas((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const supabase = createClient();
    await supabase.from("ideas").update(patch).eq("id", id);
  };

  // One list, filtered by tag. There used to be an Inbox and a Kept section on
  // an email-triage model, but tagging something already *is* keeping it —
  // pressing Keep afterwards recorded nothing new, and "Inbox" only ever meant
  // "you haven't pressed the redundant button yet". Removed is the one state
  // left, and it just means gone from the list.
  const live = useMemo(() => ideas.filter((i) => i.status !== "passed"), [ideas]);
  const visible = filter ? live.filter((i) => (i.tags ?? []).includes(filter)) : live;

  // Every tag in use, with counts — the closest thing to Pinterest boards,
  // except an idea can sit in several at once. Counted over `live`, the same
  // set the All chip counts: reading "All · 2" beside "tuscany · 6" is a lie
  // about a list you can see the whole of.
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of live) for (const t of i.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [live]);
  const allTags = useMemo(() => tagCounts.map(([t]) => t), [tagCounts]);

  const toggleTag = (i: Idea, t: string) => {
    const cur = i.tags ?? [];
    save(i.id, { tags: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] });
  };

  const rowsFor = (items: Idea[]) =>
    items.map((i) => (
      <IdeaRow
        key={i.id}
        idea={i}
        open={openId === i.id}
        allTags={allTags}
        onToggle={() => setOpenId(openId === i.id ? null : i.id)}
        onToggleTag={toggleTag}
        onPromote={setPromoting}
        onRemove={() => remove(i.id)}
        onOpenWishlist={() => router.push("/trips#your-year")}
        journeys={journeys}
      />
    ));

  return (
    <div
      className="min-h-screen bg-parchment pb-24 px-3"
      style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto w-full max-w-[560px]">
        <button
          onClick={() => router.push("/trips")}
          className="flex items-center gap-1 mb-5 px-1"
          style={{ color: CAPTION, fontSize: 13 }}
        >
          <CaretLeft size={15} weight="light" />
          Journeys
        </button>

        <h1 className="font-display italic text-[29px] px-1 mb-4" style={{ color: INK }}>
          Ideas
        </h1>

        {tagCounts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4 px-1">
            <button
              onClick={() => setFilter(null)}
              className="px-3 py-1.5 rounded-full text-[12.5px]"
              style={
                filter === null
                  ? { background: INK, color: "#fff" }
                  : { border: `1px solid ${RULE}`, color: CAPTION }
              }
            >
              All · {live.length}
            </button>
            {tagCounts.map(([t, n]) => (
              <button
                key={t}
                onClick={() => setFilter(filter === t ? null : t)}
                className="px-3 py-1.5 rounded-full text-[12.5px]"
                style={
                  filter === t
                    ? { background: SIENNA, color: "#fff" }
                    : { border: `1px solid ${RULE}`, color: CAPTION }
                }
              >
                {t} · {n}
              </button>
            ))}
          </div>
        )}

        {live.length === 0 && (
          <p className="text-[13px] px-1" style={{ color: SOFT }}>
            Nothing saved yet.
          </p>
        )}

        {visible.length > 0 && (
          <div
            className="bg-white rounded-2xl overflow-hidden mb-4"
            style={{ boxShadow: `0 0 0 1px ${RULE}` }}
          >
            {rowsFor(visible)}
          </div>
        )}
      </div>

      {promoting && (
        <PromoteToWishlistSheet
          ideaId={promoting.id}
          // The same text the row shows. The share caption is what was being
          // passed, and TikTok rarely sends one — so the box opened empty
          // under a row that plainly had a name on it.
          initialQuery={ideaTitle(promoting) === "Untitled" ? "" : ideaTitle(promoting)}
          ideaUrl={promoting.url}
          resolvedPlace={promoting.place}
          journeys={journeys}
          onClose={() => setPromoting(null)}
          onDone={(outcome: PromoteOutcome) => {
            setIdeas((p) =>
              p.map((x) =>
                x.id !== promoting.id
                  ? x
                  : outcome.kind === "wishlist"
                    ? { ...x, wishlist_destination_id: outcome.destinationId }
                    : { ...x, pins_added: outcome.count, pinned_trip_id: outcome.tripId }
              )
            );
            setPromoting(null);
            setJustAdded(
              outcome.kind === "wishlist"
                ? `${outcome.name} added to your wishlist`
                : `${outcome.count} ${outcome.count === 1 ? "place" : "places"} added to ${outcome.tripTitle}`
            );
          }}
        />
      )}

      {justAdded && (
        <button
          onClick={() => setJustAdded(null)}
          className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[80] rounded-full px-4 py-2 text-[13px]"
          style={{ background: INK, color: "#fff" }}
        >
          {justAdded}
        </button>
      )}
    </div>
  );
}
