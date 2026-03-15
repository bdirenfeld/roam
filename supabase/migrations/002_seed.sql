-- ============================================================
-- Roam — Seed Data
-- Migration 002: Rome April 2026 trip
-- ============================================================
-- NOTE: This seed uses a placeholder user_id.
-- The migration script will substitute the real user ID at runtime.
-- Placeholder: __USER_ID__

do $$
declare
  v_user_id   uuid := '__USER_ID__'::uuid;
  v_trip_id   uuid;
  v_day1_id   uuid;
  v_day2_id   uuid;
  v_day3_id   uuid;
  v_day4_id   uuid;
  v_day5_id   uuid;
  v_day6_id   uuid;
  v_day7_id   uuid;
begin

  -- --------------------------------------------------------
  -- TRIP
  -- --------------------------------------------------------
  insert into public.trips (
    user_id, title, destination, destination_lat, destination_lng,
    start_date, end_date, trip_purpose, trip_type,
    party_size, party_ages, accommodation_name, status
  ) values (
    v_user_id,
    'Rome April 2026',
    'Rome, Italy',
    41.9028, 12.4964,
    '2026-04-22', '2026-04-28',
    'Solo cultural immersion — food, wandering, one Michelin dinner',
    'city',
    1, ARRAY[38],
    'Banco 19 B&B',
    'planning'
  )
  returning id into v_trip_id;

  -- --------------------------------------------------------
  -- DAYS
  -- --------------------------------------------------------
  insert into public.days (trip_id, date, day_number, day_name, narrative_position)
  values (v_trip_id, '2026-04-22', 1, 'Wednesday', 'intro')
  returning id into v_day1_id;

  insert into public.days (trip_id, date, day_number, day_name, narrative_position)
  values (v_trip_id, '2026-04-23', 2, 'Thursday', 'rising')
  returning id into v_day2_id;

  insert into public.days (trip_id, date, day_number, day_name, narrative_position)
  values (v_trip_id, '2026-04-24', 3, 'Friday', 'rising')
  returning id into v_day3_id;

  insert into public.days (trip_id, date, day_number, day_name, narrative_position)
  values (v_trip_id, '2026-04-25', 4, 'Saturday', 'rising')
  returning id into v_day4_id;

  insert into public.days (trip_id, date, day_number, day_name, narrative_position)
  values (v_trip_id, '2026-04-26', 5, 'Sunday', 'climax')
  returning id into v_day5_id;

  insert into public.days (trip_id, date, day_number, day_name, narrative_position)
  values (v_trip_id, '2026-04-27', 6, 'Monday', 'denouement')
  returning id into v_day6_id;

  insert into public.days (trip_id, date, day_number, day_name, narrative_position)
  values (v_trip_id, '2026-04-28', 7, 'Tuesday', 'departure')
  returning id into v_day7_id;

  -- --------------------------------------------------------
  -- DAY 1 — Wednesday Apr 22
  -- --------------------------------------------------------
  insert into public.cards (day_id, trip_id, type, sub_type, title, start_time, position, status, details) values
  (v_day1_id, v_trip_id, 'logistics', 'flight_arrival', 'Flight to Rome', '10:20', 1, 'in_itinerary',
   '{
     "airline": "Air Canada",
     "arrival_airport": "FCO",
     "arrival_time": "10:20",
     "transport_to_accommodation": "Taxi ~45 min",
     "estimated_accommodation_arrival": "12:00"
   }'::jsonb),

  (v_day1_id, v_trip_id, 'activity', 'self_directed', 'Afternoon Wandering', '13:00', 2, 'in_itinerary',
   '{
     "prep": "Drop bags, quick refresh",
     "flow": [
       {"time": "13:00", "segment": "Leave hotel", "notes": ""},
       {"time": "13:30", "segment": "Pantheon exterior", "notes": ""},
       {"time": "14:30", "segment": "Piazza Navona", "notes": ""},
       {"time": "15:30", "segment": "Wander back", "notes": ""}
     ],
     "post": "Rest before dinner",
     "lat": 41.8986,
     "lng": 12.4768,
     "ai_enriched": {
       "energy_level": "low",
       "tips": ["Walk slow", "No phone scrolling", "Let the city land"]
     }
   }'::jsonb),

  (v_day1_id, v_trip_id, 'food', 'restaurant', 'Dinner — Arrival Night', '20:00', 3, 'in_itinerary',
   '{
     "reservation_status": "walk-in",
     "lat": 41.8986,
     "lng": 12.4768,
     "ai_enriched": {
       "about": "Iconic Rome at night",
       "tips": ["Pantheon lit up after 10pm", "Walk slow after dinner"]
     }
   }'::jsonb);

  -- --------------------------------------------------------
  -- DAY 2 — Thursday Apr 23
  -- --------------------------------------------------------
  insert into public.cards (day_id, trip_id, type, sub_type, title, start_time, end_time, position, status, lat, lng, details) values
  (v_day2_id, v_trip_id, 'food', 'coffee_dessert', 'Morning Coffee', '07:00', '08:30', 1, 'in_itinerary',
   41.8986, 12.4768,
   '{
     "ai_enriched": {
       "must_order": ["Espresso", "Cornetto"],
       "tips": ["Stand at the bar", "Sant Eustachio is 8 min walk"]
     }
   }'::jsonb),

  (v_day2_id, v_trip_id, 'activity', 'hosted', 'Vatican Museums + Sistine Chapel', '09:00', '12:30', 2, 'in_itinerary',
   41.9065, 12.4536,
   '{
     "supplier": "City Wonders",
     "cost_per_person": 135.65,
     "currency": "CAD",
     "card_used": "Visa 6002",
     "meeting_point": "100 Viale Vaticano",
     "meeting_time": "07:45",
     "refundable": false,
     "prep": "Arrive 7:45am, look for blue jacket guide",
     "flow": [
       {"time": "09:00", "segment": "Vatican Museums", "notes": "Skip-the-line entry"},
       {"time": "10:30", "segment": "Sistine Chapel", "notes": ""},
       {"time": "11:30", "segment": "St Peter'\''s Basilica", "notes": "Subject to closure"}
     ],
     "post": "Lunch near Vatican",
     "ai_enriched": {
       "energy_level": "medium",
       "tips": ["Shoulders and knees covered", "Arrive 15 mins early"]
     }
   }'::jsonb),

  (v_day2_id, v_trip_id, 'activity', 'self_directed', 'Afternoon Wandering', '13:00', '16:30', 3, 'in_itinerary',
   null, null,
   '{"ai_enriched": {"energy_level": "low"}}'::jsonb),

  (v_day2_id, v_trip_id, 'food', 'drinks', 'Aperitivo', '17:00', '20:00', 4, 'in_itinerary',
   null, null,
   '{
     "ai_enriched": {
       "tips": ["One drink only", "Light snack"]
     }
   }'::jsonb),

  (v_day2_id, v_trip_id, 'food', 'restaurant', 'Dinner', '20:00', '22:30', 5, 'in_itinerary',
   null, null,
   '{"reservation_status": "walk-in"}'::jsonb);

  -- --------------------------------------------------------
  -- DAY 4 — Saturday Apr 25
  -- --------------------------------------------------------
  insert into public.cards (day_id, trip_id, type, sub_type, title, start_time, end_time, position, status, lat, lng, details) values
  (v_day4_id, v_trip_id, 'food', 'coffee_dessert', 'Morning Coffee', '07:00', '08:30', 1, 'in_itinerary',
   null, null, '{}'::jsonb),

  (v_day4_id, v_trip_id, 'activity', 'self_directed', 'Villa Borghese', '08:00', '12:30', 2, 'in_itinerary',
   41.9138, 12.4922,
   '{
     "prep": "Comfortable shoes, coffee first, no tickets needed",
     "flow": [
       {"time": "09:00", "segment": "Enter park + casual walk", "notes": "No strict route"},
       {"time": "09:45", "segment": "Pincian Terrace Overlook", "notes": "Views over Piazza del Popolo"},
       {"time": "10:15", "segment": "Optional coffee or bike rental", "notes": ""}
     ],
     "post": "Leave refreshed, not tired",
     "ai_enriched": {
       "energy_level": "low",
       "tips": [
         "Don'\''t over-structure",
         "Arrive early to avoid tour groups",
         "This is your no-agenda Rome moment"
       ],
       "weather_dependent": false
     }
   }'::jsonb),

  (v_day4_id, v_trip_id, 'activity', 'hosted', 'Pastry & Tiramisu Class', '17:30', '19:00', 3, 'in_itinerary',
   41.8765, 12.4823,
   '{
     "supplier": "Vice Cooking Class",
     "cost_per_person": 79,
     "currency": "EUR",
     "meeting_point": "Via Soriso 68/A",
     "meeting_time": "17:20",
     "refundable": true,
     "cancellation_deadline": "48 hours prior",
     "flow": [
       {"time": "17:30", "segment": "Tiramisu", "notes": "Made first to set"},
       {"time": "18:15", "segment": "Pastry making", "notes": ""},
       {"time": "19:00", "segment": "Taste + photos", "notes": ""}
     ],
     "post": "Taxi to Monti for dinner at Ai Tre Scalini"
   }'::jsonb),

  (v_day4_id, v_trip_id, 'food', 'restaurant', 'Dinner — Ai Tre Scalini', '20:00', '22:00', 4, 'in_itinerary',
   41.8954, 12.5024,
   '{
     "reservation_status": "walk-in",
     "ai_enriched": {
       "cuisine": "Roman",
       "tips": ["No reservations — arrive early"]
     }
   }'::jsonb);

  -- --------------------------------------------------------
  -- DAY 6 — Monday Apr 27
  -- --------------------------------------------------------
  insert into public.cards (day_id, trip_id, type, sub_type, title, start_time, end_time, position, status, lat, lng, details) values
  (v_day6_id, v_trip_id, 'food', 'coffee_dessert', 'Morning Coffee', '07:00', '08:30', 1, 'in_itinerary',
   null, null, '{}'::jsonb),

  (v_day6_id, v_trip_id, 'activity', 'wellness', 'Reflexology', '09:30', '11:30', 2, 'in_itinerary',
   41.9012, 12.4756,
   '{
     "supplier": "Rung Arun Thai Massage",
     "duration_minutes": 90,
     "treatment_type": "Reflexology + light back and shoulders",
     "prep": "Arrive 10 min early, phones away, hydrate",
     "post": "Stand-up espresso nearby, no scrolling"
   }'::jsonb),

  (v_day6_id, v_trip_id, 'activity', 'self_directed', 'Campo → Coronari → Ponte Sisto', '13:00', '16:30', 3, 'in_itinerary',
   null, null,
   '{
     "flow": [
       {"time": "13:00", "segment": "Campo de Fiori", "notes": "30-45 min max"},
       {"time": "14:00", "segment": "Via dei Coronari", "notes": "Antique shops, slow browsing"},
       {"time": "15:15", "segment": "Ponte Sisto", "notes": "Pause mid-bridge"},
       {"time": "16:00", "segment": "Drift back toward Navona", "notes": ""}
     ],
     "ai_enriched": {
       "energy_level": "low",
       "tips": ["Stay geographically tight", "Elegant-but-cool Rome"]
     }
   }'::jsonb),

  (v_day6_id, v_trip_id, 'food', 'drinks', 'Aperitivo — Coronari', '17:00', '20:00', 4, 'in_itinerary',
   null, null, '{}'::jsonb),

  (v_day6_id, v_trip_id, 'food', 'restaurant', 'Dinner — Pierluigi', '20:00', '22:15', 5, 'in_itinerary',
   41.8954, 12.4712,
   '{
     "reservation_status": "reserved",
     "reservation_time": "20:00",
     "ai_enriched": {
       "cuisine": "Seafood",
       "signature_dishes": ["Seafood antipasto", "Spaghetti vongole", "Grilled fish"],
       "tips": ["Last dinner — take your time", "Short night walk after"]
     }
   }'::jsonb);

  -- --------------------------------------------------------
  -- DAY 7 — Tuesday Apr 28
  -- --------------------------------------------------------
  insert into public.cards (day_id, trip_id, type, sub_type, title, start_time, position, status, details) values
  (v_day7_id, v_trip_id, 'food', 'coffee_dessert', 'Morning Coffee', '07:00', 1, 'in_itinerary',
   '{}'::jsonb),

  (v_day7_id, v_trip_id, 'logistics', 'flight_departure', 'Flight to Toronto', '12:25', 2, 'in_itinerary',
   '{
     "airline": "Air Canada",
     "departure_airport": "FCO",
     "departure_time": "12:25",
     "leave_accommodation_time": "09:00",
     "arrive_airport_time": "10:00"
   }'::jsonb);

end $$;
