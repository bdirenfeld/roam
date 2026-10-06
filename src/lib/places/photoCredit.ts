/**
 * Is this Google photo credit just the place's own name? (6 Oct 2026.)
 *
 * Google attaches the contributor to every photo. When the business uploaded
 * the photo itself, the credit IS the business — "Buca di Sant'Antonio" printed
 * on the photo of Buca di Sant'Antonio, with the same name in bold right below.
 * Brennan's designer-audit ruling: that line goes. A credit naming somebody
 * else (a photographer) is a real attribution and stays.
 */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isOwnCredit(attributionHtml: string | null | undefined, placeTitle: string | null | undefined): boolean {
  if (!attributionHtml || !placeTitle) return false;
  const credit = norm(textOf(attributionHtml));
  const title = norm(placeTitle);
  return credit !== "" && credit === title;
}
