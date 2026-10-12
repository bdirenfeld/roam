import type { Card, Place } from '@/types/database';
import { card, days, trip } from '@/app/dev/phone/fixtures';

// Demonstration data only. IDs cannot address any real journey or booking.
export const DEMO_ID = 'landing-sample';
export const DEMO_DAYS = days('2026-07-23', 5, DEMO_ID);
export const DEMO_TRIP = trip('2026-07-23', '2026-07-27', {
  id: DEMO_ID, title: 'New York', destination: 'New York, NY, USA',
  destination_lat: 40.724, destination_lng: -73.999, party_size: 2,
});
const photoBase = 'https://ejluvgjiqcwvqhzqpkrz.supabase.co/storage/v1/object/public/place-photos';
function makePlace(id: string, title: string, address: string, lat: number, lng: number, sub_type: string, photoId?: string): Place {
  return {
    id: `demo-${id}`, title, address, lat, lng,
    type: sub_type === 'restaurant' || sub_type === 'coffee' ? 'food' : 'activity',
    sub_type, google_place_id: `demo-${id}`, cover_image_url: null, rating: null,
    price_level: null, hours: null, loved: false, photo_count: photoId ? 1 : 0,
    ...(photoId ? { photo_t0: { url: `${photoBase}/${photoId}/0-thumb.jpg`, until: '2099-01-01T00:00:00Z' } } : {}),
  } as Place;
}
const definitions = [
  ['jack', 1, 'Jack’s Wife Freda', '226 Lafayette St, New York', 40.722, -73.998, 'restaurant', '08:30:00', '09:30:00', 'A relaxed breakfast in SoHo.'],
  ['museum', 1, 'Museum of Ice Cream', '558 Broadway, New York', 40.723, -73.997, 'guided', '10:30:00', '12:30:00', 'Arrive 10 minutes early. Bring your mobile ticket and photo ID.'],
  ['pearl', 1, 'Pearl & The Beast', '22 Howard St · basement, New York', 40.719, -74.001, 'guided', '13:30:00', '15:30:00', 'Find the basement entrance at 22 Howard Street.'],
  ['books', 1, 'McNally Jackson Books SoHo', '134 Prince St, New York', 40.725, -73.998, 'self_directed', '16:00:00', '17:00:00', 'Leave a little time to wander through the bookshop.'],
  ['parm', 1, 'Parm Mulberry Street', '248 Mulberry St, New York', 40.723, -73.996, 'restaurant', '18:00:00', '19:15:00', 'Dinner in NoLita.'],
  ['rubirosa', 0, 'Rubirosa', '235 Mulberry St, New York', 40.722, -73.996, 'restaurant', '18:00:00', '19:30:00', 'Know before you go\n- Order the vodka sauce pizza.\n- Arrive at your planned time.\n- A small, energetic room for a relaxed evening.'],
  ['leons', 2, 'Leon’s Bagels', '181 Mulberry St, New York', 40.7208784, -73.9968333, 'coffee', '08:00:00', '08:30:00', 'Breakfast before the museum.', '1edc0f8d-1c0a-4693-96d8-447d2bac9363'],
  ['amnh', 2, 'Museum of Natural History', '81st Street and Central Park West, New York', 40.7813241, -73.9739882, 'guided', '09:30:00', '12:30:00', 'Keep your ticket ready when you arrive.', 'be2a2da0-28a9-4f71-a5e3-e183526572db'],
  ['milk', 2, 'Milk Bar', '1196 Broadway, New York', 40.7458268, -73.9884392, 'guided', '14:00:00', '16:30:00', 'Leave time to get to the class.', 'be13030b-5100-4050-8e15-74e1a072b28f'],
  ['minetta', 2, 'Minetta Tavern', '113 MacDougal St, New York', 40.7299922, -74.0006201, 'restaurant', '17:30:00', '19:00:00', 'An evening in Greenwich Village.', 'f73eb299-1022-4f29-a710-2e61316419ec'],
] as const;
export const DEMO_CARDS: Card[] = definitions.map(([id, index, title, address, lat, lng, subtype, start, end, note, photoId], i) => {
  const p = makePlace(id, title, address, lat, lng, subtype, photoId);
  return card(`demo-${id}`, DEMO_DAYS[index].id, p, {
    trip_id: DEMO_ID, start_time: start, end_time: end, position: i,
    confirmed: subtype === 'guided',
    details: subtype === 'guided' ? { notes: `${note}\nIllustrative booking details for this demonstration.`, supplier: `${title} · sample booking`, meeting_point: `${address} · sample meeting point`, meeting_time: start.slice(0, 5), confirmation: `DEMO-${id.toUpperCase()}-24`, paid: true, cost_per_person: 45, includes: ['Admission for 2 adults · sample', 'Confirmation saved with this stop'] } as Card['details'] : { notes: `${note}\nSample practical note: keep payment and arrival details here.`, order_plan: subtype === 'coffee' ? 'Sample order: bagels and coffee for two.' : subtype === 'restaurant' ? 'Sample reservation: table for two · DEMO-DINNER.' : undefined } as Card['details'],
  });
});
const hotelPlace = { ...makePlace('hotel', 'Sample SoHo Hotel', '123 Sample Street, New York · demonstration address', 40.724, -73.999, 'hotel'), type: 'logistics' } as Place;
DEMO_CARDS.push(card('demo-hotel', DEMO_DAYS[0].id, hotelPlace, { trip_id: DEMO_ID, start_time: '15:00:00', end_time: '11:00:00', confirmed: true, details: { confirmation: 'DEMO-HOTEL-2048', check_out: '2026-07-27', notes: 'Sample confirmation\n4 nights · 2 adults · double room.\nPaid in advance. Keep photo ID ready at check-in.\nIllustrative booking; not a real hotel reservation.' } as Card['details'] }));
const flightPlace = { ...makePlace('flight', 'Sample flight · Toronto → New York', 'LaGuardia Airport, New York', 40.7769, -73.874, 'flight_arrival'), type: 'logistics' } as Place;
DEMO_CARDS.push(card('demo-flight', DEMO_DAYS[0].id, flightPlace, { trip_id: DEMO_ID, start_time: '11:00:00', end_time: '12:30:00', confirmed: true, details: { airline: 'Sample airline', flight_number: 'DEMO 204', origin_airport: 'YYZ · Toronto', destination_airport: 'LGA · New York', confirmation: 'DEMO-AIR-4821', seat: '12A, 12B · sample', notes: 'Sample confirmation\n2 travellers · cabin bag included.\nIllustrative flight and times; not an actual service or reservation.' } as Card['details'] }));
const returnPlace = { ...flightPlace, id: 'demo-flight-return', title: 'Sample flight · New York → Toronto', sub_type: 'flight_departure' } as Place;
DEMO_CARDS.push(card('demo-flight-return', DEMO_DAYS[4].id, returnPlace, { trip_id: DEMO_ID, start_time: '16:00:00', end_time: '17:30:00', confirmed: true, details: { airline: 'Sample airline', flight_number: 'DEMO 205', departure_airport: 'LGA · New York', arrival_airport: 'YYZ · Toronto', confirmation: 'DEMO-AIR-4821', notes: 'Sample return-flight confirmation · not a real flight.' } as Card['details'] }));
export const DEMO_SAVED = [card('demo-saved-park', '', makePlace('park', 'Sample Central Park walk', 'Central Park, New York', 40.771, -73.974, 'self_directed'), { trip_id: DEMO_ID }), card('demo-saved-gallery', '', makePlace('gallery', 'Sample gallery visit', 'SoHo, New York · sample', 40.724, -73.998, 'self_directed'), { trip_id: DEMO_ID })].map(c => ({ ...c, day_id: null, status: 'interested' } as unknown as Card));
export const DEMO_WEEK = DEMO_DAYS.map(d => ({ ...d, cards: DEMO_CARDS.filter(c => c.day_id === d.id) }));
export const DEMO_PLACES = [...DEMO_CARDS, ...DEMO_SAVED].map(c => {
  const photo = (c.place as Place & { photo_t0?: { url: string; until: string } }).photo_t0;
  return {
    ...c.place,
    id: c.place_id,
    photos: photo ? [{}] : [],
    photo_cache: photo ? { '0': { ...photo, url: photo.url.replace('0-thumb.jpg', '0.jpg') } } : {},
  };
});
