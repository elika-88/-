import type { Metadata } from "next";
import "@/app/globals.css";

const logo = "/ChatGPT_Image_2026%E5%B9%B49%E6%9C%8817%E6%97%A5_23_28_48_-_%E5%89%AF%E6%9C%AC-removebg-preview.png";

export const metadata: Metadata = {
  title: "Lumina | Lecture Study Materials",
  description: "Lecture study workspace",
  icons: {
    icon: { url: logo, type: "image/png" },
    apple: { url: logo, type: "image/png" },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
