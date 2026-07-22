import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HTP42 Portal",
  description: "HTP42 network member portal",
};

// Mobile foundations: device-width viewport with `viewport-fit=cover` so the
// page can extend under the iPhone notch/home-indicator while our safe-area
// padding keeps content clear of them. `maximumScale` is intentionally left
// unset so pinch-zoom stays available (accessibility) — the iOS focus-zoom is
// prevented instead by the 16px control font in globals.css.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
