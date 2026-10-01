import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import Anthropic from "@anthropic-ai/sdk";
import { CONFIRMATION_PROMPT, extractBookings } from "@/lib/confirmations/prompt";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  if (!(await underQuota(gate.supabase, "parseBooking", QUOTA.parseBooking))) return quotaExceeded("reading bookings");

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
      max_tokens: 1600,
      system:     CONFIRMATION_PROMPT,
      messages:   [{ role: "user", content: contentBlocks }],
    });

    const raw = response.content.find((b) => b.type === "text");
    if (!raw || raw.type !== "text") throw new Error("No text in response");

    const parsed = extractBookings(raw.text);

    if (parsed.length === 0) throw new Error("No bookings found in document");

    return NextResponse.json({ parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Parse failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
