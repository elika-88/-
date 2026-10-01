import { StudyWorkspace } from "@/components/StudyWorkspace";
import { backgroundGenerationEnabled } from "@/lib/server/generation-job-config";

// Read the server switch per request so toggling LUMINA_BACKGROUND_GENERATION needs no rebuild.
export const dynamic = "force-dynamic";

export default function Home() {
  return <StudyWorkspace backgroundJobs={backgroundGenerationEnabled()} />;
}
