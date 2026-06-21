// ── Journey Films — AI video provider abstraction ──────────────────────────
//
// This is the seam between the Roam app and an external AI-video service.
// It is intentionally provider-agnostic: the route and UI only ever speak the
// types below, so swapping Higgsfield for another vendor (or a self-hosted
// ffmpeg worker) is a one-file change.
//
// IMPORTANT — the MCP/runtime gap:
//   The Higgsfield tools available inside a Claude Code session are MCP tools
//   for the *agent*. The deployed Roam app cannot call MCP. For the app to do
//   AI video at runtime it needs Higgsfield's HTTP API + a key. That key is read
//   from HIGGSFIELD_API_KEY (server-only — never prefixed NEXT_PUBLIC_).
//
//   When the key is absent the provider returns { status: "not_configured" }
//   rather than throwing, mirroring Roam's "fail silently, degrade gracefully"
//   supplemental-data pattern. The upload + UI flow stays fully functional; only
//   the final transform is gated.

// The modifications we expose map 1:1 onto real Higgsfield video capabilities
// (reframe / upscale / remove-background). We deliberately do not advertise
// anything the provider can't actually do.
export type VideoModification = "reframe" | "upscale" | "remove_background";

export interface ModificationSpec {
  id:          VideoModification;
  label:       string;
  description: string;
}

export const MODIFICATIONS: ModificationSpec[] = [
  {
    id:          "reframe",
    label:       "Reframe to vertical",
    description: "Recompose a landscape clip into a 9:16 social cut, keeping the subject centred.",
  },
  {
    id:          "upscale",
    label:       "Upscale to 4K",
    description: "Lift resolution and sharpen detail for a crisp, large-screen finish.",
  },
  {
    id:          "remove_background",
    label:       "Remove background",
    description: "Cut the subject out onto a clean transparent backdrop.",
  },
];

export type TransformResult =
  | { status: "ok"; resultUrl: string }
  | { status: "not_configured" }
  | { status: "error"; message: string };

interface TransformInput {
  /** Publicly reachable URL of the uploaded source video (Supabase Storage). */
  sourceUrl:    string;
  modification: VideoModification;
  /** Abort if the provider is slow — keeps the serverless invocation bounded. */
  signal?:      AbortSignal;
}

// Higgsfield's REST surface differs per capability. We keep the request shaping
// isolated here so the rest of the app never depends on the vendor's schema.
// NOTE: endpoint paths/field names below follow Higgsfield's documented async
// job pattern (submit → poll). Verify against your account's API reference and
// adjust HIGGSFIELD_API_BASE if your region/tier differs.
const HIGGSFIELD_API_BASE =
  process.env.HIGGSFIELD_API_BASE ?? "https://platform.higgsfield.ai/v1";

const ENDPOINT_BY_MOD: Record<VideoModification, string> = {
  reframe:           "/video/reframe",
  upscale:           "/video/upscale",
  remove_background: "/video/remove-background",
};

function bodyFor(modification: VideoModification, sourceUrl: string): Record<string, unknown> {
  switch (modification) {
    case "reframe":
      return { video_url: sourceUrl, aspect_ratio: "9:16" };
    case "upscale":
      return { video_url: sourceUrl, target_resolution: "4k" };
    case "remove_background":
      return { video_url: sourceUrl };
  }
}

export async function transformVideo(input: TransformInput): Promise<TransformResult> {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  if (!apiKey) return { status: "not_configured" };

  try {
    const res = await fetch(`${HIGGSFIELD_API_BASE}${ENDPOINT_BY_MOD[input.modification]}`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body:   JSON.stringify(bodyFor(input.modification, input.sourceUrl)),
      signal: input.signal,
    });

    if (!res.ok) {
      return { status: "error", message: `Provider responded ${res.status}` };
    }

    const json = (await res.json()) as { result_url?: string; output?: { url?: string } };
    const resultUrl = json.result_url ?? json.output?.url;
    if (!resultUrl) return { status: "error", message: "Provider returned no result URL" };

    return { status: "ok", resultUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown provider error";
    return { status: "error", message };
  }
}
