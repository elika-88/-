import { ERROR_HTTP_STATUS, type ErrorResponse, type GenerationError } from "@/lib/contracts/errors";
import { createOpenAIClient } from "@/lib/openai";
import { publicError } from "@/lib/ai/pipeline";
import { PASSAGE_LIMITS } from "@/lib/prep/exams";
import { PrepGenerateRequestSchema, type PrepStreamEvent } from "@/lib/prep/schema";
import { generateReadingSet } from "@/lib/server/prep-generation";
import { assertAllowance, BillingError, recordUsage, resolveSubject, withAnonCookie, type Subject } from "@/lib/server/billing";

export const runtime = "nodejs";
export const maxDuration = 200;
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

  let subject: Subject;
  try {
    subject = await resolveSubject(request);
    await assertAllowance(subject, "prep", { questions: parsed.data.count });
  } catch (error) {
    if (error instanceof BillingError) return errorResponse({ code: error.code, message: error.message, retryable: false });
    return errorResponse({ code: "SERVER_CONFIG", message: "The usage service is unavailable. Try again shortly.", retryable: true });
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 170_000);
  const cleanup = () => { clearTimeout(timer); request.signal.removeEventListener("abort", abort); };
  const encoder = new TextEncoder();
  let closed = false;
  // NDJSON stream: stage events let the client show real progress with check marks.
  const stream = new ReadableStream<Uint8Array>({
    async start(output) {
      const send = (event: PrepStreamEvent) => { if (!closed) output.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
      try {
        send({ type: "stage", stage: "reading", attempt: 1 });
        const set = await generateReadingSet(parsed.data, connection, controller.signal, (stage, attempt) => send({ type: "stage", stage, attempt }));
        await recordUsage(subject, "prep").catch(() => undefined);
        send({ type: "stage", stage: "complete", attempt: 1 });
        send({ type: "result", set });
      } catch (error) {
        send({ type: "error", error: controller.signal.aborted ? { code: "TIMEOUT", message: "Generation was cancelled or took too long. Try again.", retryable: true } : publicError(error) });
      } finally {
        cleanup();
        if (!closed) { closed = true; output.close(); }
      }
    },
    cancel() { closed = true; controller.abort(); cleanup(); },
  });
  return withAnonCookie(new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } }), subject, request);
}
