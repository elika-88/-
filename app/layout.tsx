import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Lumina | Lecture Study Materials",
  description: "Lecture study workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
