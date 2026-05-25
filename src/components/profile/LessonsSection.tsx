"use client";

import { useEffect, useRef, useState } from "react";
import { PencilSimple, Plus, X } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

export interface Lesson {
  id: string;
  body: string;
  position: number;
}

interface Props {
  userId: string;
  initialLessons: Lesson[];
}

export default function LessonsSection({ userId, initialLessons }: Props) {
  const [lessons, setLessons] = useState<Lesson[]>(initialLessons);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const editing = adding || editingId !== null;

  useEffect(() => {
    if (!editing) return;
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    });
  }, [editing]);

  const startAdd = () => {
    if (editing) return;
    setDraft("");
    setAdding(true);
  };

  const startEdit = (lesson: Lesson) => {
    if (editing) return;
    setEditingId(lesson.id);
    setDraft(lesson.body);
  };

  const cancel = () => {
    setAdding(false);
    setEditingId(null);
    setDraft("");
  };

  const saveAdd = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    const supabase = createClient();
    const nextPosition =
      lessons.length > 0 ? Math.max(...lessons.map((l) => l.position)) + 1 : 1;
    const { data, error } = await supabase
      .from("lessons")
      .insert({ user_id: userId, body, position: nextPosition })
      .select("id, body, position")
      .single();
    setBusy(false);
    if (!error && data) {
      setLessons((prev) => [...prev, data as Lesson]);
      cancel();
    }
  };

  const saveEdit = async () => {
    const id = editingId;
    const body = draft.trim();
    if (!id || !body || busy) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("lessons")
      .update({ body })
      .eq("id", id);
    setBusy(false);
    if (!error) {
      setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, body } : l)));
      cancel();
    }
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("lessons").delete().eq("id", id);
    if (!error) {
      const remaining = lessons
        .filter((l) => l.id !== id)
        .sort((a, b) => a.position - b.position);
      const repacked = remaining.map((l, i) => ({ ...l, position: i + 1 }));
      const updates = repacked
        .filter((l, i) => remaining[i].position !== l.position)
        .map((l) =>
          supabase
            .from("lessons")
            .update({ position: l.position })
            .eq("id", l.id)
        );
      if (updates.length) await Promise.all(updates);
      setLessons(repacked);
      if (editingId === id) cancel();
    }
    setBusy(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (adding) void saveAdd();
      else void saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  };

  const sorted = [...lessons].sort((a, b) => a.position - b.position);
  const isEmpty = sorted.length === 0;

  return (
    <section className="mt-10">
      {/* Section title */}
      <div className="pb-3.5">
        <h2 className="font-display italic font-medium text-[24px] text-[#1A1A2E] leading-tight">
          Lessons learned
        </h2>
      </div>

      {isEmpty && !adding ? (
        <div className="border-t border-b border-black/5 py-9">
          <p
            className="font-display italic text-[16px] leading-[1.55]"
            style={{ color: "rgba(26,26,46,0.4)" }}
          >
            e.g. &ldquo;Keep one day completely unplanned — always the best
            day.&rdquo;
          </p>
          <div className="mt-[18px]">
            <button
              onClick={startAdd}
              className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded bg-[#1A1A2E] text-[#FAF7F2] text-[14px] font-medium active:scale-[0.99] transition-transform"
              style={{ letterSpacing: "-0.005em" }}
            >
              <Plus size={12} weight="light" />
              Add a lesson
            </button>
          </div>
        </div>
      ) : (
        <div>
          {sorted.map((lesson) =>
            editingId === lesson.id ? (
              <EditorRow
                key={lesson.id}
                mode="edit"
                draft={draft}
                busy={busy}
                onInput={onInput}
                onKeyDown={onKeyDown}
                onCancel={cancel}
                onSave={saveEdit}
                onRemove={() => remove(lesson.id)}
                textareaRef={textareaRef}
              />
            ) : (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                dimmed={editing}
                onEdit={() => startEdit(lesson)}
                onRemove={() => remove(lesson.id)}
              />
            )
          )}

          {/* Closing rule + Add row, or inline add editor */}
          {adding ? (
            <EditorRow
              mode="add"
              draft={draft}
              busy={busy}
              onInput={onInput}
              onKeyDown={onKeyDown}
              onCancel={cancel}
              onSave={saveAdd}
              textareaRef={textareaRef}
            />
          ) : (
            <>
              <div className="border-t border-black/5" />
              <AddRow dimmed={!!editingId} onClick={startAdd} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ── Lesson row (display state) ───────────────────────────────────────────────

function LessonRow({
  lesson,
  dimmed,
  onEdit,
  onRemove,
}: {
  lesson: Lesson;
  dimmed: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`group flex items-start gap-3 border-t border-black/5 py-[15px] transition-opacity ${
        dimmed ? "opacity-50" : ""
      }`}
    >
      <button
        onClick={onEdit}
        disabled={dimmed}
        className="flex-1 min-w-0 text-left"
      >
        <span
          className="font-display italic font-normal text-[16.5px] leading-[1.5] text-[#1A1A2E]"
          style={{ letterSpacing: "-0.005em" }}
        >
          {lesson.body}
        </span>
      </button>
      <div className="flex items-center gap-3 pt-1 opacity-40">
        <button
          onClick={onEdit}
          disabled={dimmed}
          aria-label="Edit lesson"
          className="p-1 -m-1 active:opacity-60"
        >
          <PencilSimple size={14} weight="light" color="#1A1A2E" />
        </button>
        <button
          onClick={onRemove}
          disabled={dimmed}
          aria-label="Remove lesson"
          className="p-1 -m-1 active:opacity-60"
        >
          <X size={14} weight="light" color="#1A1A2E" />
        </button>
      </div>
    </div>
  );
}

// ── Add row affordance ───────────────────────────────────────────────────────

function AddRow({ dimmed, onClick }: { dimmed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={dimmed}
      className={`w-full flex items-center gap-3 py-[15px] text-left transition-opacity ${
        dimmed ? "opacity-50" : ""
      }`}
    >
      <span
        className="w-5 h-5 inline-flex items-center justify-center rounded-full"
        style={{ color: "rgba(26,26,46,0.5)" }}
      >
        <Plus size={12} weight="light" />
      </span>
      <span
        className="font-display italic text-[16px]"
        style={{ color: "rgba(26,26,46,0.5)" }}
      >
        Add a lesson
      </span>
    </button>
  );
}

// ── Editor row (add or edit) ─────────────────────────────────────────────────

function EditorRow({
  mode,
  draft,
  busy,
  onInput,
  onKeyDown,
  onCancel,
  onSave,
  onRemove,
  textareaRef,
}: {
  mode: "add" | "edit";
  draft: string;
  busy: boolean;
  onInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCancel: () => void;
  onSave: () => void;
  onRemove?: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}) {
  return (
    <div
      className="border-t border-b border-black/5 py-[18px] flex flex-col gap-3"
      style={{ background: "rgba(196,98,45,0.04)" }}
    >
      <div className="flex items-baseline justify-between">
        <span
          className="text-[9.5px] font-medium uppercase"
          style={{ color: "#C4622D", letterSpacing: "0.16em" }}
        >
          {mode === "add" ? "Writing a lesson" : "Editing"}
        </span>
        {mode === "add" ? (
          <span
            className="font-display italic text-[12px]"
            style={{ color: "rgba(26,26,46,0.5)" }}
          >
            One short line.
          </span>
        ) : (
          <button
            onClick={onCancel}
            aria-label="Close editor"
            className="p-1 -m-1"
          >
            <X size={13} weight="light" color="rgba(26,26,46,0.5)" />
          </button>
        )}
      </div>

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={onInput}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={mode === "add" ? "A short line, true of you." : ""}
        className="w-full resize-none bg-transparent outline-none font-display italic font-normal text-[16.5px] leading-[1.5] text-[#1A1A2E] placeholder:text-[rgba(26,26,46,0.3)]"
        style={{ letterSpacing: "-0.005em" }}
      />

      <div className="flex items-center justify-between gap-3 mt-1">
        {mode === "edit" && onRemove ? (
          <button
            onClick={onRemove}
            disabled={busy}
            className="font-display italic text-[14px]"
            style={{ color: "rgba(26,26,46,0.5)" }}
          >
            Remove this lesson
          </button>
        ) : (
          <span
            className="text-[11px]"
            style={{ color: "rgba(26,26,46,0.5)", letterSpacing: "0.02em" }}
          >
            Return to save · Esc to discard
          </span>
        )}
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            disabled={busy}
            className="font-display italic text-[14px]"
            style={{ color: "rgba(26,26,46,0.5)" }}
          >
            {mode === "add" ? "Discard" : "Cancel"}
          </button>
          <button
            onClick={onSave}
            disabled={busy || !draft.trim()}
            className="px-3.5 py-1.5 rounded bg-[#1A1A2E] text-[#FAF7F2] text-[13px] font-medium disabled:opacity-40 active:scale-[0.99] transition-all"
            style={{ letterSpacing: "-0.005em" }}
          >
            {mode === "add" ? "Save lesson" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
