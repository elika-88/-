import type { Metadata } from "next";
import { StudyWorkspace } from "@/components/StudyWorkspace";

export const metadata: Metadata = { title: "Exam prep | Lumina" };

export default function PrepPage() {
  return <StudyWorkspace prep={{ exam: null }} />;
}
