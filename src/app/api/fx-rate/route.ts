import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

// Fetches the latest FX rate from `currency` to EUR using a free public API.
// Returns { rate: number } where 1 unit of `currency` = `rate` EUR.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(request.url);
  const code = (url.searchParams.get("currency") ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return NextResponse.json({ error: "Invalid currency code." }, { status: 400 });
  }
  if (code === "EUR") {
    return NextResponse.json({ rate: 1 });
  }

  try {
    // open.er-api.com is keyless and CORS-friendly; base USD is the most up-to-date.
    // We compute (currency → EUR) = (1/rate[USD→currency]) * rate[USD→EUR].
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates) {
      throw new Error("Upstream returned no rates");
    }
    const rEur = data.rates["EUR"];
    const rCcy = data.rates[code];
    if (typeof rEur !== "number" || typeof rCcy !== "number" || rCcy === 0) {
      return NextResponse.json({ error: "Currency not supported." }, { status: 404 });
    }
    const rate = rEur / rCcy;
    return NextResponse.json({ rate: Math.round(rate * 100) / 100 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed." },
      { status: 502 },
    );
  }
}
