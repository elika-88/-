import type { Metadata } from "next";
import { StudyWorkspace } from "@/components/StudyWorkspace";

export const metadata: Metadata = { title: "Plans | Lumina" };

export default function PricingPage() {
  return <StudyWorkspace pricing />;
}
