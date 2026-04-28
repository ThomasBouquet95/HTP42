"use client";

import { useEffect, useRef, useState } from "react";

const OUTPUT_SIZE = 512; // Final exported edge size (px).
const MAX_BYTES = 1 * 1024 * 1024;

type Props = {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onCropped: (file: File) => void;
};

type Pan = { x: number; y: number };

export function PhotoCropModal({ open, file, onClose, onCropped }: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const dragRef = useRef<{ x: number; y: number; pan: Pan } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Square crop window edge in CSS pixels (matches stage size).
  const STAGE = 320;

  useEffect(() => {
    if (!open || !file) {
      setImgUrl(null);
      setImgSize(null);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const img = new Image();
    img.onload = () => {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setPan({ x: 0, y: 0 });
      setZoom(1);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !file) return null;

  // Base scale: smallest scale so the image just fills the stage. zoom=1 → fits.
  const baseScale = imgSize
    ? Math.max(STAGE / imgSize.w, STAGE / imgSize.h)
    : 1;
  const scale = baseScale * zoom;
  const renderedW = imgSize ? imgSize.w * scale : 0;
  const renderedH = imgSize ? imgSize.h * scale : 0;
  // Clamp pan so the image always covers the stage.
  const maxPanX = Math.max(0, (renderedW - STAGE) / 2);
  const maxPanY = Math.max(0, (renderedH - STAGE) / 2);
  const clampedPan: Pan = {
    x: Math.min(maxPanX, Math.max(-maxPanX, pan.x)),
    y: Math.min(maxPanY, Math.max(-maxPanY, pan.y)),
  };

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, pan: clampedPan };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setPan({ x: dragRef.current.pan.x + dx, y: dragRef.current.pan.y + dy });
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  async function exportCrop() {
    if (!imgUrl || !imgSize || !file) return;
    setExporting(true);
    try {
      const img = await loadImage(imgUrl);
      // Translate stage-space crop to source-image-space.
      const sx = imgSize.w / 2 - STAGE / 2 / scale - clampedPan.x / scale;
      const sy = imgSize.h / 2 - STAGE / 2 / scale - clampedPan.y / scale;
      const sSize = STAGE / scale;

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Unable to get canvas context.");
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const blob = await compressToBlob(canvas);
      const out = new File([blob], replaceExt(file.name || "photo.jpg", "jpg"), {
        type: "image/jpeg",
      });
      onCropped(out);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Adjust your photo</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div
            ref={stageRef}
            className="relative mx-auto select-none overflow-hidden bg-slate-100 cursor-grab active:cursor-grabbing"
            style={{ width: STAGE, height: STAGE }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {imgUrl && imgSize ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgUrl}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  width: imgSize.w * scale,
                  height: imgSize.h * scale,
                  left: STAGE / 2 - (imgSize.w * scale) / 2 + clampedPan.x,
                  top: STAGE / 2 - (imgSize.h * scale) / 2 + clampedPan.y,
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              />
            ) : null}
            {/* Circle crop overlay */}
            <div className="pointer-events-none absolute inset-0">
              <svg viewBox={`0 0 ${STAGE} ${STAGE}`} className="h-full w-full">
                <defs>
                  <mask id="crop-mask">
                    <rect width={STAGE} height={STAGE} fill="white" />
                    <circle cx={STAGE / 2} cy={STAGE / 2} r={STAGE / 2 - 1} fill="black" />
                  </mask>
                </defs>
                <rect width={STAGE} height={STAGE} fill="rgba(15,23,42,0.6)" mask="url(#crop-mask)" />
                <circle
                  cx={STAGE / 2}
                  cy={STAGE / 2}
                  r={STAGE / 2 - 1}
                  fill="none"
                  stroke="white"
                  strokeWidth={1.5}
                />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-brand-600"
            />
          </div>

          <p className="text-[11px] text-slate-500">Below 1 MB</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="rounded-md border border-red-300 text-red-700 bg-white hover:bg-red-50 px-3 py-1.5 text-xs font-medium disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={exportCrop}
            disabled={exporting || !imgSize}
            className="rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-60"
          >
            {exporting ? "Saving…" : "Save photo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function compressToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  // Try descending quality until under MAX_BYTES.
  const qualities = [0.92, 0.85, 0.78, 0.7, 0.6, 0.5, 0.4];
  for (const q of qualities) {
    const blob = await canvasToBlob(canvas, "image/jpeg", q);
    if (blob.size <= MAX_BYTES) return blob;
  }
  // Last resort: most aggressive.
  return canvasToBlob(canvas, "image/jpeg", 0.3);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      type,
      quality,
    );
  });
}

function replaceExt(name: string, newExt: string): string {
  return name.replace(/\.[^./\\]+$/, "") + "." + newExt;
}
