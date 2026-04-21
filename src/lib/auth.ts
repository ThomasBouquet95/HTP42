import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { findActiveMemberByEmail, type MemberRecord } from "./airtable";

const SESSION_COOKIE = "htp42_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MAGIC_TTL_SECONDS = 60 * 15; // 15 minutes

const secret = () => new TextEncoder().encode(env.authSecret);

export type SessionPayload = {
  sub: string; // Network Members record ID
  memberCode: string;
  email: string;
  fullName: string;
};

export type MagicPayload = {
  kind: "magic";
  email: string;
};

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

export async function createMagicToken(email: string): Promise<string> {
  return sign({ kind: "magic", email: email.trim().toLowerCase() } satisfies MagicPayload, MAGIC_TTL_SECONDS);
}

export async function verifyMagicToken(token: string): Promise<MagicPayload | null> {
  const payload = await verify<MagicPayload & { kind?: string }>(token);
  if (!payload || payload.kind !== "magic" || !payload.email) return null;
  return { kind: "magic", email: payload.email };
}

export async function startSession(member: MemberRecord): Promise<void> {
  const token = await sign(
    {
      sub: member.id,
      memberCode: member.memberCode,
      email: member.email,
      fullName: member.fullName,
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
  return payload;
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
