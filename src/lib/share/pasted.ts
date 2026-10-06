/**
 * iPhone share by paste (5 Oct 2026). iOS never lists a home-screen app in
 * TikTok's or Instagram's share sheet, so there the share step is Copy link;
 * the map's search reads what was pasted and hands a TikTok or Instagram link
 * to /share, the same page Android's share sheet opens.
 * Mock approved: https://claude.ai/artifact/9E1BqUNcEfggCmpBwK2rPg
 */
import { providerOf, type Provider } from "./embed";

/** The first TikTok or Instagram link in pasted text (apps often add a caption around it). */
export function pastedSocialLink(text: string | null | undefined): { url: string; provider: Provider } | null {
  if (!text) return null;
  for (const raw of text.match(/https?:\/\/[^\s<>"']+/gi) ?? []) {
    const url = raw.replace(/[).,!?]+$/, "");
    const provider = providerOf(url);
    if (provider) return { url, provider };
  }
  return null;
}

/** Where a pasted link goes: the share page, as if it had been shared. */
export function shareHref(url: string): string {
  return `/share?url=${encodeURIComponent(url)}`;
}

/** iPhone or iPad: no share target, so the search offers the paste row. */
export function wantsPasteRow(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}
