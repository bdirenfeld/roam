/**
 * Which clock an airport keeps (19 Nov 2026, boarding-pass flight card,
 * Brennan approved the mock). A flight's times are entered on each airport's
 * own clock, so "7:00 PM YYZ → 8:35 AM FRA" reads as 13 h 35 unless both
 * zones are known. The busiest airports and every airport on his journeys;
 * an airport not listed simply shows no length (never a wrong one).
 */

const ZONES: Record<string, string> = {
  "America/Toronto": "YYZ YTZ YOW YUL YQB YHM YXU YKF YQT DTW CLE CMH PIT BUF ROC SYR ALB BOS JFK LGA EWR PHL BWI DCA IAD RDU CLT ATL MCO TPA FLL MIA PBI RSW JAX SAV CHS RIC ORF BDL PVD PWM BTV MYR IND CVG SDF NAS GCM PLS MBJ KIN PAP SDQ PUJ POP STI SJU AUA CUR",
  "America/Halifax": "YHZ YFC YSJ YQM YYG BDA BGI ANU SXM",
  "America/St_Johns": "YYT",
  "America/Winnipeg": "YWG",
  "America/Regina": "YQR YXE",
  "America/Edmonton": "YEG YYC",
  "America/Vancouver": "YVR YYJ YLW YXX",
  "America/Chicago": "ORD MDW MSP STL MCI MKE IAH HOU DFW DAL AUS SAT MSY BNA MEM OKC OMA TUL",
  "America/Denver": "DEN SLC ABQ BOZ JAC ASE EGE",
  "America/Phoenix": "PHX TUS",
  "America/Los_Angeles": "LAX SFO SJC OAK SAN LAS SEA PDX SMF BUR LGB SNA ONT PSP RNO",
  "America/Anchorage": "ANC",
  "Pacific/Honolulu": "HNL OGG KOA LIH",
  "America/Cancun": "CUN",
  "America/Mexico_City": "MEX GDL MTY OAX PVR",
  "America/Mazatlan": "SJD MZT",
  "America/Havana": "HAV VRA HOG CCC",
  "America/Costa_Rica": "SJO LIR",
  "America/Panama": "PTY",
  "America/Bogota": "BOG MDE CTG",
  "America/Lima": "LIM CUZ",
  "America/Santiago": "SCL",
  "America/Argentina/Buenos_Aires": "EZE AEP",
  "America/Sao_Paulo": "GRU GIG BSB",
  "Atlantic/Reykjavik": "KEF",
  "Europe/London": "LHR LGW STN LTN LCY MAN EDI GLA BHX BRS",
  "Europe/Dublin": "DUB SNN ORK",
  "Europe/Lisbon": "LIS OPO FAO",
  "Atlantic/Madeira": "FNC",
  "Atlantic/Canary": "LPA TFS ACE",
  "Europe/Madrid": "MAD BCN AGP PMI IBZ VLC SVQ BIO",
  "Europe/Paris": "CDG ORY NCE LYS MRS BOD TLS",
  "Europe/Brussels": "BRU CRL",
  "Europe/Amsterdam": "AMS",
  "Europe/Luxembourg": "LUX",
  "Europe/Zurich": "ZRH GVA BSL",
  "Europe/Berlin": "FRA MUC BER DUS HAM CGN STR",
  "Europe/Vienna": "VIE SZG",
  "Europe/Rome": "FCO CIA MXP LIN BGY VCE FLR PSA NAP BLQ CTA PMO BRI TRN OLB CAG",
  "Europe/Malta": "MLA",
  "Europe/Copenhagen": "CPH",
  "Europe/Oslo": "OSL BGO",
  "Europe/Stockholm": "ARN",
  "Europe/Helsinki": "HEL",
  "Europe/Prague": "PRG",
  "Europe/Warsaw": "WAW KRK",
  "Europe/Budapest": "BUD",
  "Europe/Zagreb": "ZAG SPU DBV",
  "Europe/Athens": "ATH JTR JMK HER CFU RHO",
  "Europe/Istanbul": "IST SAW AYT",
  "Europe/Bucharest": "OTP",
  "Asia/Jerusalem": "TLV",
  "Asia/Dubai": "DXB AUH",
  "Asia/Qatar": "DOH",
  "Africa/Cairo": "CAI",
  "Africa/Casablanca": "CMN RAK",
  "Africa/Johannesburg": "JNB CPT",
  "Africa/Nairobi": "NBO",
  "Africa/Lusaka": "LUN MFU",
  "Asia/Kolkata": "DEL BOM BLR MAA",
  "Asia/Bangkok": "BKK DMK HKT CNX",
  "Asia/Singapore": "SIN",
  "Asia/Kuala_Lumpur": "KUL",
  "Asia/Jakarta": "CGK",
  "Asia/Makassar": "DPS",
  "Asia/Ho_Chi_Minh": "SGN HAN DAD",
  "Asia/Manila": "MNL",
  "Asia/Hong_Kong": "HKG",
  "Asia/Shanghai": "PEK PKX PVG SHA CAN",
  "Asia/Taipei": "TPE",
  "Asia/Seoul": "ICN GMP",
  "Asia/Tokyo": "NRT HND KIX ITM NGO CTS FUK OKA",
  "Australia/Sydney": "SYD CBR",
  "Australia/Melbourne": "MEL",
  "Australia/Brisbane": "BNE OOL CNS",
  "Australia/Adelaide": "ADL",
  "Australia/Perth": "PER",
  "Pacific/Auckland": "AKL WLG CHC ZQN",
  "Pacific/Fiji": "NAN",
};

const BY_CODE = new Map<string, string>();
for (const [zone, codes] of Object.entries(ZONES)) {
  for (const c of codes.split(/\s+/)) if (/^[A-Z]{3}$/.test(c)) BY_CODE.set(c, zone);
}

/** "FCO" → "Europe/Rome"; null when the airport isn't listed. */
export function airportZone(code: string | null | undefined): string | null {
  return code ? BY_CODE.get(code.toUpperCase()) ?? null : null;
}

/** The airport's code out of how a card writes it: "PSA", "Roma Fiumicino Airport (FCO)", "Frankfurt FRA". */
export function airportCode(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.match(/\(([A-Z]{3})\)/)?.[1] ?? (/^[A-Z]{3}$/.test(t) ? t : t.match(/(?:^|\s)([A-Z]{3})$/)?.[1] ?? null);
}

/** UTC milliseconds for a wall-clock time in a zone ("2026-04-22", 1185 min, "America/Toronto"). */
function utcOf(date: string, minutes: number, zone: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const offset = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - t;
  };
  const first = guess - offset(guess);
  return guess - offset(first);
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * How long a flight really is, and the day it lands on the arrival airport's
 * clock: both airports' zones known, the shortest landing after takeoff
 * (within 22 h) is the one. Null when either zone is unknown.
 */
export function flightLength(fromCode: string | null, toCode: string | null, date: string, departs: number, arrives: number): { minutes: number; landsOn: string } | null {
  const zf = airportZone(fromCode), zt = airportZone(toCode);
  if (!zf || !zt || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const off = utcOf(date, departs, zf);
  const base = Date.parse(date + "T00:00:00Z");
  for (const k of [-1, 0, 1, 2]) {
    const day = iso(base + k * 86_400_000);
    const mins = Math.round((utcOf(day, arrives, zt) - off) / 60_000);
    if (mins > 0 && mins <= 22 * 60) return { minutes: mins, landsOn: day };
  }
  return null;
}

/** "7 h 35", "45 min", "8 h". */
export function lengthLabel(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** The city a clock is named for, for "Toronto time": "YYZ" → "Toronto"; null when unlisted. */
export function zoneCity(code: string | null | undefined): string | null {
  const z = airportZone(code);
  return z ? z.split("/").pop()!.replace(/_/g, " ") : null;
}
