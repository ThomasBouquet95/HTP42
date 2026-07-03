"use client";

import { useState } from "react";

// 0–5 star rating with 0.5 increments. Each star is two half-width hit zones.
// value is the numeric rating (null = unrated). Read-only mode just renders.
export function StarRating({
  value,
  onChange,
  readOnly,
  size = 24,
}: {
  value: number | null;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex" role={readOnly ? undefined : "radiogroup"} aria-label="Rating">
        {[1, 2, 3, 4, 5].map((star) => {
          const full = shown >= star;
          const half = !full && shown >= star - 0.5;
          return (
            <span key={star} className="relative inline-block" style={{ width: size, height: size }}>
              <StarSvg fill={full ? "full" : half ? "half" : "empty"} size={size} />
              {!readOnly ? (
                <>
                  <button
                    type="button"
                    aria-label={`${star - 0.5} stars`}
                    onClick={() => onChange?.(star - 0.5)}
                    onMouseEnter={() => setHover(star - 0.5)}
                    onMouseLeave={() => setHover(null)}
                    className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
                    style={{ background: "transparent" }}
                  />
                  <button
                    type="button"
                    aria-label={`${star} stars`}
                    onClick={() => onChange?.(star)}
                    onMouseEnter={() => setHover(star)}
                    onMouseLeave={() => setHover(null)}
                    className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
                    style={{ background: "transparent" }}
                  />
                </>
              ) : null}
            </span>
          );
        })}
      </span>
      <span className="text-xs tabular-nums text-slate-500">
        {value == null ? "—" : value.toFixed(1)}
      </span>
    </span>
  );
}

function StarSvg({ fill, size }: { fill: "full" | "half" | "empty"; size: number }) {
  const gradId = `half-${Math.round(size)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="block" aria-hidden>
      {fill === "half" ? (
        <defs>
          <linearGradient id={gradId}>
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>
      ) : null}
      <path
        d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.9 6.19 20.9l1.11-6.47-4.7-4.58 6.5-.95z"
        fill={fill === "full" ? "#f59e0b" : fill === "half" ? `url(#${gradId})` : "#e2e8f0"}
        stroke="#f59e0b"
        strokeWidth="0.75"
      />
    </svg>
  );
}
