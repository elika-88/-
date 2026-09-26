import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudyWorkspace } from "@/components/StudyWorkspace";
import { EXAMS, EXAM_IDS, isExamId } from "@/lib/prep/exams";

export function generateStaticParams() {
  return EXAM_IDS.map((exam) => ({ exam }));
}

export async function generateMetadata({ params }: { params: Promise<{ exam: string }> }): Promise<Metadata> {
  const { exam } = await params;
  return { title: isExamId(exam) ? `${EXAMS[exam].name} prep | Lumina` : "Exam prep | Lumina" };
}

export default async function ExamPrepPage({ params }: { params: Promise<{ exam: string }> }) {
  const { exam } = await params;
  if (!isExamId(exam)) notFound();
  return <StudyWorkspace prep={{ exam }} />;
}
