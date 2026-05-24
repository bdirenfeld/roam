// ============================================================
// Roam — Companion shared types
// Used by both the /api/assistant route and the client chat UI.
// ============================================================

export type CompanionRole = "user" | "assistant";

// A persisted conversation turn — mirrors a `companion_messages` row.
export interface CompanionMessage {
  id: string;
  role: CompanionRole;
  content: string;
  created_at: string;
}

// Icon keys the model may choose for a proposed place. Cosmetic only —
// these are editorial labels, never place data, so the model picking one
// fabricates nothing. The client maps each key to a Phosphor icon.
export type ProposalIcon =
  | "coffee"
  | "fork"
  | "dessert"
  | "bar"
  | "shop"
  | "flag"
  | "bed"
  | "pin";

// One place the model wants to add, AFTER the route has resolved the
// model's free-text query to a verified Google place. The model never
// supplies google_place_id / name / meta — those come from Google.
export interface ResolvedPlace {
  google_place_id: string; // verified by the Places resolution path
  name: string; // Google's name for the place
  meta: string; // Google's locality line (neighbourhood / city)
  kind: string; // the model's editorial label, e.g. "Breakfast"
  icon: ProposalIcon; // the model's icon choice (cosmetic)
}

// The proposal handed to the confirm gate. Nothing here has been written.
export interface AddProposal {
  heading: string; // Playfair-italic lede in the card header
  lede?: string; // optional supporting line, in Roam's voice
  places: ResolvedPlace[];
}

// ── Cut proposal ───────────────────────────────────────────────
// One card the companion is about to soft-delete (status → 'cut').
// Resolved server-side from the model's card_id — title and meta come
// from the live DB join, never from the model.
export interface CutCardSummary {
  card_id: string;
  title: string;
  meta: string; // e.g., "Day 3 · 09:00", "Day 3", or "Unscheduled"
}

export interface CutProposal {
  heading: string;
  lede?: string;
  // Reason is OPTIONAL and present only if the traveller gave one in
  // conversation. The route forwards the model's reason verbatim — the
  // system prompt forbids the model from inventing one.
  reason?: string;
  cards: CutCardSummary[];
}

// One entry sent back on Restore — captured at cut time so a card cut
// from 'in_itinerary' restores to 'in_itinerary', not silently to the
// holding pile.
export interface RestoreEntry {
  card_id: string;
  prior_status: string;
}

// ── /api/assistant streaming wire format ──────────────────────
// The POST turn handler streams newline-delimited JSON; each line is
// one of these events.
export type AssistantStreamEvent =
  | { type: "text"; delta: string }
  | { type: "proposal"; proposal: AddProposal }
  | { type: "cut_proposal"; proposal: CutProposal }
  | { type: "error"; message: string }
  | { type: "done" };
