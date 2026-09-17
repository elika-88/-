import {
  ErrorResponseSchema,
  GENERATION_CONTENT_TYPE,
  GenerationEventSchema,
  type ErrorCode,
  type GenerateRequest,
  type GenerationEvent,
} from "@/lib/contracts/generation";
import type { StudyKit } from "@/lib/schemas/studyMaterials";

export type GenerationClientErrorCode = ErrorCode | "NETWORK_ERROR" | "INVALID_RESPONSE" | "STREAM_INTERRUPTED";

const messages: Record<GenerationClientErrorCode, string> = {
  INVALID_REQUEST: "The request could not be accepted. Check the lecture and try again.",
  INVALID_PROVIDER_CONFIG: "Check the custom API address, key, and model.",
  UNSUPPORTED_MEDIA_TYPE: "The server could not read this request format.",
  EMPTY_INPUT: "Enter lecture text before generating study materials.",
  INPUT_TOO_SHORT: "The lecture needs at least 80 words and 300 non-whitespace characters.",
  INPUT_TOO_LONG: "The lecture exceeds the supported input size.",
  INSUFFICIENT_CONTENT: "The lecture does not contain enough information to generate study materials.",
  SERVER_CONFIG: "Open API settings and check your API key, base URL, and model access.",
  RATE_LIMITED: "The AI service is busy. Try again later.",
  UPSTREAM_FAILURE: "The AI service could not complete the request.",
  MODEL_REFUSAL: "The AI service could not generate materials for this lecture.",
  INVALID_OUTPUT: "The AI response did not contain valid study materials.",
  VERIFICATION_FAILED: "The generated materials could not be verified against the lecture.",
  TIMEOUT: "Generation took too long. Try again later.",
  NOT_IMPLEMENTED: "The backend generation service is not available yet.",
  NETWORK_ERROR: "The server could not be reached. Check your connection and try again.",
  INVALID_RESPONSE: "The server returned an invalid response. No materials were saved.",
  STREAM_INTERRUPTED: "Generation ended before a complete result arrived. Try again.",
};

export class GenerationClientError extends Error {
  constructor(public readonly code: GenerationClientErrorCode, public readonly retryable: boolean) {
    super(messages[code]);
    this.name = "GenerationClientError";
  }
}

export interface GenerationRequestOptions {
  signal: AbortSignal;
  onEvent?: (event: GenerationEvent) => void;
  fetcher?: typeof fetch;
}

const MAX_EVENT_CHARACTERS = 2 * 1024 * 1024;
const MAX_STREAM_BYTES = 8 * 1024 * 1024;
const MAX_ERROR_BYTES = 64 * 1024;
const MAX_EVENTS = 512;

function invalidResponse(): GenerationClientError {
  return new GenerationClientError("INVALID_RESPONSE", false);
}

function abortError(): DOMException {
  return new DOMException("Generation canceled.", "AbortError");
}

export async function requestGeneration(
  request: GenerateRequest,
  { signal, onEvent, fetcher = fetch }: GenerationRequestOptions,
): Promise<StudyKit> {
  if (signal.aborted) throw abortError();
  const submittedLecture = request.lecture;

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let ended = false;
  let canceled = false;
  const cancelReader = () => {
    if (!reader || canceled || ended) return;
    canceled = true;
    void reader.cancel().catch(() => undefined);
  };
  let rejectAbort: (error: DOMException) => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    cancelReader();
    rejectAbort(abortError());
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    let response: Response;
    try {
      const pendingResponse = fetcher("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: GENERATION_CONTENT_TYPE },
        body: JSON.stringify(request),
        signal,
        cache: "no-store",
      }).then((value) => {
        if (signal.aborted) {
          void value.body?.cancel().catch(() => undefined);
          throw abortError();
        }
        return value;
      });
      response = await Promise.race([pendingResponse, aborted]);
    } catch {
      if (signal.aborted) throw abortError();
      throw new GenerationClientError("NETWORK_ERROR", true);
    }

    if (!response.body) throw invalidResponse();
    reader = response.body.getReader();
    if (signal.aborted) throw abortError();

    const read = async () => {
      try {
        return await Promise.race([reader!.read(), aborted]);
      } catch {
        if (signal.aborted) throw abortError();
        throw new GenerationClientError("STREAM_INTERRUPTED", true);
      }
    };
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const decode = (bytes?: Uint8Array, stream = false) => {
      try {
        return decoder.decode(bytes, { stream });
      } catch {
        throw invalidResponse();
      }
    };

    if (!response.ok) {
      let errorText = "";
      let errorBytes = 0;
      while (true) {
        const { value, done } = await read();
        if (done) { ended = true; break; }
        errorBytes += value.byteLength;
        if (errorBytes > MAX_ERROR_BYTES) throw invalidResponse();
        errorText += decode(value, true);
      }
      errorText += decode();
      let payload: unknown;
      try { payload = JSON.parse(errorText); } catch { throw invalidResponse(); }
      const parsed = ErrorResponseSchema.safeParse(payload);
      if (!parsed.success) throw invalidResponse();
      throw new GenerationClientError(parsed.data.error.code, parsed.data.error.retryable);
    }

    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== GENERATION_CONTENT_TYPE) throw invalidResponse();

    let buffer = "";
    let totalBytes = 0;
    let eventCount = 0;
    let runId: string | undefined;
    let terminal: Extract<GenerationEvent, { type: "result" | "error" }> | undefined;
    const consume = (line: string) => {
      if (signal.aborted) throw abortError();
      if (!line.trim()) return;
      if (line.length > MAX_EVENT_CHARACTERS || ++eventCount > MAX_EVENTS || terminal) throw invalidResponse();
      let value: unknown;
      try { value = JSON.parse(line); } catch { throw invalidResponse(); }
      const parsed = GenerationEventSchema.safeParse(value);
      if (!parsed.success) throw invalidResponse();
      const event = parsed.data;
      if (runId && event.runId !== runId) throw invalidResponse();
      runId = event.runId;
      if (event.type === "result") {
        if (event.data.source.text !== submittedLecture) throw invalidResponse();
        terminal = event;
      } else if (event.type === "error") {
        terminal = { ...event, error: { ...event.error, message: messages[event.error.code] } };
      } else {
        onEvent?.(event.type === "retry" ? { ...event, message: "Retrying the current generation stage." } : event);
      }
    };

    while (true) {
      const { value, done } = await read();
      if (done) {
        ended = true;
        buffer += decode();
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > MAX_STREAM_BYTES) throw invalidResponse();
      buffer += decode(value, true);
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
      if (buffer.length > MAX_EVENT_CHARACTERS) throw invalidResponse();
    }

    if (signal.aborted) throw abortError();
    // A terminal event is accepted only after EOF proves no later events exist.
    if (buffer.length || !terminal) throw new GenerationClientError("STREAM_INTERRUPTED", true);
    onEvent?.(terminal);
    if (signal.aborted) throw abortError();
    if (terminal.type === "error") {
      throw new GenerationClientError(terminal.error.code, terminal.error.retryable);
    }
    return terminal.data;
  } catch (error) {
    if (signal.aborted) throw abortError();
    if (error instanceof GenerationClientError) throw error;
    throw invalidResponse();
  } finally {
    signal.removeEventListener("abort", onAbort);
    cancelReader();
    reader?.releaseLock();
  }
}
