const CURRENCY_RANGES: Record<string, string[]> = {
  EUR: ['Free', '€2–8',      '€15–35',     '€35–80',      '€80+'],
  GBP: ['Free', '£5–12',     '£12–30',     '£30–60',      '£60+'],
  JPY: ['Free', '¥500–1500', '¥1500–5000', '¥5000–15000', '¥15000+'],
  USD: ['Free', '$5–15',     '$15–40',     '$40–80',      '$80+'],
  CAD: ['Free', 'CA$5–15',   'CA$15–40',   'CA$40–80',    'CA$80+'],
  AUD: ['Free', 'A$5–15',    'A$15–40',    'A$40–80',     'A$80+'],
  CHF: ['Free', 'CHF5–15',   'CHF15–40',   'CHF40–80',    'CHF80+'],
}

// Most cards carry no currency_code, so Italy printed "$5–15" (4 Oct 2026).
// The address's country says which currency the price levels are in.
const EURO = ['Italy', 'France', 'Spain', 'Portugal', 'Germany', 'Netherlands', 'Belgium', 'Austria', 'Ireland', 'Greece', 'Finland', 'Croatia', 'Slovenia', 'Slovakia', 'Estonia', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Cyprus', 'Monaco']
const BY_COUNTRY: Record<string, string> = {
  ...Object.fromEntries(EURO.map((c) => [c, 'EUR'])),
  'United Kingdom': 'GBP', UK: 'GBP', Japan: 'JPY', Canada: 'CAD', Australia: 'AUD', Switzerland: 'CHF', USA: 'USD', 'United States': 'USD',
}

/** The currency for an address, from its last part ("…, Lucca LU, Italy" → EUR), or null. */
export function currencyForAddress(address: string | null | undefined): string | null {
  const country = address?.split(',').pop()?.trim()
  return (country && BY_COUNTRY[country]) || null
}

export const getPriceRange = (
  priceLevel: number | null | undefined,
  currencyCode: string | null | undefined,
  address?: string | null,
): string | null => {
  if (priceLevel == null) return null
  const ranges = CURRENCY_RANGES[currencyCode ?? ''] ?? CURRENCY_RANGES[currencyForAddress(address) ?? ''] ?? CURRENCY_RANGES['USD']
  return ranges[priceLevel] ?? null
}
