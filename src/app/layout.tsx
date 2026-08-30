import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "FRAME — AI creative studio", description: "Turn a brief into original creative direction and a production-ready visual treatment." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
