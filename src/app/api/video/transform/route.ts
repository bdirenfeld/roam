import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transformVideo, type VideoModification, MODIFICATIONS } from "@/lib/video/provider";

// Video work is heavier than a doc parse — give the invocation more headroom.
export const maxDuration = 60;

const VALID_MODS = new Set(MODIFICATIONS.map((m) => m.id));

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Require a signed-in user — this is a studio surface, not a public endpoint.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let file: File | null = null;
  let modification: string | null = null;
  try {
    const form   = await req.formData();
    file         = form.get("file")         as File | null;
    modification = form.get("modification") as string | null;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (!file || !modification) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!file.type.startsWith("video/")) {
    return NextResponse.json({ error: "Please upload a video file" }, { status: 400 });
  }
  if (!VALID_MODS.has(modification as VideoModification)) {
    return NextResponse.json({ error: "Unknown modification" }, { status: 400 });
  }

  // Store the source under a studio/ prefix in the existing public bucket.
  // POC choice: reuses card-attachments (already public) rather than provisioning
  // a new bucket — fully reversible, just objects in a folder.
  const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `studio/${user.id}/${Date.now()}-${safeName}`;
  const bytes       = await file.arrayBuffer();

  const { error: uploadErr } = await supabase.storage
    .from("card-attachments")
    .upload(storagePath, bytes, { contentType: file.type });

  if (uploadErr) {
    return NextResponse.json({ error: "Upload failed — please try again." }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("card-attachments").getPublicUrl(storagePath);
  const sourceUrl = urlData.publicUrl;

  // Run the AI transform. Degrades gracefully when the provider isn't configured.
  const result = await transformVideo({
    sourceUrl,
    modification: modification as VideoModification,
  });

  if (result.status === "not_configured") {
    return NextResponse.json({
      sourceUrl,
      status:  "not_configured",
      message: "Source uploaded. AI provider isn't configured yet — set HIGGSFIELD_API_KEY to enable transforms.",
    });
  }
  if (result.status === "error") {
    return NextResponse.json({ sourceUrl, status: "error", message: result.message }, { status: 502 });
  }

  return NextResponse.json({ sourceUrl, status: "ok", resultUrl: result.resultUrl });
}
