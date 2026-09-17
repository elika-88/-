import { redirect } from "next/navigation";

export default function ResultsPage() {
  // The single workspace restores the last saved lecture and its study materials.
  redirect("/");
}
