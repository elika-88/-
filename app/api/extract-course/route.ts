import { CourseExtractionError, COURSE_FILE_LIMITS, extractCourseFile, extractYouTubeTranscript } from "@/lib/server/course-extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

function response(message: string, status: 400 | 413 | 415 | 422 | 502) {
  return Response.json({ error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > COURSE_FILE_LIMITS.maxBytes + 64 * 1024) {
    return response("Files must be 15 MB or smaller.", 413);
  }
  let form: FormData;
  try { form = await request.formData(); }
  catch { return response("Send a course file or a YouTube link.", 400); }

  try {
    const sourceUrl = form.get("youtubeUrl");
    if (typeof sourceUrl === "string" && sourceUrl.trim()) return Response.json(await extractYouTubeTranscript(sourceUrl, form.get("debug") === "1"), { headers: { "Cache-Control": "no-store" } });
    const file = form.get("file");
    if (!(file instanceof File)) return response("Choose a course file or paste a YouTube link.", 400);
    return Response.json(await extractCourseFile(file), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CourseExtractionError) return response(error.message, error.status);
    return response("Course content could not be extracted. Try another file or link.", 502);
  }
}
