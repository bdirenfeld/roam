"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Trip } from "@/types/database";

interface Props {
  trip: Trip;
  onClose: () => void;
  onSuccess: (url: string) => void;
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TripCoverEditModal({ trip, onClose, onSuccess }: Props) {
  const [pendingFile, setPendingFile]   = useState<File | null>(null);
  const [previewUrl,  setPreviewUrl]    = useState<string | null>(null);
  const [urlInput,    setUrlInput]      = useState("");
  const [isDragOver,  setIsDragOver]    = useState(false);
  const [saving,      setSaving]        = useState(false);
  const [error,       setError]         = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasSelection = pendingFile !== null || urlInput.trim() !== "";

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPG, PNG, or WEBP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10 MB.");
      return;
    }
    setError(null);
    setPendingFile(file);
    setUrlInput("");
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const clearFile = () => {
    setPendingFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSave = async () => {
    if (!hasSelection || saving) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    let url: string | null = null;

    if (pendingFile) {
      const safeName    = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${trip.id}/${Date.now()}_${safeName}`;
      const { error: uploadErr } = await supabase.storage
        .from("trip-covers")
        .upload(storagePath, pendingFile, { contentType: pendingFile.type, upsert: true });
      if (uploadErr) {
        setError("Upload failed — please try again.");
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("trip-covers").getPublicUrl(storagePath);
      url = urlData.publicUrl;
    } else {
      url = urlInput.trim();
    }

    if (!url) { setSaving(false); return; }

    const { error: updateErr } = await supabase
      .from("trips")
      .update({ cover_image_url: url })
      .eq("id", trip.id);

    if (updateErr) {
      setError("Failed to save — please try again.");
      setSaving(false);
      return;
    }

    onSuccess(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(26,26,46,0.45)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-[340px] max-w-[calc(100vw-32px)]"
        style={{ background: "#FAF7F2", borderRadius: 14 }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <h2 className="font-display italic font-normal text-lg text-gray-900 leading-snug pr-8">
            Update cover image
          </h2>
          <p className="text-[11px] font-medium text-gray-500 mt-1">{trip.title}</p>
          <p className="text-[11px] text-gray-400">
            {fmtDate(trip.start_date)} – {fmtDate(trip.end_date)}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* File section */}
          {pendingFile && previewUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full object-cover"
                style={{ height: 110, borderRadius: 10 }}
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                <span className="text-[10px] text-white px-1.5 py-0.5 rounded max-w-[120px] truncate" style={{ background: "rgba(0,0,0,0.45)" }}>
                  {pendingFile.name}
                </span>
                <button
                  onClick={clearFile}
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(0,0,0,0.5)" }}
                  aria-label="Clear"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-xl py-6 flex flex-col items-center gap-1.5 transition-colors"
              style={{
                borderColor: isDragOver ? "#C4622D" : "#D4CFC8",
                background:  isDragOver ? "#FEF3EA"  : "transparent",
              }}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 16 12 12 8 16" />
                <line x1="12" y1="12" x2="12" y2="21" />
                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
              </svg>
              <p className="text-[13px] font-medium text-gray-600">Drop an image here</p>
              <p className="text-[11px] text-gray-400">JPG, PNG or WEBP · max 10MB</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[12px] font-semibold mt-0.5"
                style={{ color: "#C4622D" }}
              >
                or browse files
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1" style={{ height: "0.5px", background: "#E8E3DA" }} />
            <span className="text-[10px] uppercase tracking-widest flex-shrink-0" style={{ color: "#B8B4AC" }}>
              or paste a URL
            </span>
            <div className="flex-1" style={{ height: "0.5px", background: "#E8E3DA" }} />
          </div>

          {/* URL input */}
          <input
            type="url"
            value={urlInput}
            onChange={(e) => { clearFile(); setUrlInput(e.target.value); }}
            placeholder="https://…"
            className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white"
          />

          {error && (
            <p className="text-[12px]" style={{ color: "#C4622D" }}>{error}</p>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!hasSelection || saving}
            className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white transition-opacity"
            style={{
              background: "#1A1A2E",
              opacity: hasSelection && !saving ? 1 : 0.4,
              cursor:  hasSelection && !saving ? "pointer" : "default",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
