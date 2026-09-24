import type { Metadata } from "next";
import "./globals.css";
import "./motion.css";
import { SettingsProvider } from "@/lib/i18n/SettingsContext";
import { AuthProvider } from "@/components/auth/AuthProvider";

export const metadata: Metadata = {
  title: "Lumina | Lecture Study Materials",
  description: "Lecture study workspace",
  icons: {
    icon: "/brand/lumina-logo.png",
    apple: "/brand/lumina-logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <SettingsProvider><AuthProvider>{children}</AuthProvider></SettingsProvider>
      </body>
    </html>
  );
}
