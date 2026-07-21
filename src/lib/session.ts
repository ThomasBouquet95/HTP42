// Client-safe session shape + pure helpers. Keep this file free of any
// server-only imports (next/headers, Airtable SDK, Node APIs) so client
// components can import it.

export type SessionPayload = {
  sub: string; // Network Members record ID
  memberCode: string;
  email: string;
  fullName: string;
  role: string; // a partner/ops role gates admin UI; expert/support/empty = member
  photoUrl?: string | null; // optional Airtable photo URL for the header avatar
};

// Roles with admin-panel access. Kept inline here (not imported from airtable)
// so this stays client-safe; mirrors ADMIN_ROLES in src/lib/airtable.ts.
// "Admin" is a legacy value accepted for access only during the role
// migration — existing admin JWT cookies and not-yet-migrated records keep
// working until they re-login / the migration runs. It's intentionally NOT in
// MEMBER_ROLES, so it can't be picked for a new/edited member.
// Roles that may open the admin panel. Project Manager, Network Expert and
// Support are normal users — they never see the Admin tab or reach /admin.
export const ADMIN_ACCESS_ROLES = [
  "Managing Partner",
  "Operating Partner",
  "Associate Partner",
  "Network Operations",
  "Admin",
] as const;

export function isAdminRoleName(role: string | null | undefined): boolean {
  return !!role && (ADMIN_ACCESS_ROLES as readonly string[]).includes(role);
}

export function isAdmin(session: SessionPayload | null | undefined): boolean {
  return !!session && isAdminRoleName(session.role);
}
