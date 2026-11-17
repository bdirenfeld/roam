/**
 * A cruise's ports of call (17 Nov 2026, Don's cruise; approved as one flow):
 * read from the confirmation, or typed under the cruise in "Your bookings".
 * Each becomes a Port card on its day (lib/cards/port): docks → all aboard.
 */

export interface CruisePort {
  date: string;
  port: string;
  arrive: string | null;
  depart: string | null;
}

export const MAX_PORTS = 40;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const AT_SEA = /\b(at sea|sea day|cruising|scenic cruising)\b/i;

const time = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  return h < 24 && mm < 60 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
};

/** The reader's ports, kept only well-formed: a date, a real port (not "At sea"), times as HH:MM; in date order. */
export function cleanPorts(raw: unknown): CruisePort[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CruisePort[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const date = typeof o.date === "string" && ISO.test(o.date.trim()) ? o.date.trim() : null;
    const port = typeof o.port === "string" ? o.port.trim() : "";
    if (!date || !port || AT_SEA.test(port)) continue;
    out.push({ date, port, arrive: time(o.arrive), depart: time(o.depart) });
    if (out.length >= MAX_PORTS) break;
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out.length ? out : null;
}

/** "Grundarfjörður, Iceland" → "Grundarfjörður": the card's name; the full text finds the place. */
export const portLabel = (port: string): string => port.split(",")[0].trim() || port.trim();

/** "+ Add a port": the day after the last port (or the boarding day), within the cruise, times blank. */
export function nextPort(ports: CruisePort[], boardDate: string, lastDate: string): CruisePort {
  const after = ports.length ? ports[ports.length - 1].date : boardDate;
  const d = new Date(after + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  const next = d.toISOString().slice(0, 10);
  return { date: lastDate && next > lastDate ? lastDate : next, port: "", arrive: null, depart: null };
}
