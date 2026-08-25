// The sample journey a brand-new user can create with one tap ("Try a sample
// trip" on the empty Journeys page). Layout only — the matching enriched
// place rows live in places.json (snapshotted from a real bulk-import, so
// every card gets a photo, pin, hours and rating). Keyed by google_place_id.

export const SAMPLE_TITLE = "Sample trip — look around";
export const SAMPLE_DESTINATION = {
  name: "Lisbon, Portugal",
  lat: 38.7222524,
  lng: -9.1393366,
};

// A stable Lisbon cover (same Unsplash source the app's cover fetch uses).
export const SAMPLE_COVER =
  "https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=1080&q=80&fm=jpg&fit=crop";

export interface SampleCard {
  googlePlaceId: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

// One entry per day, in order. Cards are in position order.
export const SAMPLE_DAYS: SampleCard[][] = [
  // Day 1 — Alfama
  [
    {
      googlePlaceId: "ChIJh_wV6nY0GQ0R4zelsyqGUxc", // Memmo Alfama Hotel
      startTime: "15:00",
      notes: "Check-in from 3pm. They'll hold your bags if you land earlier.",
    },
    {
      googlePlaceId: "ChIJm8MOtHc0GQ0R1zPkmUFwwLQ", // Castelo de São Jorge
      startTime: "16:00",
      endTime: "17:30",
      notes: "Go late afternoon — the light over the city is the show.",
    },
    {
      googlePlaceId: "ChIJx-Rwl4QzGQ0RaSfN7SE7IEE", // Miradouro de Santa Luzia
      startTime: "17:45",
      notes: "Two minutes downhill from the castle. Tiles, bougainvillea, the river.",
    },
    {
      googlePlaceId: "ChIJ-R6VlIUzGQ0RX8x1jtg9lh0", // Cervejaria Ramiro
      startTime: "19:30",
      notes: "Garlic prawns, then a prego to finish. Expect a short line — it moves.",
    },
  ],
  // Day 2 — Belém
  [
    {
      googlePlaceId: "ChIJW3H9LkXLHg0RZZZttMb27_8", // Pastéis de Belém
      startTime: "09:00",
      notes: "Order at the counter inside — faster than the takeaway line.",
    },
    {
      googlePlaceId: "ChIJS5zCw0LLHg0R7euWjjRddYc", // Jerónimos Monastery
      startTime: "10:00",
      endTime: "12:00",
      notes: "Buy tickets online the night before.",
    },
    {
      googlePlaceId: "ChIJS5zCw0LLHg0RP1FSz63cAjA", // Belém Tower
      startTime: "12:15",
      notes: "The outside is the postcard — a walk around it is enough.",
    },
    {
      googlePlaceId: "ChIJ5dveYa80GQ0RrEP1FKqq6zM", // LX Factory
      startTime: "15:00",
      notes: "Old factory row turned shops and cafés. Good for a slow afternoon.",
    },
    {
      googlePlaceId: "ChIJdWBeWYc0GQ0RktxySU7hjxM", // Time Out Market
      startTime: "19:00",
      notes: "Forty stalls under one roof — everyone picks their own dinner.",
    },
  ],
  // Day 3 — Baixa & Chiado
  [
    {
      googlePlaceId: "ChIJM9Q0OYEzGQ0R_mfBu1Aml5U", // Fábrica Coffee Roasters
      startTime: "09:30",
      notes: "The flat white is the move.",
    },
    {
      googlePlaceId: "ChIJL42Kt3g0GQ0RfGlw4GJ8FOE", // Santa Justa Lift
      startTime: "10:30",
      notes: "Skip the line for the lift — walk up behind it for the same view, free.",
    },
    {
      googlePlaceId: "ChIJY0ulMHo0GQ0RROAoa18vUzA", // Praça do Comércio
      startTime: "11:30",
      notes: "Lisbon's front door on the river. End here and wander.",
    },
  ],
];

// Saved-to-map ideas that are deliberately NOT scheduled — so the sample also
// shows the hollow-pin "idea" state and the Add-from-saved flow.
export const SAMPLE_INTERESTED: SampleCard[] = [
  {
    googlePlaceId: "ChIJCVgOdYMxGQ0RMOFiOmcuP5g", // Oceanário de Lisboa
    notes: "The rainy-day card. One of the best aquariums in Europe.",
  },
  {
    googlePlaceId: "ChIJsduI79bKHg0RN9hrcvHyELg", // Ponto Final
    notes: "Lunch across the river — take the ferry to Cacilhas and walk ten minutes.",
  },
];
