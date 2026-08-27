// ============================================================
// Roam — Database Types
// ============================================================

export type CardType = 'logistics' | 'activity' | 'food'
export type CardStatus = 'interested' | 'on_map' | 'in_itinerary' | 'cut'
export type TripStatus = 'planning' | 'active' | 'completed'
export type NarrativePosition = 'intro' | 'rising' | 'climax' | 'denouement' | 'departure'

export interface User {
  id: string
  name: string | null
  email: string
  home_airport: string | null
  home_country: string | null
  passport_country: string | null
  avatar_url: string | null
  created_at: string
}

export interface Trip {
  id: string
  user_id: string
  title: string
  destination: string
  destination_lat: number | null
  destination_lng: number | null
  start_date: string
  end_date: string
  trip_purpose: string | null
  trip_type: string | null
  party_size: number
  party_ages: number[] | null
  accommodation_name: string | null
  accommodation_address: string | null
  status: TripStatus
  archived: boolean
  archived_at: string | null
  cover_image_url: string | null
  kanban_background_url: string | null
  // Journey notes — one markdown-ish string ('## ' section, '- [ ] ' task,
  // anything else a plain line). Rendered by components/trip/JourneyNotes.
  notes: string | null
  created_at: string
}

export interface Day {
  id: string
  trip_id: string
  date: string
  day_number: number
  day_name: string | null
  narrative_position: string | null
  theme: string | null
  created_at: string
}

// Card detail shapes per sub_type
export interface FlowStep {
  time: string
  segment: string
  notes: string
}

export interface AiEnriched {
  energy_level?: 'low' | 'medium' | 'high'
  tips?: string[]
  must_order?: string[]
  about?: string
  cuisine?: string
  signature_dishes?: string[]
  weather_dependent?: boolean
}

export interface LogisticsDetails {
  notes?: string
  airline?: string
  arrival_airport?: string
  arrival_time?: string
  flight_number?: string
  terminal?: string
  confirmation?: string
  departure_airport?: string
  departure_time?: string
  transport_to_accommodation?: string
  estimated_accommodation_arrival?: string
  leave_accommodation_time?: string
  arrive_airport_time?: string
}

export interface ActivityDetails {
  notes?: string
  supplier?: string
  cost_per_person?: number
  currency?: string
  card_used?: string
  meeting_point?: string
  meeting_time?: string
  website?: string
  confirmation?: string
  refundable?: boolean
  cancellation_deadline?: string
  prep?: string
  flow?: FlowStep[] | string[]
  tips?: string[]
  includes?: string[]
  post?: string
  duration_minutes?: number
  treatment_type?: string
  ai_enriched?: AiEnriched
}

export interface FoodDetails {
  notes?: string
  cuisine?: string
  reservation?: string
  website?: string
  estimated_cost?: string
  order_plan?: string | string[]
  cost?: string
  energy?: string
  primary?: string
  alternative?: string
  flow?: string[]
  reservation_status?: 'walk-in' | 'reserved' | 'booked'
  reservation_time?: string
  ai_enriched?: AiEnriched
  place_id?: string
  price_level?: number
  currency_code?: string
}

// ── Card checklist ──────────────────────────────────────────
// A Trello checklist living on ONE card: "AirBnB Checklist 0/11", "Packing
// List". Stored in the card's existing `details` jsonb under `checklist`, so
// there is no table and no migration — the array IS the checklist, and its
// order is the display order. Rendered by components/cards/CardChecklist; the
// x/y badge on every card face reads the same array.
export interface ChecklistItem {
  /** Stable for the life of the item — React keys, dnd-kit ids, jsonb rows. */
  id: string
  text: string
  done: boolean
}

export interface ChecklistDetails {
  checklist?: ChecklistItem[]
}

export type CardDetails = LogisticsDetails & ActivityDetails & FoodDetails & ChecklistDetails & Record<string, unknown>

export interface Place {
  id: string
  title: string
  type: CardType
  sub_type: string | null
  lat: number | null
  lng: number | null
  address: string | null
  google_place_id: string | null
  cover_image_url: string | null
  rating: number | null
  price_level: number | null
  // World facts persisted on the place; embedded in card+place projections.
  // Optional so existing Place literals (e.g. AddToTripSheet) need no change.
  website?: string | null
  phone?: string | null
  hours?: unknown
  // "We loved this" — set by hand, one traveller's own verdict. The one review
  // in the app that isn't performative, so it sorts and filters rather than
  // decorates. Optional for the same reason as the fields above.
  loved?: boolean
  loved_at?: string | null
}

// ── Board lists ─────────────────────────────────────────────
// public.trip_lists — a column on the Plan board that is not a day. The
// traveller names it themselves ("Research", "Prep", "Ideas"); the app never
// invents one and never ships a fixed set. Membership is `cards.list_id`, so a
// card is on exactly one list or none, and `position` is the list's
// left-to-right order on the board, ahead of Day 1.
export interface TripList {
  id: string
  trip_id: string
  title: string
  position: number
  created_at: string
}

export interface Card {
  id: string
  day_id: string
  trip_id: string
  /**
   * The board list this card sits on, or null. Mutually exclusive with a day
   * in practice: scheduling a list card clears it, and parking a scheduled
   * card clears `day_id`. `position` is read within whichever of the two the
   * card belongs to. ON DELETE SET NULL — deleting a list keeps its cards.
   */
  list_id: string | null
  start_time: string | null
  end_time: string | null
  position: number
  status: CardStatus
  source_url: string | null
  details: CardDetails
  ai_generated: boolean
  confirmed: boolean
  created_at: string
  place_id: string | null
  place?: Place | null
  /**
   * How many files are attached to this card. NOT a column — the server pages
   * that feed the Plan board and the day view embed `card_attachments(id)` and
   * count the rows, so a card face can show Trello's paperclip without a second
   * query. Absent means "nobody counted", which renders as no badge.
   */
  attachment_count?: number
}

// View models — days with their cards
export interface DayWithCards extends Day {
  cards: Card[]
}

/** The same view model for a named list: its cards, in `position` order. */
export interface ListWithCards extends TripList {
  cards: Card[]
}

export interface Document {
  id:            string;
  trip_id:       string;
  file_name:     string;
  file_type:     string;
  document_type: string;
  parsed_data:   unknown[];
  card_ids:      string[];
  created_at:    string;
}

export interface TripWithDays extends Trip {
  days: DayWithCards[]
}

// ── "Your year" planning tables ─────────────────────────────
// Both are RLS own-row and read/written from components/trips/YearView.

/** public.travel_windows — the user's own "ideal times to travel". */
export interface TravelWindow {
  id: string
  user_id: string
  label: string | null
  start_date: string
  end_date: string
  created_at: string
}

/** public.wishlist_destinations — places whose weather the user tracks.
 *  `climate` holds a 12-element monthly profile (month-0 indexed) of
 *  { high, rainShare, precipMm, feelsMax, sunFrac, windMax, hci }; the parsed
 *  shape lives with the scoring code in lib/yearView, so it stays `unknown`
 *  here rather than importing view types into the schema file. */
export interface WishlistDestination {
  id: string
  user_id: string
  name: string
  location: string | null
  lat: number | null
  lng: number | null
  drive_hours: number | null
  budget: string | null
  best_time: string | null
  why: string | null
  source: string
  climate: unknown
  created_at: string
}

export type AttachmentParseStatus = 'parsing' | 'parsed' | 'failed' | 'skipped'

export interface CardAttachment {
  id:           string;
  card_id:      string;
  trip_id:      string;
  file_name:    string;
  file_type:    string;
  file_url:     string;
  file_path:    string | null;
  file_size:    number;
  parsed_data:  Record<string, unknown> | null;
  parse_status: AttachmentParseStatus;
  created_at:   string;
}
