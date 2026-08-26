// ── Family birthdays for the "Your year" strip ────────────────────────────
// Source: Brennan's Outlook Birthdays calendar (extracted Aug 2026).
// These recur every year, so only month + day are stored. Everything in
// FAMILY_DATES renders as a gold diamond in the Birthdays lane; to add a
// person, promote a line from the candidates block below (one-line change).

export type FamilyGroup = "immediate" | "family";

export interface FamilyDate {
  name: string;
  month: number; // 1–12
  day: number;
  group: FamilyGroup;
}

export const FAMILY_DATES: FamilyDate[] = [
  { name: "Brennan", month: 4,  day: 3,  group: "immediate" },
  { name: "Sai",     month: 7,  day: 14, group: "immediate" },
  { name: "Mia",     month: 8,  day: 7,  group: "immediate" },
  { name: "Bodhi",   month: 8,  day: 31, group: "immediate" },
  { name: "Finn",    month: 11, day: 25, group: "immediate" }, // the dog
  { name: "Isha",    month: 12, day: 1,  group: "immediate" },

  // Extended family — confirmed by Brennan, Aug 2026
  { name: "Arlene",  month: 1,  day: 3,  group: "family" },
  { name: "Gary",    month: 2,  day: 10, group: "family" }, // date from Brennan directly
  { name: "Ami",     month: 2,  day: 19, group: "family" }, // "Amelia" in the Outlook calendar
  { name: "Dylan",   month: 5,  day: 16, group: "family" },
  { name: "Gorav",   month: 5,  day: 17, group: "family" }, // recurring Google Calendar event
  { name: "Jodi",    month: 11, day: 18, group: "family" },

  // ── ALREADY-EXTRACTED CANDIDATES (not rendered) ─────────────────────────
  // Pulled from the same Outlook calendar; awaiting Brennan's call on which
  // are parents / in-laws / close family. Promote by uncommenting a line
  // (and set group to "family").
  // { name: "Sheila",        month: 2,  day: 15, group: "family" },
  // { name: "Norah",         month: 3,  day: 13, group: "family" },
  // { name: "Anna",          month: 3,  day: 20, group: "family" },
  // { name: "Will",          month: 6,  day: 1,  group: "family" },
  // { name: "Lorne",         month: 7,  day: 18, group: "family" },
  // { name: "Alan",          month: 7,  day: 24, group: "family" },
  // { name: "Henry",         month: 7,  day: 25, group: "family" },
  // { name: "Aryan",         month: 7,  day: 26, group: "family" },
  // { name: "Ina",           month: 8,  day: 11, group: "family" },
  // { name: "Mariana",       month: 8,  day: 23, group: "family" },
  // { name: "Benjamin",      month: 9,  day: 3,  group: "family" },
  // { name: "Sam/Charlie",   month: 9,  day: 7,  group: "family" },
  // { name: "Granddad",      month: 9,  day: 9,  group: "family" },
  // { name: "Zadda",         month: 9,  day: 10, group: "family" },
  // { name: "Neera Bua",     month: 9,  day: 10, group: "family" },
  // { name: "Jason",         month: 10, day: 16, group: "family" },
  // { name: "Shayna",        month: 10, day: 22, group: "family" },
  // { name: "Sam Direnfeld", month: 12, day: 3,  group: "family" },
  // { name: "Ian",           month: 12, day: 31, group: "family" },
  // { name: "Barry",         month: 12, day: 31, group: "family" },
];
