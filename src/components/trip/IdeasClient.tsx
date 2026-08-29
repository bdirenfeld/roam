"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft, ArrowSquareOut, Plus } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

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
}

export default function IdeasClient({ initial }: { initial: Idea[] }) {
  const router = useRouter();
  const [ideas, setIdeas] = useState(initial);
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTag, setDraftTag] = useState("");

  const save = async (id: string, patch: Partial<Idea>) => {
    setIdeas((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const supabase = createClient();
    await supabase.from("ideas").update(patch).eq("id", id);
  };

  // Every tag in use, with counts — the closest thing to Pinterest boards,
  // except an idea can sit in several at once.
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of ideas) for (const t of i.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [ideas]);

  const visible = filter
    ? ideas.filter((i) => (i.tags ?? []).includes(filter))
    : ideas;
  const inbox = visible.filter((i) => i.status === "inbox");
  const kept = visible.filter((i) => i.status === "kept");

  const toggleTag = (i: Idea, t: string) => {
    const cur = i.tags ?? [];
    save(i.id, {
      tags: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
    });
  };

  const Item = ({ i }: { i: Idea }) => {
    const isEditing = editing === i.id;
    return (
      <div className="px-4 py-3" style={{ borderTop: `1px solid ${RULE}` }}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[14px]" style={{ color: INK }}>
              {i.note || i.title || i.url || "Untitled"}
            </div>
            <div className="text-[11.5px] mt-0.5" style={{ color: SOFT }}>
              {i.source ?? "no link"}
            </div>
          </div>
          {i.url && (
            <a
              href={i.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 p-1"
              aria-label="Open"
            >
              <ArrowSquareOut size={16} weight="light" color={SOFT} />
            </a>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {(i.tags ?? []).map((t) => (
            <button
              key={t}
              onClick={() => toggleTag(i, t)}
              className="px-2.5 py-1 rounded-full text-[11.5px]"
              style={{ background: "rgba(196,98,45,0.12)", color: SIENNA }}
            >
              {t}
            </button>
          ))}
          <button
            onClick={() => {
              setEditing(isEditing ? null : i.id);
              setDraftTag("");
            }}
            className="px-1.5 py-1 rounded-full"
            aria-label="Add tag"
          >
            <Plus size={12} weight="bold" color={SOFT} />
          </button>
        </div>

        {isEditing && (
          <div className="mt-2">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tagCounts
                .filter(([t]) => !(i.tags ?? []).includes(t))
                .map(([t]) => (
                  <button
                    key={t}
                    onClick={() => toggleTag(i, t)}
                    className="px-2.5 py-1 rounded-full text-[11.5px]"
                    style={{ border: `1px solid ${RULE}`, color: CAPTION }}
                  >
                    {t}
                  </button>
                ))}
            </div>
            <input
              value={draftTag}
              onChange={(e) => setDraftTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const t = draftTag.trim().toLowerCase();
                if (t) toggleTag(i, t);
                setDraftTag("");
                setEditing(null);
              }}
              placeholder="New tag"
              className="w-full rounded-lg px-3 py-2 text-[12.5px]"
              style={{ background: "#FAF7F2", border: `1px solid ${RULE}`, color: INK }}
            />
          </div>
        )}

        {i.status === "inbox" && (
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={() => save(i.id, { status: "kept" })}
              className="px-3 py-1.5 rounded-full text-[12px]"
              style={{ background: INK, color: "#fff" }}
            >
              Keep
            </button>
            <button
              onClick={() => save(i.id, { status: "passed" })}
              className="px-3 py-1.5 rounded-full text-[12px]"
              style={{ border: `1px solid ${RULE}`, color: CAPTION }}
            >
              Pass
            </button>
          </div>
        )}
      </div>
    );
  };

  const Group = ({ label, items }: { label: string; items: Idea[] }) =>
    items.length === 0 ? null : (
      <div
        className="bg-white rounded-2xl overflow-hidden mb-4"
        style={{ boxShadow: `0 0 0 1px ${RULE}` }}
      >
        <div
          className="px-4 pt-3 pb-1.5 text-[11px] uppercase tracking-wider"
          style={{ color: SOFT }}
        >
          {label} · {items.length}
        </div>
        {items.map((i) => (
          <Item key={i.id} i={i} />
        ))}
      </div>
    );

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
              All · {ideas.length}
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

        {ideas.length === 0 && (
          <p className="text-[13px] px-1" style={{ color: SOFT }}>
            Nothing saved yet.
          </p>
        )}

        <Group label="Inbox" items={inbox} />
        <Group label="Kept" items={kept} />
      </div>
    </div>
  );
}
