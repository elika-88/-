import { describe, expect, it, vi } from "vitest";
import { GenerationClientError, requestGeneration } from "@/lib/client/generationStream";
import { GENERATION_CONTENT_TYPE, type GenerateRequest, type GenerationEvent } from "@/lib/contracts/generation";
import { studyKitFixture } from "@/tests/fixtures/studyKit";

const runId = studyKitFixture().runId;
const otherRunId = "3e37789a-d9d3-4539-b381-7b19db62e715";
const stage: GenerationEvent = { type: "stage", runId, stage: "analyzing" };
const result = () => ({ type: "result", runId, data: studyKitFixture() });
const request = (): GenerateRequest => ({ title: "", lecture: studyKitFixture().source.text, outputLanguage: "auto" });
const encoder = new TextEncoder();
const lines = (events: unknown[]) => events.map((event) => JSON.stringify(event) + "\n").join("");

function responseFromBytes(bytes: Uint8Array, chunkSize = bytes.length || 1, contentType = GENERATION_CONTENT_TYPE) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) controller.enqueue(bytes.slice(offset, offset + chunkSize));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": contentType } });
}

function generate(response: Response, extra: { signal?: AbortSignal; onEvent?: (event: GenerationEvent) => void } = {}, input = request()) {
  return requestGeneration(input, { signal: extra.signal ?? new AbortController().signal, fetcher: async () => response, onEvent: extra.onEvent });
}

describe("generation stream client", () => {
  it("posts the exact lecture and provider configuration to the same-origin endpoint", async () => {
    const input = { ...request(), provider: { apiKey: "test-only-secret", baseURL: "https://example.com/v1", model: "test-model" } };
    const signal = new AbortController().signal;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(responseFromBytes(encoder.encode(lines([stage, result()]))));
    await requestGeneration(input, { signal, fetcher });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: GENERATION_CONTENT_TYPE },
      body: JSON.stringify(input), signal, cache: "no-store",
    });
  });

  it.each([1, 7, 1024, 1_000_000])("decodes UTF-8 split across %i-byte chunks and multiple records", async (chunkSize) => {
    const event = result();
    event.data.lectureTitle = "Unicode \u8bfe\u7a0b \ud83d\udcda";
    const seen: GenerationEvent[] = [];
    const response = responseFromBytes(encoder.encode(lines([stage, { type: "stage", runId, stage: "complete" }, event])), chunkSize, "application/x-ndjson; charset=utf-8");
    await expect(generate(response, { onEvent: (item) => seen.push(item) })).resolves.toEqual(event.data);
    expect(seen.map((item) => item.type)).toEqual(["stage", "stage", "result"]);
    expect(response.body!.locked).toBe(false);
  });

  it("holds the result until the entire stream is validated", async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream({ start(controller) { streamController = controller; } }), { headers: { "Content-Type": GENERATION_CONTENT_TYPE } });
    const onEvent = vi.fn();
    const settled = vi.fn();
    const promise = generate(response, { onEvent }).then(settled);
    streamController.enqueue(encoder.encode(lines([stage, result()])));
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledExactlyOnceWith(stage));
    expect(settled).not.toHaveBeenCalled();
    streamController.close();
    await promise;
    expect(settled).toHaveBeenCalledExactlyOnceWith(studyKitFixture());
  });

  it.each([
    ["malformed JSON", "{broken}\n"],
    ["unknown event", lines([{ type: "unknown", runId }])],
    ["invalid event field", lines([{ ...stage, stage: "made-up" }])],
    ["changing runId", lines([stage, { ...result(), runId: otherRunId, data: { ...studyKitFixture(), runId: otherRunId } }])],
    ["mismatched result runId", lines([{ ...result(), runId: otherRunId }])],
    ["duplicate result", lines([result(), result()])],
    ["progress after result", lines([result(), stage])],
    ["error after result", lines([result(), { type: "error", runId, error: { code: "TIMEOUT", message: "late failure", retryable: true } }])],
    ["result after error", lines([{ type: "error", runId, error: { code: "TIMEOUT", message: "failure", retryable: true } }, result()])],
  ])("rejects %s without delivering a terminal event", async (_, text) => {
    const onEvent = vi.fn();
    await expect(generate(responseFromBytes(encoder.encode(text)), { onEvent })).rejects.toMatchObject({ code: "INVALID_RESPONSE", retryable: false });
    expect(onEvent.mock.calls.some(([event]) => event.type === "result" || event.type === "error")).toBe(false);
  });

  it.each(["", lines([stage]), lines([{ type: "stage", runId, stage: "complete" }]), JSON.stringify(result())])("rejects EOF without a complete terminal record", async (text) => {
    await expect(generate(responseFromBytes(encoder.encode(text)))).rejects.toMatchObject({ code: "STREAM_INTERRUPTED", retryable: true });
  });

  it("rejects materials generated for a different lecture", async () => {
    await expect(generate(responseFromBytes(encoder.encode(lines([result()]))), {}, { ...request(), lecture: "A different lecture." })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects malformed and truncated UTF-8", async () => {
    for (const bytes of [new Uint8Array([0xff, 10]), new Uint8Array([0xe4, 0xb8])]) {
      await expect(generate(responseFromBytes(bytes, 1))).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("rejects an unexpected successful response format", async () => {
    await expect(generate(Response.json(studyKitFixture()))).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("maps HTTP 501 to a typed safe message without exposing upstream text", async () => {
    const error = await generate(Response.json({ error: { code: "NOT_IMPLEMENTED", message: "secret-key-from-upstream", retryable: false } }, { status: 501 })).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(GenerationClientError);
    expect(error).toMatchObject({ code: "NOT_IMPLEMENTED", retryable: false });
    expect(String(error)).not.toContain("secret-key-from-upstream");
  });

  it("preserves retryability for a typed HTTP failure", async () => {
    await expect(generate(Response.json({ error: { code: "RATE_LIMITED", message: "upstream error", retryable: true } }, { status: 429 }))).rejects.toMatchObject({ code: "RATE_LIMITED", retryable: true });
  });

  it.each([
    new Response("private upstream details", { status: 502 }),
    Response.json({ error: { code: "UNKNOWN", message: "private details", retryable: true } }, { status: 502 }),
    new Response("x".repeat(64 * 1024 + 1), { status: 502 }),
  ])("rejects unknown or unbounded error bodies safely", async (response) => {
    await expect(generate(response)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("sanitizes retry notices and terminal stream errors", async () => {
    const retry = { type: "retry", runId, stage: "generating", attempt: 2, maxAttempts: 3, message: "secret-upstream-value" };
    const error = { type: "error", runId, error: { code: "UPSTREAM_FAILURE", message: "secret-upstream-value", retryable: true } };
    const onEvent = vi.fn();
    const failure = await generate(responseFromBytes(encoder.encode(lines([retry, error]))), { onEvent }).catch((caught: unknown) => caught);
    expect(failure).toMatchObject({ code: "UPSTREAM_FAILURE", retryable: true });
    expect(String(failure)).not.toContain("secret-upstream-value");
    expect(JSON.stringify(onEvent.mock.calls)).not.toContain("secret-upstream-value");
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it("limits incomplete records and event counts", async () => {
    await expect(generate(responseFromBytes(encoder.encode("x".repeat(2 * 1024 * 1024 + 1))))).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(generate(responseFromBytes(encoder.encode(lines(Array.from({ length: 513 }, () => stage)))))).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("maps fetch failures without disclosing exception messages", async () => {
    const error = await requestGeneration(request(), { signal: new AbortController().signal, fetcher: async () => { throw new Error("private network details"); } }).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: "NETWORK_ERROR", retryable: true });
    expect(String(error)).not.toContain("private network details");
  });

  it("reports a failed stream read and releases the reader", async () => {
    const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error("private read failure")); } }), { headers: { "Content-Type": GENERATION_CONTENT_TYPE } });
    await expect(generate(response)).rejects.toMatchObject({ code: "STREAM_INTERRUPTED", retryable: true });
    expect(response.body!.locked).toBe(false);
  });

  it("does not start a request when already aborted", async () => {
    const controller = new AbortController();
    controller.abort("private abort reason");
    const fetcher = vi.fn<typeof fetch>();
    await expect(requestGeneration(request(), { signal: controller.signal, fetcher })).rejects.toMatchObject({ name: "AbortError", message: "Generation canceled." });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("aborts a pending read, cancels the stream, and releases its lock promptly", async () => {
    const controller = new AbortController();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const response = new Response(new ReadableStream({ start(stream) { stream.enqueue(encoder.encode(lines([stage]))); }, cancel }), { headers: { "Content-Type": GENERATION_CONTENT_TYPE } });
    const onEvent = vi.fn();
    const pending = generate(response, { signal: controller.signal, onEvent });
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError", message: "Generation canceled." });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledOnce());
    controller.abort("private abort reason");
    await rejection;
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body!.locked).toBe(false);
  });

  it("aborts pending HTTP error bodies", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { status: 503 });
    const pending = generate(response, { signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(response.body!.locked).toBe(true));
    controller.abort();
    await rejection;
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("stops processing already buffered events as soon as the caller cancels", async () => {
    const controller = new AbortController();
    const onEvent = vi.fn(() => controller.abort());
    await expect(generate(responseFromBytes(encoder.encode(lines([stage, { ...stage, stage: "generating" }, result()]))), {
      signal: controller.signal, onEvent,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(onEvent).toHaveBeenCalledExactlyOnceWith(stage);
  });

  it("aborts a pending fetch and cancels a late response even when a fetcher ignores the signal", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    let resolveResponse!: (response: Response) => void;
    const pending = requestGeneration(request(), { signal: controller.signal, fetcher: () => new Promise((resolve) => { resolveResponse = resolve; }) });
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejection;
    resolveResponse(new Response(new ReadableStream({ cancel })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
});
