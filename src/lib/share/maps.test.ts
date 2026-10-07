import { describe, it, expect, vi } from "vitest";
import {
  isGoogleMapsUrl,
  readMapsShare,
  placeFromMapsUrl,
  resolveMapsLink,
  mapsQuery,
  findPlaceUrl,
  shareLinkAndCaption,
} from "./maps";

// A place shared from Google Maps on Android (7 Oct 2026). The shapes below are
// the ones Maps is known to send; one real share from Brennan's phone is still
// owed to confirm which his version uses.

describe("isGoogleMapsUrl", () => {
  it("knows the short link and the full place links", () => {
    expect(isGoogleMapsUrl("https://maps.app.goo.gl/AbC123xyz")).toBe(true);
    expect(isGoogleMapsUrl("https://goo.gl/maps/AbC123")).toBe(true);
    expect(isGoogleMapsUrl("https://www.google.com/maps/place/BABAE/@43.7,11.2,17z")).toBe(true);
    expect(isGoogleMapsUrl("https://www.google.it/maps/place/BABAE/")).toBe(true);
    expect(isGoogleMapsUrl("https://maps.google.com/?q=BABAE")).toBe(true);
  });
  it("is not fooled by lookalikes, other Google pages or social links", () => {
    expect(isGoogleMapsUrl("https://www.google.com/search?q=babae")).toBe(false);
    expect(isGoogleMapsUrl("https://goo.gl/photos/abc")).toBe(false);
    expect(isGoogleMapsUrl("https://maps.app.goo.gl.evil.example/x")).toBe(false);
    expect(isGoogleMapsUrl("https://vt.tiktok.com/ZSqJ1G8RJ/")).toBe(false);
    expect(isGoogleMapsUrl(null)).toBe(false);
    expect(isGoogleMapsUrl("not a url")).toBe(false);
  });
});

describe("readMapsShare", () => {
  it("name, address and link on three lines of text", () => {
    const s = readMapsShare(null, "BABAE\nVia Santo Spirito, 21r, 50125 Firenze FI, Italy\nhttps://maps.app.goo.gl/AbC123xyz", null);
    expect(s).toEqual({
      link: "https://maps.app.goo.gl/AbC123xyz",
      name: "BABAE",
      address: "Via Santo Spirito, 21r, 50125 Firenze FI, Italy",
      caption: "BABAE\nVia Santo Spirito, 21r, 50125 Firenze FI, Italy",
    });
  });

  it("the place name in title as well — not counted twice", () => {
    const s = readMapsShare("BABAE", "BABAE\nVia Santo Spirito, 21r, Firenze\nhttps://maps.app.goo.gl/AbC123xyz", null);
    expect(s?.name).toBe("BABAE");
    expect(s?.address).toBe("Via Santo Spirito, 21r, Firenze");
  });

  it("title is the name, text is the address and link", () => {
    const s = readMapsShare("Trattoria Mario", "Via Rosina, 2r, Firenze\r\nhttps://maps.app.goo.gl/xyz", null);
    expect(s?.name).toBe("Trattoria Mario");
    expect(s?.address).toBe("Via Rosina, 2r, Firenze");
  });

  it("the link in url, the words in text", () => {
    const s = readMapsShare(null, "BABAE\nVia Santo Spirito, 21r, Firenze", "https://maps.app.goo.gl/AbC123xyz");
    expect(s?.link).toBe("https://maps.app.goo.gl/AbC123xyz");
    expect(s?.name).toBe("BABAE");
  });

  it("a bare short link: no name yet, the server reads it from the link", () => {
    const s = readMapsShare(null, "https://maps.app.goo.gl/AbC123xyz", null);
    expect(s).toEqual({ link: "https://maps.app.goo.gl/AbC123xyz", name: null, address: null, caption: null });
  });

  it("a dropped pin is not a name", () => {
    const s = readMapsShare(null, "Dropped pin\nhttps://maps.google.com/?q=43.7688,11.2474", null);
    expect(s?.name).toBeNull();
    expect(s?.caption).toBeNull();
  });

  it("strips trailing punctuation from the link", () => {
    const s = readMapsShare(null, "Look at this: https://maps.app.goo.gl/AbC123xyz.", null);
    expect(s?.link).toBe("https://maps.app.goo.gl/AbC123xyz");
  });

  it("is null for anything that is not a Maps share", () => {
    expect(readMapsShare(null, "https://vt.tiktok.com/ZSqJ1G8RJ/", null)).toBeNull();
    expect(readMapsShare("Hello", "no link here", null)).toBeNull();
    expect(readMapsShare(null, null, null)).toBeNull();
  });
});

describe("placeFromMapsUrl", () => {
  it("reads the name and the pin from a full place link", () => {
    const p = placeFromMapsUrl(
      "https://www.google.com/maps/place/BABAE/@43.7676,11.2453,17z/data=!3m1!4b1!4m6!3m5!1s0x132a5!8m2!3d43.7688!4d11.2474!16s%2Fg%2F11",
    );
    // !3d!4d is the place itself; @ is only where the map was centred.
    expect(p).toEqual({ name: "BABAE", lat: 43.7688, lng: 11.2474 });
  });

  it("decodes an encoded name, with + as a space", () => {
    const p = placeFromMapsUrl("https://www.google.com/maps/place/Caff%C3%A8+Gilli/@43.7718,11.2537,17z");
    expect(p).toEqual({ name: "Caffè Gilli", lat: 43.7718, lng: 11.2537 });
  });

  it("reads negative coordinates from @ when there is no !3d", () => {
    const p = placeFromMapsUrl("https://www.google.com/maps/place/Ace+Hotel+%26+Swim+Club/@33.8095,-116.5434,15z");
    expect(p).toEqual({ name: "Ace Hotel & Swim Club", lat: 33.8095, lng: -116.5434 });
  });

  it("reads ?q= as the name, or as the pin when it is coordinates", () => {
    expect(placeFromMapsUrl("https://maps.google.com/?q=BABAE,+Via+Santo+Spirito,+Firenze&ftid=0x1:0x2")).toEqual({
      name: "BABAE, Via Santo Spirito, Firenze",
      lat: null,
      lng: null,
    });
    expect(placeFromMapsUrl("https://maps.google.com/?q=43.7688,11.2474")).toEqual({ name: null, lat: 43.7688, lng: 11.2474 });
  });

  it("is null for a short link, a consent page or a non-Maps page", () => {
    expect(placeFromMapsUrl("https://maps.app.goo.gl/AbC123xyz")).toBeNull();
    expect(placeFromMapsUrl("https://consent.google.com/m?continue=https://www.google.com/maps/place/BABAE")).toBeNull();
    expect(placeFromMapsUrl("https://www.google.com/sorry/index?continue=x")).toBeNull();
    expect(placeFromMapsUrl("https://www.google.com/maps/place/%E0%A4%A/")).toBeNull(); // broken encoding
  });
});

/** A fetch that answers each URL with a redirect to the next, then a 200. */
function redirects(chain: Record<string, { status: number; location?: string }>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    expect(init?.redirect).toBe("manual");
    const hop = chain[url];
    if (!hop) throw new Error(`unexpected fetch ${url}`);
    return {
      status: hop.status,
      headers: new Headers(hop.location ? { location: hop.location } : {}),
      body: { cancel: vi.fn(async () => {}) },
    } as unknown as Response;
  });
}

describe("resolveMapsLink", () => {
  const FULL = "https://www.google.com/maps/place/BABAE/@43.7676,11.2453,17z/data=!3d43.7688!4d11.2474";

  it("follows the short link to the place page", async () => {
    const f = redirects({ "https://maps.app.goo.gl/AbC": { status: 302, location: FULL } });
    expect(await resolveMapsLink("https://maps.app.goo.gl/AbC", f)).toBe(FULL);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("follows a relative Location and a second hop", async () => {
    const f = redirects({
      "https://goo.gl/maps/AbC": { status: 301, location: "/maps/AbC2" },
      "https://goo.gl/maps/AbC2": { status: 302, location: "https://www.google.com/maps/place/BABAE/@43.7,11.2,17z" },
    });
    expect(await resolveMapsLink("https://goo.gl/maps/AbC", f)).toBe("https://www.google.com/maps/place/BABAE/@43.7,11.2,17z");
  });

  it("needs no fetch for a link that is already a place page", async () => {
    const f = redirects({});
    expect(await resolveMapsLink(FULL, f)).toBe(FULL);
    expect(f).not.toHaveBeenCalled();
  });

  it("gives up on Google's consent or unusual-traffic page", async () => {
    const consent = redirects({ "https://maps.app.goo.gl/AbC": { status: 302, location: "https://consent.google.com/m?continue=x" } });
    expect(await resolveMapsLink("https://maps.app.goo.gl/AbC", consent)).toBeNull();
    const sorry = redirects({ "https://maps.app.goo.gl/AbC": { status: 302, location: "https://www.google.com/sorry/index?continue=x" } });
    expect(await resolveMapsLink("https://maps.app.goo.gl/AbC", sorry)).toBeNull();
  });

  it("gives up on a 200 page, a redirect elsewhere, or more than three hops", async () => {
    const page = redirects({ "https://maps.app.goo.gl/AbC": { status: 200 } });
    expect(await resolveMapsLink("https://maps.app.goo.gl/AbC", page)).toBeNull();
    const elsewhere = redirects({ "https://maps.app.goo.gl/AbC": { status: 302, location: "https://evil.example/x" } });
    expect(await resolveMapsLink("https://maps.app.goo.gl/AbC", elsewhere)).toBeNull();
    const loop = redirects({
      "https://maps.app.goo.gl/A": { status: 302, location: "https://maps.app.goo.gl/B" },
      "https://maps.app.goo.gl/B": { status: 302, location: "https://maps.app.goo.gl/C" },
      "https://maps.app.goo.gl/C": { status: 302, location: "https://maps.app.goo.gl/D" },
      "https://maps.app.goo.gl/D": { status: 302, location: FULL },
    });
    expect(await resolveMapsLink("https://maps.app.goo.gl/A", loop)).toBeNull();
    expect(loop).toHaveBeenCalledTimes(3);
  });

  it("gives up quietly when the fetch throws", async () => {
    const f = vi.fn(async () => { throw new Error("network"); });
    expect(await resolveMapsLink("https://maps.app.goo.gl/AbC", f)).toBeNull();
  });
});

describe("shareLinkAndCaption (what /share works from)", () => {
  it("a Maps share: the Maps link, and a caption without the raw URL", () => {
    expect(shareLinkAndCaption(null, "BABAE\nVia Santo Spirito, 21r, Firenze\nhttps://maps.app.goo.gl/AbC123xyz", null)).toEqual({
      link: "https://maps.app.goo.gl/AbC123xyz",
      caption: "BABAE\nVia Santo Spirito, 21r, Firenze",
    });
    expect(shareLinkAndCaption(null, "https://maps.app.goo.gl/AbC123xyz", null)).toEqual({
      link: "https://maps.app.goo.gl/AbC123xyz",
      caption: null,
    });
  });
  it("a TikTok share is passed through as before", () => {
    expect(shareLinkAndCaption("Best pasta in Rome", null, "https://vt.tiktok.com/ZSqJ1G8RJ/")).toEqual({
      link: "https://vt.tiktok.com/ZSqJ1G8RJ/",
      caption: "Best pasta in Rome",
    });
    expect(shareLinkAndCaption(null, "https://vt.tiktok.com/ZSqJ1G8RJ/", null)).toEqual({
      link: "https://vt.tiktok.com/ZSqJ1G8RJ/",
      caption: null,
    });
  });
});

describe("mapsQuery and findPlaceUrl", () => {
  it("joins name and address for Google", () => {
    expect(mapsQuery("BABAE", "Via Santo Spirito, 21r, Firenze")).toBe("BABAE, Via Santo Spirito, 21r, Firenze");
    expect(mapsQuery("BABAE", null)).toBe("BABAE");
    expect(mapsQuery(null, null)).toBeNull();
  });
  it("biases Find Place to the pin when there is one", () => {
    const u = new URL(findPlaceUrl("BABAE", "k", { lat: 43.7688, lng: 11.2474 }));
    expect(u.pathname).toBe("/maps/api/place/findplacefromtext/json");
    expect(u.searchParams.get("input")).toBe("BABAE");
    expect(u.searchParams.get("locationbias")).toBe("point:43.7688,11.2474");
    expect(u.searchParams.get("fields")).toBe("place_id,name,formatted_address");
    expect(new URL(findPlaceUrl("BABAE", "k")).searchParams.get("locationbias")).toBeNull();
  });
});
