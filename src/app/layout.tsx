import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Frame — Concept-led storyboards for 30-second ads", description: "Turn your product, audience, and single-minded proposition into one coherent six-shot commercial." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
