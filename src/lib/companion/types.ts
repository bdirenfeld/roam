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

// ── /api/assistant streaming wire format ──────────────────────
// The POST turn handler streams newline-delimited JSON; each line is
// one of these events.
export type AssistantStreamEvent =
  | { type: "text"; delta: string }
  | { type: "proposal"; proposal: AddProposal }
  | { type: "error"; message: string }
  | { type: "done" };
