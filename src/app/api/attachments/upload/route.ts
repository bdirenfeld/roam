import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import Anthropic from "@anthropic-ai/sdk";
import { CONFIRMATION_PROMPT, extractBookings } from "@/lib/confirmations/prompt";
import { overBudget, addSpend } from "@/lib/api/spend";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  if (!(await underQuota(gate.supabase, "uploadAttachment", QUOTA.uploadAttachment))) return quotaExceeded("uploads");
  const supabase = gate.supabase;

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

  // Upload to storage
  const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${tripId}/${cardId}/${safeName}`;
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
  let spendDb: ReturnType<typeof createAdminClient> | null = null;
  try { spendDb = createAdminClient(); } catch { spendDb = null; }
  // Over the day's Claude budget the file is kept, unread.
  if (await overBudget(spendDb)) {
    await supabase.from("card_attachments").update({ parse_status: "failed" }).eq("id", attachment.id);
    return NextResponse.json({ attachment: { ...attachment, parse_status: "failed" } });
  }
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
  // A flight's or hotel's attachment is a booking (1 Oct 2026): it is read
  // with Bookings' reader (lib/confirmations/prompt), every booking in it kept
  // as { bookings: [...] }, so Apply fills this card AND adds the rest — the
  // return flight, the hotel's check-out. Anything else keeps the open reader.
  const { data: owner } = await supabase.from("cards").select("place:places(sub_type)").eq("id", cardId).maybeSingle();
  const sub = (owner as { place?: { sub_type?: string | null } | null } | null)?.place?.sub_type ?? null;
  const asBooking = sub === "hotel" || sub === "flight_arrival" || sub === "flight_departure";

  contentBlocks.push({
    type: "text",
    text: asBooking
      ? "Extract all travel bookings from this confirmation and return a JSON array."
      : "Extract all relevant travel information from this document and return as a JSON object.",
  });

  try {
    const response = await client.messages.create({
      // Haiku (1 Oct 2026): reading a document is extraction; a tenth of the cost.
      model:      "claude-haiku-4-5-20251001",
      max_tokens: asBooking ? 1600 : 1024,
      system:     asBooking ? CONFIRMATION_PROMPT : PARSE_SYSTEM_PROMPT,
      messages:   [{ role: "user", content: contentBlocks }],
    });

    await addSpend(spendDb, "read attachment", response.usage, response.model);
    const raw = response.content.find((b) => b.type === "text");
    if (!raw || raw.type !== "text") throw new Error("No text in response");
    const parsedData: Record<string, unknown> = asBooking ? { bookings: extractBookings(raw.text) } : extractJson(raw.text);

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
