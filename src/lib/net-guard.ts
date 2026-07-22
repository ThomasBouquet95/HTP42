import { lookup } from "node:dns/promises";

// SSRF guard for server-side fetches whose URL is influenced by user input
// (e.g. a payment's free-text invoice URL). We require https and refuse to
// connect to private / loopback / link-local addresses so the URL can't be
// pointed at internal infrastructure (cloud metadata, localhost admin ports,
// RFC-1918 hosts).

function isPrivateIp(ip: string): boolean {
  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    return false;
  }
  // IPv6 (normalized lower-case)
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true; // loopback / unspecified
  if (v6.startsWith("fe80")) return true; // link-local
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d)
  const mapped = v6.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return false;
}

// Validate a user-supplied URL is safe to fetch server-side. Returns an error
// string when it should be refused, or null when it's allowed.
export async function assertSafeFetchUrl(raw: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "URL is not valid.";
  }
  if (url.protocol !== "https:") return "Only https URLs are allowed.";
  const host = url.hostname;
  // A literal IP host: check it directly.
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (isPrivateIp(host.replace(/^\[|\]$/g, ""))) return "URL resolves to a private address.";
    return null;
  }
  // Otherwise resolve DNS and refuse if ANY answer is private (defends against
  // DNS-rebinding-style records that point at internal ranges).
  try {
    const answers = await lookup(host, { all: true });
    if (answers.some((a) => isPrivateIp(a.address))) {
      return "URL resolves to a private address.";
    }
  } catch {
    return "URL host could not be resolved.";
  }
  return null;
}
