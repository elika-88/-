import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai/pipeline', async (original) => ({ ...await original<typeof import('@/lib/ai/pipeline')>(), generateStudyKit: vi.fn().mockRejectedValue(new Error('test failure')) }));
beforeEach(() => { vi.stubEnv('OPENAI_API_KEY', ''); vi.mocked(generateStudyKit).mockReset().mockRejectedValue(new Error('test failure')); });
afterEach(() => vi.unstubAllEnvs());
import { generateStudyKit } from '@/lib/ai/pipeline';
import { studyKitFixture } from './fixtures/studyKit';
import { POST } from "@/app/api/generate/route";
import { ErrorResponseSchema } from "@/lib/contracts/errors";
import { INPUT_LIMITS } from "@/lib/input";

function request(body: unknown) {
  return new Request("http://localhost/api/generate", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
}

describe("generation endpoint foundation", () => {
  it.each([
    ["", 400, "EMPTY_INPUT"],
    ["Too short.", 400, "INPUT_TOO_SHORT"],
    ["x".repeat(INPUT_LIMITS.maxCharacters + 1), 413, "INPUT_TOO_LONG"],
    ["evidence ".repeat(80), 503, "SERVER_CONFIG"],
  ])("returns a typed error without producing fake material", async (lecture, status, code) => {
    const response = await POST(request({ title: "", lecture, outputLanguage: "auto" }));
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(ErrorResponseSchema.parse(await response.json()).error).toMatchObject({ code, retryable: false });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(new Request("http://localhost/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("rejects unexpected content types", async () => {
    const response = await POST(new Request("http://localhost/api/generate", { method: "POST", body: "{}" }));
    expect(response.status).toBe(415);
  });

  it("limits actual bytes when Content-Length is absent", async () => {
    const response = await POST(new Request("http://localhost/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: " ".repeat(INPUT_LIMITS.maxRequestBytes + 1) }));
    expect(response.status).toBe(413);
  });

  it("rejects an unexpected client API key field", async () => {
    const response = await POST(request({ title: "", lecture: "evidence ".repeat(80), outputLanguage: "auto", apiKey: "not-allowed" }));
    expect(response.status).toBe(400);
  });

  it("accepts a complete nested provider without echoing its key", async () => {
    const response = await POST(request({ title: "", lecture: "evidence ".repeat(80), outputLanguage: "auto", provider: { baseURL: "https://gateway.example/v1", apiKey: "test-only-private-value", model: "custom-model" } }));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("test-only-private-value");
    const events = body.trim().split('\n').map((line) => JSON.parse(line));
    expect(events.at(-1).error.code).toBe("UPSTREAM_FAILURE");
  });

  it("rejects partial provider settings with a dedicated error", async () => {
    const response = await POST(request({ title: "", lecture: "evidence ".repeat(80), outputLanguage: "auto", provider: { baseURL: "https://gateway.example/v1", model: "custom-model" } }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_PROVIDER_CONFIG");
  });
});

describe('transport and deployment boundaries', () => {
  const body = { title: '', lecture: 'evidence '.repeat(80), outputLanguage: 'auto', provider: { baseURL: 'https://gateway.example/v1', apiKey: 'test-only-key', model: 'test-model' } };
  it('returns a validated result event with the matching run ID', async () => {
    vi.mocked(generateStudyKit).mockImplementation(async (_input, _client, runId) => ({ ...studyKitFixture(), runId }));
    const response = await POST(request(body));
    const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    expect(events.map((event) => event.type)).toEqual(['stage', 'stage', 'result']);
    expect(events.at(-1).data.runId).toBe(events[0].runId);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
  });
  it('supports explicit JSON negotiation with the same result contract', async () => {
    vi.mocked(generateStudyKit).mockImplementation(async (_input, _client, runId) => ({ ...studyKitFixture(), runId }));
    const req = request(body); req.headers.set('accept', 'application/json');
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect((await response.json()).quiz).toHaveLength(1);
  });
  it('blocks unapproved production targets before invoking the pipeline', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OPENAI_BASE_URL', 'https://approved.example/v1');
    vi.stubEnv('ALLOWED_API_BASE_URLS', '');
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(generateStudyKit).not.toHaveBeenCalled();
  });
  it('accepts explicitly configured production bases', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOWED_API_BASE_URLS', body.provider.baseURL);
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    await response.text();
    expect(generateStudyKit).toHaveBeenCalledTimes(1);
  });
});
