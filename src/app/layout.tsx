import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { THEME_COLORS } from "@/lib/theme";
import { THEME_INIT_SCRIPT } from "@/lib/theme-bootstrap";

import "./globals.css";

export const metadata: Metadata = {
  title: "家の在庫",
  description: "家族みんなで使える、シンプルな家庭用在庫管理アプリ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content={THEME_COLORS.light} suppressHydrationWarning />
        <script id="theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
