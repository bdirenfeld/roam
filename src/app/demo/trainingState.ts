import { newYorkCatalog } from './catalog';
import { DEMO_TRIP } from './fixtures';
import type { Tables } from './dataAdapter';
import type { Card, Day, Trip } from '@/types/database';

const KEY = 'roam-landing-practice-v2';
export const practiceDestinations = [
  { id: 'demo-city-ny', name: 'New York, NY, USA', lat: 40.724, lng: -73.999, places: [['Museum of Natural History', 40.7813, -73.974, 'Central Park West, New York'], ['Milk Bar', 40.7458, -73.9884, '1196 Broadway, New York'], ['Minetta Tavern', 40.73, -74.0006, '113 MacDougal St, New York']] },
  { id: 'demo-city-rome', name: 'Rome, Italy', lat: 41.9028, lng: 12.4964, places: [['Colosseum', 41.8902, 12.4922, 'Piazza del Colosseo, Rome'], ['Pantheon', 41.8986, 12.4769, 'Piazza della Rotonda, Rome'], ['Villa Borghese', 41.9142, 12.4921, 'Rome']] },
  { id: 'demo-city-london', name: 'London, UK', lat: 51.5074, lng: -.1278, places: [['British Museum', 51.5194, -.1269, 'Great Russell Street, London'], ['Tate Modern', 51.5076, -.0994, 'Bankside, London'], ['Hyde Park', 51.5073, -.1657, 'London']] },
  { id: 'demo-city-paris', name: 'Paris, France', lat: 48.8566, lng: 2.3522, places: [['Louvre Museum', 48.8606, 2.3376, 'Rue de Rivoli, Paris'], ['Musée d’Orsay', 48.86, 2.3266, 'Esplanade Valéry Giscard d’Estaing, Paris'], ['Luxembourg Gardens', 48.8462, 2.3372, 'Paris']] },
];
const cities = practiceDestinations;
type Row = Record<string, unknown>;
export function createTrainingState(reset = false, options?: { key?: string; tables?: Tables }) {
  const key = options?.key ?? KEY;
  let tables: Tables = options?.tables ? JSON.parse(JSON.stringify(options.tables)) : { trips: [], days: [], cards: [], places: [], people: [] };
  if (!reset) { try { const saved = sessionStorage.getItem(key); if (saved) tables = JSON.parse(saved); } catch { /* fresh practice */ } }
  const persist = () => sessionStorage.setItem(key, JSON.stringify(tables));
  const currentTrip = () => (tables.trips.at(-1) ?? DEMO_TRIP) as Trip;
  const currentCity = () => cities.find(c => c.name === currentTrip().destination) ?? cities[0];
  const catalog = () => {
    const city = currentCity();
    const groups = city.id === 'demo-city-ny' ? newYorkCatalog : { self_directed: city.places, guided: city.places.map(([name,lat,lng,address]) => [`${name} · sample guided visit`,lat,lng,address]) };
    return Object.entries(groups).flatMap(([kind, entries]) => entries.map(([name, lat, lng, address], index) => {
      const id = `demo-training-${city.id}-${kind}-${index}`;
      return { id, title: String(name), lat: Number(lat), lng: Number(lng), address: String(address), type: ['restaurant','coffee','dessert','bar'].includes(kind) ? 'food' : 'activity', sub_type: kind, google_place_id: id, cover_image_url: null, hours: null, rating: null, photo_count: 0, loved: false };
    }));
  };
  const searchable = () => [...tables.places as Row[], ...catalog()].filter((p, index, all) => all.findIndex(q => q.title === p.title) === index);
  const cards = () => (tables.cards as Row[]).map(c => ({ ...c, place: tables.places.find(p => (p as Row).id === c.place_id) ?? null })) as unknown as Card[];
  const notify = () => window.parent.postMessage({ type: 'roam-practice-state', count: new Set(cards().filter(c => c.place_id).map(c => c.place_id)).size, planned: cards().filter(c => c.day_id && c.place_id).length }, location.origin);
  const onWrite = (table: string, op: string, payload: unknown, filters: Array<{ column: string; value: unknown }>) => {
    const rows = tables[table] ?? (tables[table] = []);
    const match = (row: unknown) => filters.every(f => Array.isArray(f.value) ? f.value.includes((row as Row)[f.column]) : (row as Row)[f.column] === f.value);
    if (op === 'insert' || op === 'upsert') {
      for (const row of (Array.isArray(payload) ? payload : [payload]) as Row[]) {
        if (table === 'trips') row.id = 'landing-practice';
        if ('trip_id' in row) row.trip_id = currentTrip().id;
        if (!row.id) {
          const samePlace = table === 'places' && row.google_place_id ? rows.find(r => (r as Row).google_place_id === row.google_place_id) as Row | undefined : undefined;
          row.id = samePlace?.id ?? `demo-local-${crypto.randomUUID()}`;
        }
        if (table === 'cards') row.place = tables.places.find(p => (p as Row).id === row.place_id) ?? null;
        const existing = rows.find(r => (r as Row).id === row.id);
        if (existing && op === 'upsert') Object.assign(existing, row); else if (!existing) rows.push(row);
      }
    } else if (op === 'update') rows.filter(match).forEach(r => Object.assign(r as Row, payload));
    else if (op === 'delete') tables[table] = rows.filter(r => !match(r));
    persist(); notify();
  };
  const respond = async (url: URL, init?: RequestInit) => {
    const body: Row = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    if (url.pathname === '/api/places/autocomplete') {
      const input = (url.searchParams.get('input') ?? '').toLowerCase();
      const regions = url.searchParams.get('types') === '(regions)';
      const choices: Row[] = regions ? cities.map(c => ({ id: c.id, title: c.name })) : searchable();
      return { predictions: choices.filter(c => String(c.title).toLowerCase().includes(input)).map(c => ({ place_id: c.google_place_id ?? c.id, description: c.title, structured_formatting: { main_text: c.title, secondary_text: regions ? 'Practice destination' : currentCity().name } })) };
    }
    if (url.pathname === '/api/places/details') {
      const id = url.searchParams.get('place_id');
      const city = cities.find(c => c.id === id); const p = searchable().find(c => c.id === id || c.google_place_id === id);
      return { result: { name: city?.name ?? p?.title, formatted_address: city?.name ?? p?.address, geometry: { location: { lat: city?.lat ?? p?.lat, lng: city?.lng ?? p?.lng } }, types: ['museum'], photos: [] } };
    }
    if (url.pathname === '/api/find') {
      if (body.mode === 'travellers') return { results: [] };
      const ask = typeof body.ask === 'string' ? body.ask.toLowerCase().trim() : '';
      const kind = typeof body.subType === 'string' ? body.subType : 'self_directed';
      return { results: catalog().filter(p => p.sub_type === kind && (!ask || p.title.toLowerCase().includes(ask))).map(p => ({ placeId: p.id, name: p.title, address: p.address, lat: p.lat, lng: p.lng, types: p.type === 'food' ? ['restaurant'] : ['museum'], from: 'google', why: 'Real location · sample suggestion; availability is not checked.' })) };
    }
    if (url.pathname === '/api/places/bulk-import') {
      const ids = body.google_place_ids as string[] ?? [];
      const imported = catalog().filter(p => ids.includes(p.id));
      for (const p of imported) if (!tables.places.some(r => (r as Row).id === p.id)) tables.places.push(p);
      persist(); return { imported: imported.map(p => ({ place_id: p.id, title: p.title, created: true })) };
    }
    if (url.pathname === '/api/plan/notes') return { written: 0 };
    if (url.pathname === '/api/plan/getting-there') return { created: [] };
    if (url.pathname === '/api/trips/fetch-cover') return { sample: true };
    return undefined;
  };
  persist();
  return { tables, currentTrip, cards, days: () => tables.days as Day[], onWrite, respond, notify };
}
