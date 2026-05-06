// Client-safe session shape + pure helpers. Keep this file free of any
// server-only imports (next/headers, Airtable SDK, Node APIs) so client
// components can import it.

export type SessionPayload = {
  sub: string; // Network Members record ID
  memberCode: string;
  email: string;
  fullName: string;
  role: string; // "Admin" gates admin UI; empty/other = regular member
  photoUrl?: string | null; // optional Airtable photo URL for the header avatar
};

export function isAdmin(session: SessionPayload | null | undefined): boolean {
  return !!session && session.role === "Admin";
}
