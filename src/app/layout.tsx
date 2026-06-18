import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flight Sniper — cheapest round trips from Israel",
  description: "The cheapest round-trip flights from Israel to anywhere, scanned automatically.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
