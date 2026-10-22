import type { Metadata } from "next";
import { Barlow_Condensed, Saira_Stencil_One } from "next/font/google";
import "./globals.css";

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});
const saira = Saira_Stencil_One({
  variable: "--font-saira",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Builder Society",
  description: "Members-only Builder Society leaderboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${barlow.variable} ${saira.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
