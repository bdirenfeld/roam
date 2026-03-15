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
  cover_image_url: string | null
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
  airline?: string
  arrival_airport?: string
  arrival_time?: string
  departure_airport?: string
  departure_time?: string
  transport_to_accommodation?: string
  estimated_accommodation_arrival?: string
  leave_accommodation_time?: string
  arrive_airport_time?: string
}

export interface ActivityDetails {
  supplier?: string
  cost_per_person?: number
  currency?: string
  card_used?: string
  meeting_point?: string
  meeting_time?: string
  refundable?: boolean
  cancellation_deadline?: string
  prep?: string
  flow?: FlowStep[]
  post?: string
  duration_minutes?: number
  treatment_type?: string
  ai_enriched?: AiEnriched
}

export interface FoodDetails {
  reservation_status?: 'walk-in' | 'reserved' | 'booked'
  reservation_time?: string
  ai_enriched?: AiEnriched
}

export type CardDetails = LogisticsDetails & ActivityDetails & FoodDetails & Record<string, unknown>

export interface Card {
  id: string
  day_id: string
  trip_id: string
  type: CardType
  sub_type: string | null
  title: string
  start_time: string | null
  end_time: string | null
  position: number
  status: CardStatus
  source_url: string | null
  cover_image_url: string | null
  lat: number | null
  lng: number | null
  address: string | null
  details: CardDetails
  ai_generated: boolean
  created_at: string
}

// View models — days with their cards
export interface DayWithCards extends Day {
  cards: Card[]
}

export interface TripWithDays extends Trip {
  days: DayWithCards[]
}
