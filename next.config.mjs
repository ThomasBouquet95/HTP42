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
};

export default nextConfig;
