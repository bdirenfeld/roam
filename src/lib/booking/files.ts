/**
 * Uploads inside their Bookings row (6 Oct 2026 redesign, mock approved).
 *
 * Bookings used to list the files under a separate "Uploaded" label, away from
 * the Flights / Stays / Car rows they belong to. Now each file sits in its row:
 * a flight confirmation in Flights, a hotel's in Stays, a car's in Car. What
 * matches no row (a museum ticket on a card) is an "Other files" link.
 *
 * Two stores feed it (see DocumentsSheet): `card_attachments`, a real file on
 * a card that opens in the viewer, and `documents`, the record an upload
 * through Bookings leaves — it names the booking but holds no file.
 */

import { isRentalCar } from "@/lib/bookings/summary";
import type { CheckRow, RowKey } from "./checklist";

export interface BookingFile {
  id: string;
  source: "attachment" | "document";
  fileName: string;
  /** A signed URL for an attachment; null for a document record (no file kept). */
  url: string | null;
  type: string | null;
  /** The row it belongs to, or null for Other files. */
  row: RowKey | null;
  /** The booking's own name: "Air Canada", "Villa Zambaldi", "Hertz". */
  label: string | null;
  /** "on Uffizi Gallery" for an attachment; the kind for a document. */
  detail: string;
  createdAt: string;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The row a card's file belongs to: its flight, hotel or rental car. */
export function rowForCard(card: { details?: Record<string, unknown> | null; place?: { sub_type?: string | null } | null } | null | undefined): RowKey | null {
  if (!card) return null;
  const sub = card.place?.sub_type ?? "";
  if (sub === "flight_arrival" || sub === "flight_departure") return "flights";
  if (isRentalCar(card)) return "car";
  if (sub === "hotel") return "stays";
  return null;
}

/** The row an upload record belongs to, by the kind the reader gave it. */
export function rowForDocument(documentType: string | null | undefined): RowKey | null {
  if (documentType === "flight" || documentType === "flight_arrival" || documentType === "flight_departure") return "flights";
  if (documentType === "hotel") return "stays";
  if (documentType === "car_rental") return "car";
  return null;
}

/** The airline, else the place (hotel, car company), else the card's title. */
export function cardLabel(card: { details?: Record<string, unknown> | null; place?: { title?: string | null } | null } | null | undefined): string | null {
  return str(card?.details?.airline) ?? str(card?.place?.title) ?? str(card?.details?.title);
}

/** The first booking an upload read: its airline, else its title. */
export function documentLabel(parsed: unknown): string | null {
  const first = Array.isArray(parsed) ? (parsed[0] as Record<string, unknown> | undefined) : undefined;
  return str(first?.airline) ?? str(first?.title);
}

export const filesFor = (key: RowKey, files: BookingFile[]) => files.filter((f) => f.row === key);
export const otherFiles = (files: BookingFile[]) => files.filter((f) => f.row == null);
/** The ones a tap can open (a document record holds no file). */
export const openable = (files: BookingFile[]) => files.filter((f) => !!f.url);

/**
 * The row's one line. A booked Flights or Car row with an upload names the
 * booking: "Air Canada · confirmation". Stays already names its hotel.
 */
export function rowLine(row: CheckRow, files: BookingFile[]): string {
  if (row.state !== "booked" || row.key === "stays") return row.line;
  const mine = filesFor(row.key, files);
  if (!mine.length) return row.line;
  const label = row.name ?? mine.map((f) => f.label).find(Boolean) ?? null;
  return label ? `${label} · confirmation` : "Confirmation uploaded";
}

export type RowTap =
  | { kind: "kayak"; url: string }
  | { kind: "stays" }
  | { kind: "file"; file: BookingFile }
  | { kind: "files" }
  | { kind: "day"; dayId: string }
  | { kind: "menu" };

/**
 * What a tap on the whole row does. Still to book: its Kayak search (Stays:
 * Roam's Where to stay). Booked: its confirmation file (several: they unfold
 * under the row), else Where to stay for Stays, else the day its card is on.
 * Not needed, or nothing to open: the mark's menu, so no tap is dead.
 */
export function rowTap(row: CheckRow, files: BookingFile[], stayInApp: boolean): RowTap {
  if (row.state === "open") {
    if (row.key === "stays" && stayInApp) return { kind: "stays" };
    return row.url ? { kind: "kayak", url: row.url } : { kind: "menu" };
  }
  if (row.state === "skip") return { kind: "menu" };
  const can = openable(filesFor(row.key, files));
  if (can.length === 1) return { kind: "file", file: can[0] };
  if (can.length > 1) return { kind: "files" };
  // A booked stay opens the day its hotel is on, like every other row. It
  // used to open Where to stay, which read as "book another hotel" (6 Oct
  // 2026, Brennan). Where to stay stays in the mark's menu.
  return row.dayId ? { kind: "day", dayId: row.dayId } : { kind: "menu" };
}
