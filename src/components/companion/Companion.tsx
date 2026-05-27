"use client";

// ============================================================
// Roam — Companion
// Orchestrator: the editorial entry pull, the panel, conversation
// state, and the single round-trip to /api/assistant.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { Compass } from "@phosphor-icons/react";
import type {
  AssistantStreamEvent,
  CompanionMessage,
  RestoreEntry,
} from "@/lib/companion/types";
import CompanionPanel, { type ThreadItem } from "./CompanionPanel";

const SIENNA = "#C4622D";
const INK = "#1A1A2E";
const PARCHMENT = "#FAF7F2";
const RULE = "rgba(26,26,46,0.12)";

const cacheKey = (tripId: string) => `roam:companion:v1:${tripId}`;
const pendingConvKey = (tripId: string) => `roam:companion:v1:${tripId}:pending-conv`;

interface CompanionProps {
  tripId: string;
  // Optional controlled mode — the day view hoists open so the desktop grid
  // can flip between 2 and 3 columns. When omitted, the component owns its
  // own open state (the mobile / fallback behavior).
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Optional className overrides for desktop placement. At md:+ the day view
  // uses display:contents on the wrapper so these classes place the entry
  // pull and the panel into specific grid columns. Mobile is unaffected.
  entryClassName?: string;
  panelOuterClassName?: string;
}

export default function Companion({
  tripId,
  open: controlledOpen,
  onOpenChange,
  entryClassName,
  panelOuterClassName,
}: CompanionProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  // pendingConvId is the client-minted uuid for a brand-new conversation
  // that has not yet received its first message. Survives navigation via
  // sessionStorage so the empty state doesn't snap back to the old thread
  // (the server's most-recent-wins rule would otherwise return it).
  const [pendingConvId, setPendingConvId] = useState<string | null>(null);
  // Inline confirm gate visibility — rendered in the thread, never a
  // native window.confirm (clashes with the Roam surface).
  const [showNewConvGate, setShowNewConvGate] = useState(false);

  // Open — try the in-tab cache first, fall back to the persisted
  // thread. The cache preserves cut_proposal items (and their
  // restoreEntries) across navigations within the same tab; the GET
  // only returns flat companion_messages rows and cannot rebuild a
  // cut_proposal frame.
  const openCompanion = useCallback(async () => {
    setOpen(true);
    if (loaded) return;

    if (typeof window !== "undefined") {
      // Pending new-conversation wins over everything: a fresh id was
      // minted but no first message has been sent yet. Show empty thread
      // (greeting state) and skip GET — the server has no rows under this
      // id and would otherwise return the OLD conversation via most-
      // recent-wins.
      try {
        const pending = window.sessionStorage.getItem(pendingConvKey(tripId));
        if (pending) {
          setPendingConvId(pending);
          setItems([]);
          setLoaded(true);
          return;
        }
      } catch {
        // Fall through.
      }

      try {
        const cached = window.sessionStorage.getItem(cacheKey(tripId));
        if (cached) {
          const parsed = JSON.parse(cached) as ThreadItem[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setItems(parsed);
            setLoaded(true);
            return;
          }
        }
      } catch {
        // Fall through to GET on any cache trouble.
      }
    }

    try {
      const res = await fetch(`/api/assistant?tripId=${encodeURIComponent(tripId)}`);
      if (res.ok) {
        const data = (await res.json()) as { messages: CompanionMessage[] };
        setItems(
          (data.messages ?? []).map((m) => ({
            kind: "msg" as const,
            id: m.id,
            role: m.role,
            text: m.content,
          })),
        );
      }
    } catch {
      // Fail quietly — an empty thread is a fine starting point.
    } finally {
      setLoaded(true);
    }
  }, [loaded, tripId]);

  // Mirror items to sessionStorage so an in-tab remount (navigating
  // to a day view and back) doesn't drop the cut_proposal frame and
  // its Restore link. Scoped per-trip; cleared naturally on tab close.
  useEffect(() => {
    if (!loaded) return;
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(cacheKey(tripId), JSON.stringify(items));
    } catch {
      // Quota exceeded or storage disabled — degrade silently.
    }
  }, [items, loaded, tripId]);

  // Mirror pendingConvId to sessionStorage so a new-conversation that
  // hasn't yet received its first message survives in-tab navigation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (pendingConvId) {
        window.sessionStorage.setItem(pendingConvKey(tripId), pendingConvId);
      } else {
        window.sessionStorage.removeItem(pendingConvKey(tripId));
      }
    } catch {
      // Degrade silently.
    }
  }, [pendingConvId, tripId]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Toast auto-dismiss.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const appendToMsg = useCallback((id: string, delta: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.kind === "msg" && it.id === id ? { ...it, text: it.text + delta } : it,
      ),
    );
  }, []);

  // ── Send a turn — stream the reply token by token ────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const userId = crypto.randomUUID();
    const asstId = crypto.randomUUID();
    setItems((prev) => [
      ...prev,
      { kind: "msg", id: userId, role: "user", text },
      { kind: "msg", id: asstId, role: "assistant", text: "" },
    ]);
    setStreaming(true);
    setStreamingId(asstId);

    // Carry the pending new-conversation id once, on the first send of
    // the new thread. After this turn lands, the new id is the most-
    // recent row for the trip — server-side most-recent-wins takes over
    // and we no longer need to pass it.
    const carryConvId = pendingConvId;

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          carryConvId
            ? { tripId, message: text, conversationId: carryConvId }
            : { tripId, message: text },
        ),
      });
      if (!res.ok || !res.body) throw new Error("no stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: AssistantStreamEvent;
          try {
            ev = JSON.parse(line) as AssistantStreamEvent;
          } catch {
            continue;
          }
          if (ev.type === "text") {
            appendToMsg(asstId, ev.delta);
          } else if (ev.type === "proposal") {
            setItems((prev) => [
              ...prev,
              {
                kind: "proposal",
                id: crypto.randomUUID(),
                proposal: ev.proposal,
                decision: "pending",
              },
            ]);
          } else if (ev.type === "cut_proposal") {
            setItems((prev) => [
              ...prev,
              {
                kind: "cut_proposal",
                id: crypto.randomUUID(),
                proposal: ev.proposal,
                decision: "pending",
              },
            ]);
          } else if (ev.type === "move_proposal") {
            setItems((prev) => [
              ...prev,
              {
                kind: "move_proposal",
                id: crypto.randomUUID(),
                proposal: ev.proposal,
                decision: "pending",
              },
            ]);
          } else if (ev.type === "error") {
            appendToMsg(asstId, ev.message);
          }
        }
      }
    } catch {
      appendToMsg(asstId, "Something interrupted that — try again in a moment.");
    } finally {
      setStreaming(false);
      setStreamingId(null);
      // Drop an empty Roam turn (e.g. a proposal that arrived with no lede).
      setItems((prev) =>
        prev.filter(
          (it) => !(it.kind === "msg" && it.id === asstId && it.text.trim() === ""),
        ),
      );
      // The new-conversation id has now been written into the DB by the
      // server; subsequent turns will resolve it via most-recent-wins.
      if (carryConvId) setPendingConvId(null);
    }
  }, [input, streaming, tripId, appendToMsg, pendingConvId]);

  // ── Approve a proposal — the route runs the add ──────────────
  const approve = useCallback(
    async (proposalItemId: string) => {
      const item = items.find(
        (it) => it.kind === "proposal" && it.id === proposalItemId,
      );
      if (!item || item.kind !== "proposal" || item.decision !== "pending") return;

      setBusyProposalId(proposalItemId);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tripId, approve: item.proposal }),
        });
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as { added?: number };
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "proposal" && it.id === proposalItemId
              ? { ...it, decision: "approved" }
              : it,
          ),
        );
        const n = data.added ?? item.proposal.places.length;
        setToast(`${n} ${n === 1 ? "place" : "places"} added`);
      } catch {
        setToast("Couldn't add those — try again.");
      } finally {
        setBusyProposalId(null);
      }
    },
    [items, tripId],
  );

  // ── Discard any proposal (add or cut) — writes nothing ────────
  const discard = useCallback(
    async (proposalItemId: string) => {
      setBusyProposalId(proposalItemId);
      try {
        await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tripId, discard: true }),
        });
      } catch {
        // Nothing was written — the discard stands regardless.
      }
      setItems((prev) =>
        prev.map((it) =>
          (it.kind === "proposal" ||
            it.kind === "cut_proposal" ||
            it.kind === "move_proposal") &&
          it.id === proposalItemId
            ? { ...it, decision: "discarded" }
            : it,
        ),
      );
      setBusyProposalId(null);
    },
    [tripId],
  );

  // ── Approve a cut — the route flips status to 'cut' and returns
  //    the prior_status of each card so Restore can put them back ─
  const approveCut = useCallback(
    async (proposalItemId: string) => {
      const item = items.find(
        (it) => it.kind === "cut_proposal" && it.id === proposalItemId,
      );
      if (!item || item.kind !== "cut_proposal" || item.decision !== "pending") return;

      setBusyProposalId(proposalItemId);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tripId,
            approveCut: { card_ids: item.proposal.cards.map((c) => c.card_id) },
          }),
        });
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as {
          cut?: number;
          restore_entries?: RestoreEntry[];
        };
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "cut_proposal" && it.id === proposalItemId
              ? {
                  ...it,
                  decision: "approved",
                  restoreEntries: data.restore_entries ?? [],
                }
              : it,
          ),
        );
        const n = data.cut ?? item.proposal.cards.length;
        setToast(`${n} ${n === 1 ? "card" : "cards"} cut`);
      } catch {
        setToast("Couldn't cut those — try again.");
      } finally {
        setBusyProposalId(null);
      }
    },
    [items, tripId],
  );

  // ── Approve a move — the route relocates the card to the target
  //    day, re-packs the source day, keeps start_time/end_time. ───
  const approveMove = useCallback(
    async (proposalItemId: string) => {
      const item = items.find(
        (it) => it.kind === "move_proposal" && it.id === proposalItemId,
      );
      if (!item || item.kind !== "move_proposal" || item.decision !== "pending") return;

      setBusyProposalId(proposalItemId);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tripId,
            approveMove: {
              card_id: item.proposal.card_id,
              target_day_id: item.proposal.target_day_id,
            },
          }),
        });
        if (!res.ok) throw new Error("failed");
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "move_proposal" && it.id === proposalItemId
              ? { ...it, decision: "approved" }
              : it,
          ),
        );
        setToast(`Moved to Day ${item.proposal.target_day_number}`);
      } catch {
        setToast("Couldn't move that — try again.");
      } finally {
        setBusyProposalId(null);
      }
    },
    [items, tripId],
  );

  // ── Restore — direct, non-model. Reverts each card to the status
  //    it held BEFORE the cut (NOT a hardcoded 'interested'). ─────
  const restore = useCallback(
    async (proposalItemId: string) => {
      const item = items.find(
        (it) => it.kind === "cut_proposal" && it.id === proposalItemId,
      );
      if (
        !item ||
        item.kind !== "cut_proposal" ||
        item.decision !== "approved" ||
        !item.restoreEntries?.length
      )
        return;

      setBusyProposalId(proposalItemId);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tripId,
            restore: { entries: item.restoreEntries },
          }),
        });
        if (!res.ok) throw new Error("failed");
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "cut_proposal" && it.id === proposalItemId
              ? { ...it, decision: "restored" }
              : it,
          ),
        );
        const n = item.restoreEntries.length;
        setToast(`${n} ${n === 1 ? "card" : "cards"} restored`);
      } catch {
        setToast("Couldn't restore — try again.");
      } finally {
        setBusyProposalId(null);
      }
    },
    [items, tripId],
  );

  // ── New-conversation request — open the inline confirm gate ───
  // If the thread is empty, there's nothing to start fresh from; do
  // nothing (the masthead action will also be hidden in that state).
  const requestNewConversation = useCallback(() => {
    if (items.length === 0) return;
    setShowNewConvGate(true);
  }, [items.length]);

  // ── Confirm new conversation — mint a fresh id, clear the thread,
  //    drop the items cache so a remount can't rehydrate the old one ─
  const confirmNewConversation = useCallback(() => {
    setShowNewConvGate(false);
    setItems([]);
    setPendingConvId(crypto.randomUUID());
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(cacheKey(tripId));
      } catch {
        // Degrade silently.
      }
    }
  }, [tripId]);

  const cancelNewConversation = useCallback(() => {
    setShowNewConvGate(false);
  }, []);

  return (
    <>
      {/* Entry — editorial pull between the day strip and the map.
          At md:+ when the panel is open we hide the pull: the panel sits in
          its own grid column with a header carrying the same affordance. */}
      <button
        type="button"
        onClick={openCompanion}
        aria-label="Open Roam Companion"
        className={`flex w-full items-center gap-3.5 px-6 py-2.5 ${open ? "md:hidden" : ""} ${entryClassName ?? ""}`}
      >
        <span className="h-px flex-1" style={{ background: RULE }} />
        <span className="flex items-center gap-2">
          <Compass size={14} weight="light" style={{ color: SIENNA }} />
          <span
            className="font-display text-[14px] italic"
            style={{ color: SIENNA, letterSpacing: "-0.005em" }}
          >
            Talk this journey through
          </span>
        </span>
        <span className="h-px flex-1" style={{ background: RULE }} />
      </button>

      {open && (
        <CompanionPanel
          items={items}
          loaded={loaded}
          streaming={streaming}
          streamingId={streamingId}
          busyProposalId={busyProposalId}
          input={input}
          onInput={setInput}
          onSend={send}
          onClose={() => setOpen(false)}
          onApprove={approve}
          onDiscard={discard}
          onApproveCut={approveCut}
          onRestore={restore}
          onApproveMove={approveMove}
          canStartNew={items.length > 0 && !streaming}
          newConvPending={showNewConvGate}
          onRequestNewConversation={requestNewConversation}
          onConfirmNewConversation={confirmNewConversation}
          onCancelNewConversation={cancelNewConversation}
          outerClassName={panelOuterClassName}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-[4px] px-5 py-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
          style={{
            background: INK,
            color: PARCHMENT,
            boxShadow: "0 12px 30px rgba(26,26,46,0.24)",
          }}
        >
          <span className="text-[13.5px]" style={{ letterSpacing: "-0.005em" }}>
            {toast}
          </span>
        </div>
      )}
    </>
  );
}
