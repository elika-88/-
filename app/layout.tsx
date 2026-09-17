import type { Metadata } from "next";
import "./globals.css";
import { SettingsProvider } from "@/lib/i18n/SettingsContext";

export const metadata: Metadata = {
  title: "Lumina | Lecture Study Materials",
  description: "Lecture study workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
