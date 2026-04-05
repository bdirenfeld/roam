const CURRENCY_RANGES: Record<string, string[]> = {
  EUR: ['Free', '€2–8',      '€15–35',     '€35–80',      '€80+'],
  GBP: ['Free', '£5–12',     '£12–30',     '£30–60',      '£60+'],
  JPY: ['Free', '¥500–1500', '¥1500–5000', '¥5000–15000', '¥15000+'],
  USD: ['Free', '$5–15',     '$15–40',     '$40–80',      '$80+'],
  CAD: ['Free', 'CA$5–15',   'CA$15–40',   'CA$40–80',    'CA$80+'],
  AUD: ['Free', 'A$5–15',    'A$15–40',    'A$40–80',     'A$80+'],
  CHF: ['Free', 'CHF5–15',   'CHF15–40',   'CHF40–80',    'CHF80+'],
}

export const getPriceRange = (
  priceLevel: number | null | undefined,
  currencyCode: string | null | undefined,
): string | null => {
  if (priceLevel == null) return null
  const ranges = CURRENCY_RANGES[currencyCode ?? ''] ?? CURRENCY_RANGES['USD']
  return ranges[priceLevel] ?? null
}
