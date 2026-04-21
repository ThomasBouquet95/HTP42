import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HTP42 Portal",
  description: "HTP42 network member portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
