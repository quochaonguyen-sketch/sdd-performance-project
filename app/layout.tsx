import type { Metadata } from "next";
import Script from "next/script";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./workspace.css";
import "./dashboard.css";
import "./realtime.css";
import "./navigation-motion.css";
import { IBM_Plex_Sans } from "next/font/google";
import { cn } from "@/lib/utils";

const plex = IBM_Plex_Sans({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });
const themeBootScript = `(()=>{try{const saved=localStorage.getItem("rider-ops-theme");const dark=saved? saved==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",dark);document.documentElement.dataset.theme=dark?"dark":"light"}catch{}})()`;

export const metadata: Metadata = {
  title: "SDD Operations | Khu vực 1–5",
  description: "Hệ thống quản lý và điều phối đội ngũ giao nhận Khu vực 1-5 SDD",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning className={cn("font-sans", plex.variable)}>
      <body>
        {children}
        <Script id="rider-ops-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </body>
    </html>
  );
}
