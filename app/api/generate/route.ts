import { ERROR_HTTP_STATUS, type ErrorResponse, type GenerationError } from "@/lib/contracts/errors";
import { INPUT_LIMITS, validateGenerationInput } from "@/lib/input";
import { createOpenAIClient } from '@/lib/openai';
import { generateStudyKit, publicError } from '@/lib/ai/pipeline';
import { encodeGenerationEvent, type GenerationEvent } from '@/lib/contracts/generation';
import { getEncoding } from 'js-tiktoken';
import { DEFAULT_API_BASE_URL } from '@/lib/provider';
import { readStoredSettings } from '@/lib/server/admin-db';

export const runtime = "nodejs";
export const maxDuration = 300;
let tokenizer: ReturnType<typeof getEncoding> | undefined;

function errorResponse(error: GenerationError) {
  return Response.json({ error } satisfies ErrorResponse, {
    status: ERROR_HTTP_STATUS[error.code],
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return errorResponse({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json.", retryable: false });
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return errorResponse({ code: "INVALID_REQUEST", message: "Provide a JSON request body.", retryable: false });
  }

  let input: unknown;
  try {
    // Count received bytes instead of trusting a possibly absent Content-Length.
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > INPUT_LIMITS.maxRequestBytes) {
        await reader.cancel();
        return errorResponse({ code: "INPUT_TOO_LONG", message: "The request body exceeds 512 KiB.", retryable: false });
      }
      chunks.push(value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return errorResponse({ code: "INVALID_REQUEST", message: "The request must contain valid UTF-8 JSON.", retryable: false });
  } finally {
    reader.releaseLock();
  }

  const validation = validateGenerationInput(input);
  if (!validation.success) return errorResponse(validation.error);

  tokenizer ??= getEncoding('o200k_base');
  if (tokenizer.encode(validation.data.lecture).length > INPUT_LIMITS.maxInputTokens) {
    return errorResponse({ code: 'INPUT_TOO_LONG', message: 'The lecture exceeds 16,000 input tokens.', retryable: false });
  }
  // Public deployments only forward credentials to explicitly configured bases.
  if (process.env.NODE_ENV === 'production' && validation.data.provider) {
    let adminBase: string | undefined;
    try { adminBase = (await readStoredSettings())?.settings.baseURL; } catch { return errorResponse({ code: 'SERVER_CONFIG', message: 'Cannot read server configuration.', retryable: false }); }
    const allowed = [DEFAULT_API_BASE_URL, adminBase, process.env.OPENAI_BASE_URL, ...(process.env.ALLOWED_API_BASE_URLS ?? '').split(',')].filter(Boolean).map((url) => url!.trim().replace(/\/+$/, ''));
    if (!allowed.includes(validation.data.provider.baseURL)) return errorResponse({ code: 'INVALID_PROVIDER_CONFIG', message: 'This API base URL is not enabled by the server administrator.', retryable: false });
  }
  let connection: Awaited<ReturnType<typeof createOpenAIClient>>;
  try { connection = await createOpenAIClient(validation.data.provider); } catch {
    return errorResponse({ code: 'SERVER_CONFIG', message: 'Configure an API key, base URL and model before generating.', retryable: false });
  }
  const runId = crypto.randomUUID();
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  const timer = setTimeout(() => controller.abort(), 240_000);
  const cleanup = () => { clearTimeout(timer); request.signal.removeEventListener('abort', abort); };
  const failure = (error: unknown): GenerationError => controller.signal.aborted
    ? { code: 'TIMEOUT', message: 'Generation was cancelled or exceeded four minutes.', retryable: true } : publicError(error);
  // JSON mode is useful for simple frontends; the default preserves the NDJSON contract.
  if (request.headers.get('accept')?.includes('application/json')) {
    try {
      const result = await generateStudyKit(validation.data, connection, runId, controller.signal, () => {});
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return errorResponse(failure(error)); } finally { cleanup(); }
  }
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const emit = (event: GenerationEvent) => { if (!cancelled) streamController.enqueue(new TextEncoder().encode(encodeGenerationEvent(event))); };
      try {
        emit({ type: 'stage', runId, stage: 'validating' });
        const result = await generateStudyKit(validation.data, connection, runId, controller.signal, emit);
        emit({ type: 'stage', runId, stage: 'complete' });
        emit({ type: 'result', runId, data: result });
      } catch (error) { emit({ type: 'error', runId, error: failure(error) }); }
      finally { cleanup(); if (!cancelled) streamController.close(); }
    },
    cancel() { cancelled = true; controller.abort(); cleanup(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } });
}
