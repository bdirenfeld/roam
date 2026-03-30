import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a travel confirmation parser. Extract structured data from travel confirmations.

Always return a JSON array. For round-trip flights return TWO objects (outbound then return). For all other bookings return ONE object.

Each object must have exactly these fields (no extra keys):
{
  "type": "flight_arrival" | "flight_departure" | "hotel" | "restaurant" | "activity",
  "title": "string — e.g. 'Air Canada · YYZ → FCO' for flights, hotel/restaurant name for others",
  "confirmation_number": "string or null — booking reference shared by both flights if round-trip",
  "date": "YYYY-MM-DD or null — departure date for flights, check-in/reservation date for others",
  "time": "HH:MM or null — departure time for flights, reservation time for restaurants/hotels",
  "end_time": "HH:MM or null — arrival time for flights",
  "address": "string or null — airport name + city for flights, full address for others",
  "phone": "string or null",
  "website": "string or null — airline website or booking URL",
  "notes": "string or null — flight number, seat number, duration, passenger name, cabin class"
}

Round-trip flight rules:
- Object 1: type "flight_arrival" — the outbound leg ARRIVING at the destination
- Object 2: type "flight_departure" — the return leg DEPARTING from the destination
- Both share the same confirmation_number

Single flight:
- Arriving at destination → type "flight_arrival"
- Departing from destination → type "flight_departure"

Return ONLY the JSON array. No markdown, no code fences, no explanation.`;

function extractJson(text: string): unknown {
  const t = text.trim();
  // Try direct parse
  try { return JSON.parse(t); } catch { /* fall through */ }
  // Extract from code fences
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ } }
  // Try array first
  const arr = t.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch { /* fall through */ } }
  // Fall back to object (wrap in array)
  const brace = t.match(/\{[\s\S]*\}/);
  if (brace) { try { return [JSON.parse(brace[0])]; } catch { /* fall through */ } }
  throw new Error("No valid JSON in response");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const mimeType = file.type;
  const isImage  = mimeType.startsWith("image/");
  const isPDF    = mimeType === "application/pdf";

  if (!isImage && !isPDF) {
    return NextResponse.json({ error: "Unsupported file type. Upload a PDF or image." }, { status: 400 });
  }

  const bytes  = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  const client = new Anthropic({ apiKey });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentBlocks: any[] = [];

  if (isImage) {
    contentBlocks.push({
      type:   "image",
      source: {
        type:       "base64",
        media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data:       base64,
      },
    });
  } else {
    contentBlocks.push({
      type:   "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    });
  }

  contentBlocks.push({
    type: "text",
    text: "Extract all travel bookings from this confirmation and return a JSON array.",
  });

  try {
    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: contentBlocks }],
    });

    const raw = response.content.find((b) => b.type === "text");
    if (!raw || raw.type !== "text") throw new Error("No text in response");

    const result = extractJson(raw.text);
    // Normalise to array
    const parsed = Array.isArray(result) ? result : [result];
    if (parsed.length === 0) throw new Error("No bookings found in document");

    return NextResponse.json({ parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Parse failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
