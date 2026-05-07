import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { revalidateMember, startSession, verifyOAuthStateToken } from "@/lib/auth";
import { recordSignIn } from "@/lib/airtable";
import { env } from "@/lib/env";

const OAUTH_COOKIE = "htp42_oauth";

// Microsoft's JWKS for the v2 endpoint. We pin this by tenant so the signer
// must match the same tenant we requested the token from.
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function jwks() {
  if (cachedJwks) return cachedJwks;
  cachedJwks = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${env.azure.tenantId}/discovery/v2.0/keys`),
  );
  return cachedJwks;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) return redirectWithError("invalid_or_expired");
  if (!code || !state) return redirectWithError("missing_token");

  // Pull and clear the state cookie in one pass.
  const cookieToken = request.headers
    .get("cookie")
    ?.split(/; */)
    .map((c) => c.split("="))
    .find((p) => p[0] === OAUTH_COOKIE)?.[1];
  if (!cookieToken) return redirectWithError("invalid_or_expired");

  const stateToken = await verifyOAuthStateToken(decodeURIComponent(cookieToken));
  if (!stateToken || stateToken.state !== state) {
    return redirectWithError("invalid_or_expired");
  }

  // Exchange authorization code for tokens.
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${env.azure.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.azure.clientId,
        client_secret: env.azure.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${env.appUrl}/api/auth/callback`,
        code_verifier: stateToken.verifier,
      }),
    },
  );

  if (!tokenRes.ok) {
    return redirectWithError("invalid_or_expired");
  }
  const tokenBody = (await tokenRes.json()) as {
    id_token?: string;
    access_token?: string;
  };
  if (!tokenBody.id_token) return redirectWithError("invalid_or_expired");

  // Verify the id_token signature and issuer/audience against our app.
  let claims: JWTPayload;
  try {
    const verified = await jwtVerify(tokenBody.id_token, jwks(), {
      issuer: `https://login.microsoftonline.com/${env.azure.tenantId}/v2.0`,
      audience: env.azure.clientId,
    });
    claims = verified.payload;
  } catch {
    return redirectWithError("invalid_or_expired");
  }

  // Extract the user's email. Microsoft may surface it under "email" or (for
  // work/school accounts) only via "preferred_username" / "upn".
  const email = extractEmail(claims);
  if (!email) return redirectWithError("not_active");

  const member = await revalidateMember(email);
  if (!member) return redirectWithError("not_active");

  await startSession(member);
  // Await the counter bump — on Vercel/serverless a fire-and-forget Promise
  // gets killed when the function returns, so logins were silently never
  // being recorded. Adds ~200ms to the redirect, which is fine.
  await recordSignIn(member.id);

  // Best-effort safe redirect to the requested returnTo; otherwise dashboard.
  const safeReturn =
    stateToken.returnTo && stateToken.returnTo.startsWith("/") && !stateToken.returnTo.startsWith("//")
      ? stateToken.returnTo
      : "/dashboard";

  const res = NextResponse.redirect(`${env.appUrl}${safeReturn}`);
  res.cookies.set(OAUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}

function extractEmail(claims: JWTPayload): string | null {
  const candidates = [
    (claims as { email?: unknown }).email,
    (claims as { preferred_username?: unknown }).preferred_username,
    (claims as { upn?: unknown }).upn,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.includes("@")) return c.trim().toLowerCase();
  }
  return null;
}

function redirectWithError(code: string): Response {
  return NextResponse.redirect(`${env.appUrl}/login?error=${encodeURIComponent(code)}`);
}
