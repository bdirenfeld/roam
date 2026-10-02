/**
 * The Unsplash searches for a journey's cover, broadest last (2 Oct 2026).
 * "Viet Hung, Ha Noi, Vietnam" found nothing as one search and the journey
 * showed the map; each try drops the leading part: the full destination, then
 * "Ha Noi, Vietnam", then "Vietnam". lib/unsplash tries them in order.
 */
export function coverQueries(destination: string): string[] {
  const parts = destination.split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const q = `${parts.slice(i).join(", ")} travel landmark`;
    if (!out.includes(q)) out.push(q);
  }
  return out;
}
