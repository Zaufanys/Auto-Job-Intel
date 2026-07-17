import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoJob Intel",
  description: "Verified automotive and technology job intelligence for early-career candidates.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
