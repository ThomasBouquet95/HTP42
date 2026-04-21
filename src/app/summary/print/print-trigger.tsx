"use client";

import { useEffect } from "react";

export function PrintTrigger() {
  useEffect(() => {
    const btn = document.getElementById("trigger-print");
    const onClick = () => window.print();
    btn?.addEventListener("click", onClick);
    // Auto-open the print dialog shortly after load so "Export PDF" feels instant.
    const t = window.setTimeout(() => window.print(), 400);
    return () => {
      btn?.removeEventListener("click", onClick);
      window.clearTimeout(t);
    };
  }, []);
  return null;
}
