import { timingSafeEqual } from "node:crypto";

// Constant-time check of the `Authorization: Bearer <CRON_SECRET>` header used
// by the Vercel cron endpoints. Node-runtime only (uses node:crypto), so it's
// imported by the cron route handlers, not the Edge middleware.
export function cronSecretMatches(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  // Length is not itself secret; bail early on mismatch so timingSafeEqual gets
  // equal-length buffers (it throws otherwise).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
