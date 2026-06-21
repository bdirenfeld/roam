"use client";

import { useRef, useState } from "react";
import { FilmSlate, MagicWand, UploadSimple, ArrowClockwise } from "@phosphor-icons/react";
import { MODIFICATIONS, type VideoModification } from "@/lib/video/provider";

type Phase = "idle" | "working" | "done" | "error" | "not_configured";

interface TransformResponse {
  sourceUrl?: string;
  resultUrl?: string;
  status?:    "ok" | "error" | "not_configured";
  message?:   string;
  error?:     string;
}

export default function StudioPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file,      setFile]      = useState<File | null>(null);
  const [localUrl,  setLocalUrl]  = useState<string | null>(null);
  const [mod,       setMod]       = useState<VideoModification>("reframe");
  const [phase,     setPhase]     = useState<Phase>("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [note,      setNote]      = useState<string | null>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (localUrl) URL.revokeObjectURL(localUrl);
    setFile(f);
    setLocalUrl(URL.createObjectURL(f));
    setResultUrl(null);
    setNote(null);
    setPhase("idle");
  };

  const run = async () => {
    if (!file) return;
    setPhase("working");
    setNote(null);
    setResultUrl(null);

    const form = new FormData();
    form.append("file", file);
    form.append("modification", mod);

    try {
      const res  = await fetch("/api/video/transform", { method: "POST", body: form });
      const json = (await res.json()) as TransformResponse;

      if (json.status === "ok" && json.resultUrl) {
        setResultUrl(json.resultUrl);
        setPhase("done");
      } else if (json.status === "not_configured") {
        setNote(json.message ?? "AI provider isn't configured yet.");
        setPhase("not_configured");
      } else {
        setNote(json.message ?? json.error ?? "Something went wrong.");
        setPhase("error");
      }
    } catch {
      setNote("Network error — please try again.");
      setPhase("error");
    }
  };

  const activeMod = MODIFICATIONS.find((m) => m.id === mod);

  return (
    <div className="min-h-full bg-parchment px-5 pt-8 pb-10">
      <div className="mx-auto w-full max-w-mobile md:max-w-xl">
        {/* Masthead */}
        <div className="flex items-center gap-2.5 mb-1">
          <FilmSlate size={24} weight="light" color="#1A1A2E" />
          <h1 className="font-display italic text-[30px] leading-none text-activity">Journey Films</h1>
        </div>
        <p className="text-[13px] text-activity/50 mb-7 leading-relaxed">
          Bring a clip from the road. We&rsquo;ll quietly reshape it for the screen it&rsquo;s headed to.
        </p>

        {/* Source clip */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={onPick}
        />

        {!localUrl ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-2 py-14 rounded-2xl border-2 border-dashed border-activity/15 bg-white text-activity/50 hover:border-activity/30 hover:text-activity/70 transition-colors"
          >
            <UploadSimple size={26} weight="light" />
            <span className="text-[13px] font-medium">Add a clip</span>
            <span className="text-[11px] text-activity/40">MP4, MOV, WebM</span>
          </button>
        ) : (
          <div className="rounded-2xl overflow-hidden bg-white shadow-card">
            <video src={localUrl} controls className="w-full max-h-[320px] bg-black" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 text-[12px] font-medium text-activity/50 hover:text-activity/80 transition-colors border-t border-gray-100"
            >
              Choose a different clip
            </button>
          </div>
        )}

        {/* Modifications */}
        {localUrl && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-activity/40 mt-7 mb-2.5">
              The treatment
            </p>
            <div className="flex flex-col gap-2">
              {MODIFICATIONS.map((m) => {
                const active = m.id === mod;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMod(m.id)}
                    className="text-left rounded-xl border px-4 py-3 transition-colors"
                    style={{
                      borderColor:     active ? "#C4622D" : "rgba(26,26,46,0.10)",
                      backgroundColor: active ? "rgba(196,98,45,0.06)" : "#FFFFFF",
                    }}
                  >
                    <span
                      className="block text-[14px] font-semibold"
                      style={{ color: active ? "#C4622D" : "#1A1A2E" }}
                    >
                      {m.label}
                    </span>
                    <span className="block text-[12px] text-activity/50 mt-0.5 leading-snug">
                      {m.description}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Action */}
            <button
              onClick={run}
              disabled={phase === "working"}
              className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-activity text-white text-[14px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {phase === "working" ? (
                <>
                  <ArrowClockwise size={16} weight="light" className="animate-spin" />
                  Working&hellip;
                </>
              ) : (
                <>
                  <MagicWand size={16} weight="light" />
                  {activeMod ? activeMod.label : "Apply treatment"}
                </>
              )}
            </button>
          </>
        )}

        {/* Result / status */}
        {phase === "done" && resultUrl && (
          <div className="mt-7">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-activity/40 mb-2.5">
              The cut
            </p>
            <div className="rounded-2xl overflow-hidden bg-white shadow-card">
              <video src={resultUrl} controls className="w-full max-h-[320px] bg-black" />
            </div>
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-[12px] font-medium text-[#C4622D] mt-2.5 hover:opacity-80"
            >
              Open full size
            </a>
          </div>
        )}

        {(phase === "not_configured" || phase === "error") && note && (
          <div
            className="mt-5 rounded-xl px-4 py-3 text-[12px] leading-relaxed"
            style={{
              backgroundColor: phase === "error" ? "rgba(196,98,45,0.06)" : "rgba(26,26,46,0.04)",
              color:           phase === "error" ? "#C4622D" : "rgba(26,26,46,0.6)",
            }}
          >
            {note}
          </div>
        )}
      </div>
    </div>
  );
}
