// A picture is redrawn smaller before it is sent. Redrawing also drops the
// photo's hidden data, including where it was taken.
import { MAX_PICTURE_BYTES } from "./message";

export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** A JPEG under the limit, or null when the browser can't read the file. */
export async function shrinkPicture(file: Blob): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    for (const [max, q] of [[1600, 0.82], [1100, 0.7]]) {
      const { w, h } = fitWithin(bmp.width, bmp.height, max);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      if (!g) return null;
      g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
      g.drawImage(bmp, 0, 0, w, h);
      const out = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", q));
      if (out && out.size <= MAX_PICTURE_BYTES) return out;
    }
  } catch { /* not a picture this browser can open */ }
  return null;
}
