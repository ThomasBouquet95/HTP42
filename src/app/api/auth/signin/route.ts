import { NextResponse } from "next/server";
import { createOAuthStateToken } from "@/lib/auth";
import { env } from "@/lib/env";

const OAUTH_COOKIE = "htp42_oauth";

function randomUrlSafe(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < buf.length; i += 1) s += String.fromCharCode(buf[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  let s = "";
  const view = new Uint8Array(digest);
  for (let i = 0; i < view.length; i += 1) s += String.fromCharCode(view[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(request: Request) {
  const { tenantId, clientId } = env.azure;

  const state = randomUrlSafe(24);
  const verifier = randomUrlSafe(48);
  const challenge = await sha256Base64Url(verifier);

  // Optional return path after a successful sign-in.
  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  const stateToken = await createOAuthStateToken({ state, verifier, returnTo });

  const authorize = new URL(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
  );
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", `${env.appUrl}/api/auth/callback`);
  authorize.searchParams.set("response_mode", "query");
  authorize.searchParams.set("scope", "openid profile email User.Read");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  // Always show the account chooser so the user can pick the right identity.
  authorize.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set(OAUTH_COOKIE, stateToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });
  return res;
}

function sanitizeReturnTo(raw: string | null): string | undefined {
  if (!raw) return undefined;
  // Only allow absolute-path URLs on this app; reject anything with a host.
  if (!raw.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw;
}
