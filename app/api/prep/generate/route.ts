import { ERROR_HTTP_STATUS, type ErrorResponse, type GenerationError } from "@/lib/contracts/errors";
import { createOpenAIClient } from "@/lib/openai";
import { publicError } from "@/lib/ai/pipeline";
import { PASSAGE_LIMITS } from "@/lib/prep/exams";
import { PrepGenerateRequestSchema } from "@/lib/prep/schema";
import { generateReadingSet } from "@/lib/server/prep-generation";

export const runtime = "nodejs";
export const maxDuration = 180;
const MAX_BODY_BYTES = 64 * 1024;

function errorResponse(error: GenerationError) {
  return Response.json({ error } satisfies ErrorResponse, { status: ERROR_HTTP_STATUS[error.code], headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return errorResponse({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json.", retryable: false });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return errorResponse({ code: "INPUT_TOO_LONG", message: "The request is too large.", retryable: false });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return errorResponse({ code: "INVALID_REQUEST", message: "The request must be valid JSON.", retryable: false }); }

  const parsed = PrepGenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    const passage = typeof body === "object" && body !== null && "passage" in body && typeof body.passage === "string" ? body.passage.trim() : "";
    if (passage.length < PASSAGE_LIMITS.minCharacters) return errorResponse({ code: "INPUT_TOO_SHORT", message: `Paste a passage of at least ${PASSAGE_LIMITS.minCharacters} characters.`, retryable: false });
    if (passage.length > PASSAGE_LIMITS.maxCharacters) return errorResponse({ code: "INPUT_TOO_LONG", message: `Keep the passage under ${PASSAGE_LIMITS.maxCharacters.toLocaleString("en-US")} characters.`, retryable: false });
    return errorResponse({ code: "INVALID_REQUEST", message: "Choose an exam and at least one question type.", retryable: false });
  }

  let connection: Awaited<ReturnType<typeof createOpenAIClient>>;
  try { connection = await createOpenAIClient(); } catch {
    return errorResponse({ code: "SERVER_CONFIG", message: "Configure an API key, base URL and model before generating.", retryable: false });
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 150_000);
  try {
    const set = await generateReadingSet(parsed.data, connection, controller.signal);
    return Response.json({ set }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(controller.signal.aborted ? { code: "TIMEOUT", message: "Generation was cancelled or took too long. Try again.", retryable: true } : publicError(error));
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
  }
}
