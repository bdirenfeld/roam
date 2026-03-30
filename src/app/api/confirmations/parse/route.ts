import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a travel confirmation parser. Extract structured data from travel confirmations.
Return ONLY valid JSON with exactly these fields (no markdown, no code fences):
{
  "type": "flight" | "hotel" | "restaurant" | "activity",
  "title": "string",
  "confirmation_number": "string or null",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null",
  "end_time": "HH:MM or null",
  "venue_name": "string or null",
  "address": "string or null",
  "phone": "string or null",
  "website": "string or null",
  "notes": "string or null"
}
For flights, set title to the route (e.g. "London → Rome"). Infer type from context.`;

function extractJson(text: string): unknown {
  // Try direct parse first
  try { return JSON.parse(text.trim()); } catch { /* fall through */ }
  // Extract from code fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ } }
  // Find first { ... } block
  const brace = text.match(/\{[\s\S]*\}/);
  if (brace) { try { return JSON.parse(brace[0]); } catch { /* fall through */ } }
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
  const isImage = mimeType.startsWith("image/");
  const isPDF   = mimeType === "application/pdf";

  if (!isImage && !isPDF) {
    return NextResponse.json({ error: "Unsupported file type. Upload a PDF or image." }, { status: 400 });
  }

  const bytes  = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  const client = new Anthropic({ apiKey });

  // Build message content for Claude
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentBlocks: any[] = [];

  if (isImage) {
    contentBlocks.push({
      type: "image",
      source: {
        type:       "base64",
        media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data:       base64,
      },
    });
  } else {
    // PDF — use document block (supported by claude-sonnet-4-6)
    contentBlocks.push({
      type: "document",
      source: {
        type:       "base64",
        media_type: "application/pdf",
        data:       base64,
      },
    });
  }

  contentBlocks.push({
    type: "text",
    text: "Extract travel confirmation data from this document and return valid JSON only.",
  });

  try {
    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: contentBlocks }],
    });

    const raw  = response.content.find((b) => b.type === "text");
    if (!raw || raw.type !== "text") throw new Error("No text in response");

    const parsed = extractJson(raw.text);
    return NextResponse.json({ parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Parse failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
