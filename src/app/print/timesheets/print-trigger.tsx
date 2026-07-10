"use client";

import { useEffect } from "react";

export function PrintTrigger({ title }: { title?: string }) {
  useEffect(() => {
    // The browser's Save-as-PDF dialog seeds the filename from document.title,
    // so name the document meaningfully (e.g. htp42-timesheets-QUH-2026-01-…).
    if (title) document.title = title;
    const btn = document.getElementById("trigger-print");
    const onClick = () => window.print();
    btn?.addEventListener("click", onClick);
    // Auto-open the print dialog shortly after load so it feels instant.
    const t = window.setTimeout(() => window.print(), 400);
    return () => {
      btn?.removeEventListener("click", onClick);
      window.clearTimeout(t);
    };
  }, [title]);
  return null;
}
