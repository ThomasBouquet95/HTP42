import { NextResponse } from "next/server";
import { ZodError } from "zod";

// Central place to turn raw errors (Airtable client throws, zod validation,
// network blips, unknown) into a message a human can actually act on. The old
// behavior across the app was to swallow these into "Save failed." / "Delete
// failed." — which tells the user nothing about what to fix. This keeps the
// specific cause and, where we recognise it, adds a hint on how to resolve it.

// The `airtable` npm client throws plain objects shaped like
// { error: "INVALID_VALUE_FOR_COLUMN", message: "…", statusCode: 422 }.
type AirtableLikeError = {
  error?: string;
  message?: string;
  statusCode?: number;
};

function asAirtableError(e: unknown): AirtableLikeError | null {
  if (!e || typeof e !== "object") return null;
  const o = e as Record<string, unknown>;
  const hasCode = typeof o.statusCode === "number";
  const hasType = typeof o.error === "string";
  if (!hasCode && !hasType) return null;
  return {
    error: typeof o.error === "string" ? o.error : undefined,
    message: typeof o.message === "string" ? o.message : undefined,
    statusCode: typeof o.statusCode === "number" ? o.statusCode : undefined,
  };
}

// Format a zod error naming the first offending field, e.g.
// "Amount: expected a number." rather than a raw enum dump.
export function zodMessage(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "The information provided isn't valid.";
  const path = issue.path.filter((p) => typeof p === "string").join(".");
  const label = path ? `${path}: ${issue.message}` : issue.message;
  // Zod's default enum message is noisy; keep it but trim the option list a bit.
  return label.replace(/\|/g, ", ");
}

/**
 * Turn any thrown value into a clear, actionable message.
 *
 * @param e        The caught error.
 * @param action   What the user was trying to do, e.g. "save the member".
 *                 Used to frame otherwise-opaque failures.
 */
export function humanizeError(e: unknown, action?: string): string {
  const doing = action ? ` while trying to ${action}` : "";

  if (e instanceof ZodError) return zodMessage(e);

  const at = asAirtableError(e);
  if (at) {
    const raw = (at.message ?? "").trim();
    switch (at.statusCode) {
      case 422:
        // Airtable's message usually names the exact field/value, keep it.
        return raw
          ? `Airtable rejected the value: ${raw}`
          : `Airtable rejected one of the values${doing}. Check the fields and try again.`;
      case 404:
        return `That record no longer exists${doing}. It may have been deleted, so refresh and try again.`;
      case 403:
        return `The app doesn't have permission to make this change in Airtable${doing}. Check the API token's scopes.`;
      case 401:
        return `Airtable rejected the connection (authentication). The API token may be expired or missing.`;
      case 429:
        return `Airtable is rate-limiting requests right now. Wait a few seconds and try again.`;
      case 402:
        return `This action hit an Airtable plan limit${doing}.`;
      case 500:
      case 502:
      case 503:
        return `Airtable is temporarily unavailable. Wait a moment and try again.`;
      default:
        if (raw) return raw;
    }
  }

  // Network-level failures from fetch (FX rate, Graph email, etc.).
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|network|ENOTFOUND/i.test(msg)) {
    return `Couldn't reach the server${doing}. Check the connection and try again.`;
  }

  if (msg) return msg;
  return action
    ? `Something went wrong ${action}. Please try again.`
    : "Something went wrong. Please try again.";
}

// Pick a sensible HTTP status for an API response from the underlying error.
function statusFor(e: unknown): number {
  if (e instanceof ZodError) return 400;
  const at = asAirtableError(e);
  if (at?.statusCode) {
    // Map Airtable's 422 (bad value) to 400 for our callers; pass through the
    // rest, defaulting anything unexpected to 502 (upstream failure).
    if (at.statusCode === 422) return 400;
    if ([400, 401, 403, 404, 409, 429].includes(at.statusCode)) return at.statusCode;
    return 502;
  }
  return 500;
}

/**
 * Build a JSON error response for an API route from a caught error, logging the
 * raw error server-side and returning a humanized message to the client.
 *
 * Usage:
 *   try { ... } catch (e) { return apiError(e, "save the member"); }
 */
export function apiError(e: unknown, action?: string): NextResponse {
  console.error(action ? `Failed to ${action}:` : "Request failed:", e);
  return NextResponse.json({ error: humanizeError(e, action) }, { status: statusFor(e) });
}
