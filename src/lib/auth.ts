import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { findActiveMemberByEmail, type MemberRecord } from "./airtable";
import { isAdmin, isAdminRoleName, type SessionPayload } from "./session";

const SESSION_COOKIE = "htp42_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const OAUTH_STATE_TTL_SECONDS = 60 * 10; // 10 minutes

const secret = () => new TextEncoder().encode(env.authSecret);

export { isAdmin };
export type { SessionPayload };

async function sign(payload: object, ttlSeconds: number): Promise<string> {
  return await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secret());
}

async function verify<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OAuth / OIDC state token (carries CSRF state + PKCE verifier + returnTo)
// ---------------------------------------------------------------------------

export type OAuthStatePayload = {
  kind: "oauth";
  state: string;
  verifier: string;
  returnTo?: string;
};

export async function createOAuthStateToken(
  payload: Omit<OAuthStatePayload, "kind">,
): Promise<string> {
  return sign({ kind: "oauth", ...payload } satisfies OAuthStatePayload, OAUTH_STATE_TTL_SECONDS);
}

export async function verifyOAuthStateToken(token: string): Promise<OAuthStatePayload | null> {
  const payload = await verify<OAuthStatePayload & { kind?: string }>(token);
  if (!payload || payload.kind !== "oauth" || !payload.state || !payload.verifier) return null;
  return {
    kind: "oauth",
    state: payload.state,
    verifier: payload.verifier,
    returnTo: typeof payload.returnTo === "string" ? payload.returnTo : undefined,
  };
}

// ---------------------------------------------------------------------------
// Session cookie (set after a successful SSO callback)
// ---------------------------------------------------------------------------

export async function startSession(member: MemberRecord): Promise<void> {
  const token = await sign(
    {
      sub: member.id,
      memberCode: member.memberCode,
      email: member.email,
      fullName: member.fullName,
      role: member.role || "",
      photoUrl: member.photo?.url ?? null,
    } satisfies SessionPayload,
    SESSION_TTL_SECONDS,
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verify<SessionPayload>(token);
  if (!payload?.memberCode || !payload.sub) return null;
  // Older sessions (pre-role) won't have role set. Treat as empty string.
  return { ...payload, role: payload.role ?? "" };
}

// Server-side admin re-verification: trust the JWT claim AND also re-check the
// live Airtable role so a demoted member loses access even before their
// cookie expires. Callers get null if the session isn't admin or has lapsed.
export async function requireAdminSession(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  if (!isAdminRoleName(session.role)) return null;
  // Re-check the LIVE Airtable role so a demoted member loses access before
  // their cookie expires.
  const member = await findActiveMemberByEmail(session.email);
  if (!member) return null;
  if (!isAdminRoleName(member.role)) return null;
  return { ...session, role: member.role };
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

// Re-check that the email still matches an active member before granting access.
export async function revalidateMember(email: string): Promise<MemberRecord | null> {
  return findActiveMemberByEmail(email);
}
