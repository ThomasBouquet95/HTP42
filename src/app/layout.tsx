import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HTP42 Timesheets",
  description: "Consultant timesheet portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
