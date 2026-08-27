// Currency conversion helpers for payments. Kept dependency-free so both the
// server (airtable writes) and client (charts, CSV export) can import it.

// Fallback FX rates (foreign currency -> EUR) used ONLY when a payment has a
// foreign-currency amount but no per-row rate stored. Keeps the EUR value from
// ever being left blank. Adjust here if the desk rate drifts materially.
export const DEFAULT_FX_TO_EUR: Record<string, number> = {
  USD: 0.92,
  CHF: 1.04,
};

export type EurInputs = {
  currency: string; // "EUR" | "USD" | "CHF" | ""
  value: number | null;
  fx: number | null;
};

// Resolve the FX rate + EUR value that should be STORED on a payment. EUR (or
// an unset currency) always normalizes to rate 1; a foreign currency uses the
// provided rate, else a default desk rate. This guarantees the stored EUR value
// is never blank when there is an amount, so exports/pivots and the cockpit
// always agree.
export function resolvePaymentEur({ currency, value, fx }: EurInputs): {
  fxRateToEur: number | null;
  invoiceValueEur: number | null;
} {
  const isEur = currency === "EUR" || currency === "";
  if (value == null) {
    return { fxRateToEur: isEur ? 1 : fx ?? null, invoiceValueEur: null };
  }
  if (isEur) return { fxRateToEur: 1, invoiceValueEur: value };
  const rate = fx ?? DEFAULT_FX_TO_EUR[currency] ?? 1;
  return { fxRateToEur: rate, invoiceValueEur: value * rate };
}

// The EUR contract value of a project ("Commercials" = Total amount): the
// stored Total Amount EUR when present, otherwise derived from the amount +
// currency + FX the same way payments are, so a project whose EUR field was
// never computed still shows its contract instead of reading as "no contract".
// Returns null only when there is no amount at all.
export function effectiveProjectEur(p: {
  totalAmountEur: number | null;
  totalAmount: number | null;
  currency: string;
  fxToEur: number | null;
}): number | null {
  if (p.totalAmountEur != null) return p.totalAmountEur;
  const { invoiceValueEur } = resolvePaymentEur({ currency: p.currency, value: p.totalAmount, fx: p.fxToEur });
  return invoiceValueEur;
}

// The EUR amount a payment contributes to charts/totals: the stored value when
// present, otherwise derived the same way we would store it, so rows saved
// before the write-time normalization still count instead of vanishing.
export function effectiveEur(p: {
  invoiceValueEur: number | null;
  invoiceValue: number | null;
  invoiceCurrency: string;
  fxRateToEur: number | null;
}): number {
  if (p.invoiceValueEur != null) return p.invoiceValueEur;
  const { invoiceValueEur } = resolvePaymentEur({
    currency: p.invoiceCurrency,
    value: p.invoiceValue,
    fx: p.fxRateToEur,
  });
  return invoiceValueEur ?? 0;
}
