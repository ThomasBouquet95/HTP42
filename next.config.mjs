/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfkit loads its built-in font metrics (Helvetica.afm, …) from disk at
  // runtime via paths relative to its own package. Bundling it with webpack
  // breaks that lookup, so keep it external and force its data files into the
  // serverless trace so the .afm metrics ship to Vercel — otherwise the PDF
  // routes throw ENOENT → 500.
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/pdfkit/js/data/**/*"],
  },
  // Baseline security headers. Static (no per-request work). We deliberately
  // do NOT set a Content-Security-Policy here: the app renders Airtable-hosted
  // images/attachments from arbitrary URLs, so a `default-src 'self'` policy
  // would break member photos and document links — clickjacking is already
  // covered by X-Frame-Options: DENY.
  async headers() {
    const baseline = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
    ];
    return [
      { source: "/:path*", headers: baseline },
      // The public magic-link pages carry a token in the URL. Send no Referer
      // at all so the token can never leak to any off-site resource.
      { source: "/timesheet-review/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/survey/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
