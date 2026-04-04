import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

const PARSE_SYSTEM_PROMPT = `You are parsing a travel document attached to a trip planning card. Extract any relevant information: confirmation numbers, booking references, dates, times, addresses, contact details, costs, cancellation policies, meeting points, included items, special instructions. Return as a flat JSON object with keys matching card detail fields where possible, such as: confirmation, date, time, end_time, address, phone, website, notes, cost_per_person, currency, meeting_point, cancellation_deadline, supplier, airline, flight_number, terminal. Return ONLY the JSON object, no markdown, no explanation.`;

function extractJson(text: string): Record<string, unknown> {
  const t = text.trim();
  try { return JSON.parse(t) as Record<string, unknown>; } catch { /* fall through */ }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()) as Record<string, unknown>; } catch { /* fall through */ } }
  const brace = t.match(/\{[\s\S]*\}/);
  if (brace) { try { return JSON.parse(brace[0]) as Record<string, unknown>; } catch { /* fall through */ } }
  throw new Error("No valid JSON in response");
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let file: File | null = null;
  let cardId: string | null = null;
  let tripId: string | null = null;
  try {
    const form = await req.formData();
    file   = form.get("file")    as File | null;
    cardId = form.get("card_id") as string | null;
    tripId = form.get("trip_id") as string | null;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (!file || !cardId || !tripId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const mimeType = file.type;
  const isImage  = mimeType.startsWith("image/");
  const isPDF    = mimeType === "application/pdf";

  // Ensure the bucket exists (ignore "already exists" errors)
  const { error: bucketErr } = await supabase.storage.createBucket("card-attachments", {
    public: true,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"],
  });
  if (bucketErr && !bucketErr.message.toLowerCase().includes("already exist")) {
    return NextResponse.json({ error: "Storage setup failed" }, { status: 500 });
  }

  // Upload to storage
  const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${tripId}/${cardId}/${Date.now()}_${safeName}`;
  const bytes       = await file.arrayBuffer();

  const { error: uploadErr } = await supabase.storage
    .from("card-attachments")
    .upload(storagePath, bytes, { contentType: mimeType });

  if (uploadErr) {
    return NextResponse.json({ error: "File upload failed" }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("card-attachments").getPublicUrl(storagePath);
  const fileUrl = urlData.publicUrl;

  // Insert attachment record
  const canParse = isImage || isPDF;
  const { data: attachment, error: insertErr } = await supabase
    .from("card_attachments")
    .insert({
      card_id:      cardId,
      trip_id:      tripId,
      file_name:    file.name,
      file_type:    mimeType,
      file_url:     fileUrl,
      file_size:    file.size,
      parse_status: canParse ? "parsing" : "skipped",
    })
    .select()
    .single();

  if (insertErr || !attachment) {
    return NextResponse.json({ error: "Failed to save attachment record" }, { status: 500 });
  }

  if (!canParse) return NextResponse.json({ attachment });

  // AI parse
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await supabase.from("card_attachments").update({ parse_status: "failed" }).eq("id", attachment.id);
    return NextResponse.json({ attachment: { ...attachment, parse_status: "failed" } });
  }

  const base64 = Buffer.from(bytes).toString("base64");
  const client  = new Anthropic({ apiKey });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentBlocks: any[] = [];
  if (isImage) {
    contentBlocks.push({
      type:   "image",
      source: {
        type:       "base64",
        media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
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
    text: "Extract all relevant travel information from this document and return as a JSON object.",
  });

  try {
    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      system:     PARSE_SYSTEM_PROMPT,
      messages:   [{ role: "user", content: contentBlocks }],
    });

    const raw = response.content.find((b) => b.type === "text");
    if (!raw || raw.type !== "text") throw new Error("No text in response");
    const parsedData = extractJson(raw.text);

    const { data: updated } = await supabase
      .from("card_attachments")
      .update({ parsed_data: parsedData, parse_status: "parsed" })
      .eq("id", attachment.id)
      .select()
      .single();

    return NextResponse.json({
      attachment: updated ?? { ...attachment, parsed_data: parsedData, parse_status: "parsed" },
    });
  } catch {
    await supabase.from("card_attachments").update({ parse_status: "failed" }).eq("id", attachment.id);
    return NextResponse.json({ attachment: { ...attachment, parse_status: "failed" } });
  }
}
