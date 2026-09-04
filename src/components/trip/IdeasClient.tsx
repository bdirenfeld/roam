"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { useSheetDrag } from "@/hooks/useSheetDrag";
import PromoteToWishlistSheet from "./PromoteToWishlistSheet";
import SetLocationSheet from "./SetLocationSheet";
import type { JourneySummary, PromoteOutcome, ResolvedIdeaPlace } from "./PromoteToWishlistSheet";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.35)";
const RULE = "rgba(26,26,46,0.10)";
const SIENNA = "#C4622D";

type IdeaFilter =
  | { kind: "all" }
  | { kind: "unused" }
  | { kind: "journey"; value: string }
  | { kind: "tag"; value: string };

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

/** One line for the row. The note is the body, not the title. */
function ideaHeadline(i: Idea): string {
  if (i.title?.trim()) return i.title.trim();
  const firstLine = i.note?.split(/\n|—|\. /)[0]?.trim();
  if (firstLine) return firstLine.length > 72 ? firstLine.slice(0, 69).trimEnd() + "…" : firstLine;
  if (i.url) {
    try { return new URL(i.url).hostname.replace(/^www\./, "") + " link"; } catch { return i.url; }
  }
  return "Untitled";
}

function FilterOption({
  label,
  count,
  selected,
  onSelect,
}: {
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-baseline justify-between gap-3 py-2 px-0.5 text-left"
    >
      <span className="text-[13.5px] truncate" style={{ color: selected ? SIENNA : INK }}>
        {label}
      </span>
      <span className="text-[11.5px] shrink-0" style={{ color: selected ? SIENNA : SOFT }}>
        {count}
      </span>
    </button>
  );
}

/**
 * A still map of where the idea is, for the expanded row.
 *
 * Recognition, not exploration: you are checking that "Castiglioncello" is the
 * stretch of coast you remember, and a picture answers that. Panning and
 * zooming would turn a list row into an application, and the journey's own map
 * is where exploring belongs.
 */
function staticMapUrl(place: ResolvedIdeaPlace | null): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!place || !token) return null;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
    `pin-s+c4622d(${place.lng},${place.lat})/` +
    `${place.lng},${place.lat},11,0/640x300@2x?access_token=${token}`
  );
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
  onSetLocation,
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
  onSetLocation: (idea: Idea) => void;
  onRemove: () => void;
  onOpenWishlist: () => void;
  journeys: JourneySummary[];
}) {
  const [tagging, setTagging] = useState(false);
  const [draft, setDraft] = useState("");

  const tags = idea.tags ?? [];
  const src = shortSource(idea.source);
  const mapUrl = staticMapUrl(idea.place);

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
            {ideaHeadline(idea)}
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
        aria-label={`Remove ${ideaHeadline(idea)}`}
        className="shrink-0 w-11 h-11 mr-1 grid place-items-center text-[17px] leading-none rounded-full"
        style={{ color: "rgba(26,26,46,0.28)" }}
      >
        ×
      </button>
      </div>

      {open && (
        <div className="px-4 pb-3" style={{ background: "#FCFBF8" }}>
          {idea.note && idea.note.trim() !== ideaHeadline(idea) && (
            <p className="text-[13px] leading-snug whitespace-pre-wrap mb-2.5 pt-1" style={{ color: "rgba(26,26,46,0.75)" }}>
              {idea.note}
            </p>
          )}
          {idea.url && (
            <a
              href={idea.url}
              target="_blank"
              rel="noopener"
              className="block text-[11.5px] truncate mb-2.5 underline underline-offset-2"
              style={{ color: SOFT }}
            >
              {idea.url}
            </a>
          )}
          {mapUrl && idea.place && (
            <div className="mb-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mapUrl}
                alt={`Map showing ${idea.place.name}`}
                className="w-full rounded-lg"
                style={{ aspectRatio: "64 / 30", objectFit: "cover", border: `1px solid ${RULE}` }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <p className="text-[10.5px] mt-1" style={{ color: SOFT }}>
                {idea.place.address}
              </p>
            </div>
          )}

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

            {!idea.place && (
              <button
                onClick={() => onSetLocation(idea)}
                className="px-3 py-1.5 rounded-full text-[11.5px]"
                style={{ border: `1px solid ${RULE}`, color: CAPTION }}
              >
                Set location
              </button>
            )}

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
  backTo = null,
}: {
  initial: Idea[];
  journeys: JourneySummary[];
  /** The journey this page was opened from, so the back link returns there
   *  instead of dropping you on the journeys index (Brennan, Sep 2026). */
  backTo?: { href: string; title: string } | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  // Paste-a-link. Ideas arrived only through Android's share target, so on
  // a desktop or an iPhone the inbox could never fill and the empty state
  // didn't say why (UX audit, Sep 2026, finding 3). The pasted link goes
  // through the same /share capture as a shared one.
  const [pasteUrl, setPasteUrl] = useState("");
  const submitPaste = (e: React.FormEvent) => {
    e.preventDefault();
    const v = pasteUrl.trim();
    if (!/^https?:\/\//i.test(v)) { toast({ message: "Paste a full link, starting with https://" }); return; }
    router.push(`/share?url=${encodeURIComponent(v)}`);
  };
  const [ideas, setIdeas] = useState(initial);
  const [filter, setFilter] = useState<IdeaFilter>({ kind: "all" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const closeFilter = useCallback(() => { setFilterOpen(false); setFilterQuery(""); }, []);
  const filterDrag = useSheetDrag(closeFilter);
  const [openId, setOpenId] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<Idea | null>(null);
  const [locating, setLocating] = useState<Idea | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  // × deletes. It used to set status "passed" and hide the row, which left the
  // idea in memory and in the table — and the tag counts kept counting things
  // Brennan had deleted. A hidden state nothing can reach is not a feature, it
  // is a place for bugs to live.
  // Remove used to mutate the list first and ask the database second, with
  // no confirm, no undo and no error check — a refused delete came back on
  // reload (UX audit, Sep 2026, findings 1 and 2). Now: optimistic, checked,
  // and six seconds of Undo that re-inserts the row under its original id.
  const remove = async (id: string) => {
    const gone = ideas.find((i) => i.id === id);
    setIdeas((p) => p.filter((i) => i.id !== id));
    if (openId === id) setOpenId(null);
    const supabase = createClient();
    const { error } = await supabase.from("ideas").delete().eq("id", id);
    if (error) {
      if (gone) setIdeas((p) => (p.some((i) => i.id === id) ? p : [gone, ...p]));
      toast({ message: "Couldn't remove that idea. Try again." });
      return;
    }
    if (!gone) return;
    toast({
      message: "Idea removed",
      undo: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: insErr } = await supabase.from("ideas").insert({
          id: gone.id, user_id: user?.id, url: gone.url, title: gone.title, note: gone.note,
          source: gone.source, status: gone.status, tags: gone.tags, created_at: gone.created_at,
          wishlist_destination_id: gone.wishlist_destination_id, pins_added: gone.pins_added,
          pinned_trip_id: gone.pinned_trip_id, place: gone.place,
        });
        if (insErr) { toast({ message: "Couldn't bring it back. Try again." }); return; }
        setIdeas((p) => (p.some((i) => i.id === gone.id) ? p : [gone, ...p]));
      },
    });
  };

  const save = async (id: string, patch: Partial<Idea>) => {
    let before: Idea | undefined;
    setIdeas((p) => p.map((i) => { if (i.id === id) before = i; return i.id === id ? { ...i, ...patch } : i; }));
    const supabase = createClient();
    const { error } = await supabase.from("ideas").update(patch).eq("id", id);
    if (error) {
      if (before) { const b = before; setIdeas((p) => p.map((i) => (i.id === id ? b : i))); }
      toast({ message: "Couldn't save that. Try again." });
    }
  };

  // One list, filtered by tag. There used to be an Inbox and a Kept section on
  // an email-triage model, but tagging something already *is* keeping it —
  // pressing Keep afterwards recorded nothing new, and "Inbox" only ever meant
  // "you haven't pressed the redundant button yet". Removed is the one state
  // left, and it just means gone from the list.
  const live = useMemo(() => ideas.filter((i) => i.status !== "passed"), [ideas]);

  // One filter, three kinds of question. Tags answer "show me beach things",
  // journeys answer "show me what I saved for Puglia" — the question you
  // actually ask when planning — and "not yet used" answers "what have I done
  // nothing with". A row of tag chips could only ever answer the first, and
  // wrapped into a wall once there were more than a handful.
  const visible = useMemo(() => {
    if (filter.kind === "tag") return live.filter((i) => (i.tags ?? []).includes(filter.value));
    if (filter.kind === "journey") return live.filter((i) => i.pinned_trip_id === filter.value);
    if (filter.kind === "unused")
      return live.filter((i) => i.pins_added === 0 && !i.wishlist_destination_id);
    return live;
  }, [live, filter]);

  const unusedCount = useMemo(
    () => live.filter((i) => i.pins_added === 0 && !i.wishlist_destination_id).length,
    [live]
  );

  // Only journeys that actually hold something — an empty row is a dead end.
  const journeyCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of live) if (i.pinned_trip_id) m.set(i.pinned_trip_id, (m.get(i.pinned_trip_id) ?? 0) + 1);
    return journeys
      .map((j) => ({ j, n: m.get(j.id) ?? 0 }))
      .filter((x) => x.n > 0)
      // Alphabetical, like the tags below them: a menu you can learn the shape
      // of beats one that reshuffles as counts change.
      .sort((a, b) => a.j.title.localeCompare(b.j.title));
  }, [live, journeys]);

  const filterLabel =
    filter.kind === "all"
      ? "All ideas"
      : filter.kind === "unused"
        ? "Not yet used"
        : filter.kind === "journey"
          ? journeys.find((j) => j.id === filter.value)?.title ?? "A journey"
          : filter.value;

  // Every tag in use, with counts — the closest thing to Pinterest boards,
  // except an idea can sit in several at once. Counted over `live`, the same
  // set the All chip counts: reading "All · 2" beside "tuscany · 6" is a lie
  // about a list you can see the whole of.
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of live) for (const t of i.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    // Alphabetical, not by count: you are looking for a tag you already have
    // in mind, and a list that reorders itself as counts change is one you have
    // to read every time instead of knowing where things are.
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [live]);
  const allTags = useMemo(() => tagCounts.map(([t]) => t), [tagCounts]);

  // Narrowing the menu itself. Substring, case-insensitive — you are typing
  // the start of a tag you already know exists, not running a search.
  const fq = filterQuery.trim().toLowerCase();
  const matches = (label: string) => !fq || label.toLowerCase().includes(fq);
  const shownJourneys = journeyCounts.filter(({ j }) => matches(j.title));
  const shownTags = tagCounts.filter(([t]) => matches(t));

  const pickFilter = (next: IdeaFilter) => {
    setFilter(next);
    setFilterOpen(false);
    setFilterQuery("");
  };


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
        onSetLocation={setLocating}
        onRemove={() => remove(i.id)}
        onOpenWishlist={() => router.push("/trips#your-year")}
        journeys={journeys}
      />
    ));

  return (
    <div
      className="min-h-screen bg-white md:bg-parchment pb-24 px-3"
      style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto w-full max-w-[560px]">
        <button
          onClick={() => router.push(backTo ? backTo.href : "/trips")}
          className="flex items-center gap-1 mb-5 px-1"
          style={{ color: CAPTION, fontSize: 13 }}
        >
          <CaretLeft size={15} weight="light" />
          {backTo ? backTo.title : "Journeys"}
        </button>

        <h1 className="font-display italic text-[29px] px-1 mb-4" style={{ color: INK }}>
          Ideas
        </h1>

        {live.length > 0 && (
          <button
            onClick={() => setFilterOpen(true)}
            className="w-full flex items-center justify-between gap-2 mb-4 px-3 py-2.5 rounded-xl"
            style={{ background: "#fff", border: `1px solid ${RULE}` }}
          >
            <span className="text-[13.5px] truncate" style={{ color: INK }}>
              {filterLabel}
            </span>
            <span className="text-[11.5px] shrink-0" style={{ color: SOFT }}>
              {visible.length} ⌄
            </span>
          </button>
        )}

        {live.length === 0 && (
          <p className="text-[13px] px-1" style={{ color: SOFT }}>
            Nothing saved yet. Paste a link below, or share one here from TikTok or Maps on your phone.
          </p>
        )}

        <form onSubmit={submitPaste} className="flex gap-2 mb-4 px-1">
          <input
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            inputMode="url"
            placeholder="Paste a link from TikTok, Maps or anywhere"
            aria-label="Paste a link"
            className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-white text-[13.5px] outline-none"
            style={{ boxShadow: `0 0 0 1px ${RULE}` }}
          />
          <button
            type="submit"
            className="h-10 px-4 rounded-xl text-[13px] font-semibold flex-shrink-0"
            style={{ background: "#1A1A2E", color: "#FAF7F2" }}
          >
            Save
          </button>
        </form>

        {visible.length > 0 && (
          <div
            className="bg-white rounded-2xl overflow-hidden mb-4"
            style={{ boxShadow: `0 0 0 1px ${RULE}` }}
          >
            {rowsFor(visible)}
          </div>
        )}
      </div>

      {/* One filter, grouped by the question it answers. Journeys sit above
          tags because "what did I save for Puglia" is the question you ask
          while planning; tags are how you browse. */}
      {filterOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={closeFilter}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            ref={filterDrag.sheetRef}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={filterDrag.onTouchStart}
            onTouchMove={filterDrag.onTouchMove}
            onTouchEnd={filterDrag.onTouchEnd}
            onTouchCancel={filterDrag.onTouchCancel}
            className="relative w-full max-w-[560px] rounded-t-2xl px-4 pt-3 pb-6 overflow-y-auto"
            style={{
              background: "#FFFFFF",
              borderTop: `1px solid ${RULE}`,
              maxHeight: "82dvh",
              overscrollBehavior: "contain",
            }}
          >
            <div className="mx-auto mb-3" style={{ width: 34, height: 4, borderRadius: 2, background: "rgba(26,26,46,0.16)" }} />

            {/* Type to narrow. Not autofocused: opening the sheet to tap a tag
                you can already see shouldn't throw a keyboard over it. */}
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search journeys and tags"
              className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none mb-1"
              style={{ background: "#fff", border: `1px solid ${RULE}`, color: INK }}
            />

            {matches("All ideas") && (
              <FilterOption
                label="All ideas"
                count={live.length}
                selected={filter.kind === "all"}
                onSelect={() => pickFilter({ kind: "all" })}
              />
            )}
            {matches("Not yet used") && (
              <FilterOption
                label="Not yet used"
                count={unusedCount}
                selected={filter.kind === "unused"}
                onSelect={() => pickFilter({ kind: "unused" })}
              />
            )}

            {shownJourneys.length > 0 && (
              <>
                <p className="text-[9px] uppercase mt-3 mb-1 px-0.5" style={{ letterSpacing: "0.14em", color: SOFT }}>
                  Saved for a journey
                </p>
                {shownJourneys.map(({ j, n }) => (
                  <FilterOption
                    key={j.id}
                    label={j.title}
                    count={n}
                    selected={filter.kind === "journey" && filter.value === j.id}
                    onSelect={() => pickFilter({ kind: "journey", value: j.id })}
                  />
                ))}
              </>
            )}

            {shownTags.length > 0 && (
              <>
                <p className="text-[9px] uppercase mt-3 mb-1 px-0.5" style={{ letterSpacing: "0.14em", color: SOFT }}>
                  Tags
                </p>
                {shownTags.map(([t, n]) => (
                  <FilterOption
                    key={t}
                    label={t}
                    count={n}
                    selected={filter.kind === "tag" && filter.value === t}
                    onSelect={() => pickFilter({ kind: "tag", value: t })}
                  />
                ))}
              </>
            )}

            {filterQuery.trim() &&
              shownJourneys.length === 0 &&
              shownTags.length === 0 &&
              !matches("All ideas") &&
              !matches("Not yet used") && (
                <p className="text-[13px] py-3 px-0.5" style={{ color: SOFT }}>
                  Nothing matches &ldquo;{filterQuery.trim()}&rdquo;.
                </p>
              )}
          </div>
        </div>
      )}

      {locating && (
        <SetLocationSheet
          ideaId={locating.id}
          initialQuery={ideaTitle(locating) === "Untitled" ? "" : ideaTitle(locating)}
          onClose={() => setLocating(null)}
          onSet={(place) => {
            setIdeas((p) => p.map((x) => (x.id === locating.id ? { ...x, place } : x)));
            setLocating(null);
          }}
        />
      )}

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
