"use client";

// ── A document, inside Roam ───────────────────────────────────────────────
// Bookings and card attachments used to open in the same window, and on a
// phone the only way home was the system back key (Brennan, Sep 2026: "no
// obvious way to close them"). This is the file with a name and a × at the
// top. Images show in place; a PDF shows in place where the phone can, and
// "Open in browser" is always there for where it can't.

import { useEffect } from "react";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export interface ViewableFile {
  url: string;
  name: string;
  type?: string | null;
}

export default function FileViewer({ file, onClose }: { file: ViewableFile; onClose: () => void }) {
  useEscapeKey(onClose);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const isImage = (file.type ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(file.name);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-white" role="dialog" aria-label={file.name}>
      <div className="flex items-center h-[58px] flex-shrink-0 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <p className="flex-1 min-w-0 truncate text-[14px] text-[#1A1A2E] pr-2">{file.name}</p>
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] mr-4 flex-shrink-0 underline underline-offset-2"
          style={{ color: "rgba(26,26,46,0.62)" }}
        >
          Open in browser
        </a>
      </div>
      <div className="flex-1 min-h-0 bg-[#F5F4F1]">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.url} alt={file.name} className="w-full h-full object-contain" />
        ) : (
          <iframe src={file.url} title={file.name} className="w-full h-full" style={{ border: 0 }} />
        )}
      </div>
    </div>
  );
}
