/**
 * A line of pieces that wraps between pieces, never inside one (6 Oct 2026,
 * Brennan: "if it's wrapping to the next line, just put the thing that's
 * wrapping on the next line"). "2 adults · 2 seniors · 3 kids (10, 8, 5)" can
 * break after a "·" or a ",", but "3 kids (10, 8, 5)" and "24 Aug – 4 Sep"
 * always stay whole. The separator stays at the end of the line it ends.
 */
export function splitPieces(text: string): string[] {
  // Split after " · " and after ", " that is not inside brackets.
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    cur += ch;
    const dot = depth === 0 && text.startsWith(" · ", i - 1) && ch === "·";
    const comma = depth === 0 && ch === "," && text[i + 1] === " ";
    if (dot || comma) { out.push(cur); cur = ""; i += 1; }
  }
  if (cur) out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

/** A piece longer than this wraps normally, so it can never push past the edge of a phone screen. */
export const MAX_WHOLE = 32;

export default function Pieces({ text }: { text: string }) {
  const parts = splitPieces(text);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          <span className={p.length <= MAX_WHOLE ? "whitespace-nowrap" : undefined}>{p}</span>
          {i < parts.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}
