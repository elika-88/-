import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderConfigSchema, type ProviderConfig } from "@/lib/provider";
import { validateGenerationInput } from "@/lib/input";

vi.mock("server-only", () => ({}));
import { readApiFormat, readOpenAIEnvironment } from "@/lib/server/env";
import { createOpenAIClient } from "@/lib/openai";

const provider = { baseURL: "https://gateway.example/v1", apiKey: "test-only-user-key", model: "vendor/model-name" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("custom provider validation", () => {
  it("normalizes the base URL and trims fields without changing model IDs", () => {
    expect(ProviderConfigSchema.parse({ baseURL: " https://gateway.example/proxy/v1/ ", apiKey: " test-only-user-key ", model: " vendor/model-name " }))
      .toEqual({ ...provider, baseURL: "https://gateway.example/proxy/v1" });
  });

  it.each(["http://localhost:11434/v1", "http://127.0.0.1:8000/v1", "http://[::1]:8000/v1"])("allows a local API at %s", (baseURL) => {
    expect(ProviderConfigSchema.safeParse({ ...provider, baseURL }).success).toBe(true);
  });

  it.each([
    "not a url", "http://gateway.example/v1", "file:///etc/passwd",
    "https://user:password@gateway.example/v1", "https://gateway.example/v1?key=secret",
    "https://gateway.example/v1#secret", "javascript:alert(1)",
  ])("rejects an invalid base URL without throwing: %s", (baseURL) => {
    expect(ProviderConfigSchema.safeParse({ ...provider, baseURL }).success).toBe(false);
  });

  it.each([
    { ...provider, apiKey: "" },
    { ...provider, apiKey: "test\r\nInjected: value" },
    { ...provider, model: "" },
    { ...provider, model: "two words" },
    { baseURL: provider.baseURL, model: provider.model },
    { ...provider, extra: "not-allowed" },
  ])("rejects partial or invalid custom configuration", (value) => {
    const result = validateGenerationInput({ title: "", lecture: "evidence ".repeat(80), outputLanguage: "auto", provider: value });
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_PROVIDER_CONFIG", retryable: false } });
  });
});

describe("server configuration isolation", () => {
  it("reads the API format only from the server environment", async () => {
    vi.stubEnv("OPENAI_API_FORMAT", undefined);
    expect(await readApiFormat()).toBe("responses");
    vi.stubEnv("OPENAI_API_FORMAT", "chat_completions");
    expect(await readApiFormat()).toBe("chat_completions");
    vi.stubEnv("OPENAI_API_FORMAT", "invalid");
    await expect(readApiFormat()).rejects.toThrow();
  });

  it("connects to a server-configured relay with the exact gpt-5.5 model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-relay-key");
    vi.stubEnv("OPENAI_BASE_URL", "https://relay.example/proxy/v1/");
    vi.stubEnv("OPENAI_MODEL", "gpt-5.5");
    vi.stubEnv("OPENAI_API_FORMAT", "chat_completions");
    const fetch = vi.fn().mockResolvedValue(Response.json({ choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }] }));
    vi.stubGlobal("fetch", fetch);
    const { client, model, apiFormat } = await createOpenAIClient();
    expect(apiFormat).toBe("chat_completions");
    await client.chat.completions.create({ model, messages: [{ role: "user", content: "Test transport only" }] });
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://relay.example/proxy/v1/chat/completions");
    expect(JSON.parse(options.body as string).model).toBe("gpt-5.5");
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-only-relay-key");
    expect(options.redirect).toBe("error");
  });

  it("uses environment defaults only when no custom config is supplied", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-server-key");
    vi.stubEnv("OPENAI_BASE_URL", undefined);
    vi.stubEnv("OPENAI_MODEL", undefined);
    expect(await readOpenAIEnvironment()).toEqual({ baseURL: "https://api.openai.com/v1", apiKey: "test-only-server-key", model: "gpt-5.5" });
    vi.stubEnv("OPENAI_BASE_URL", "https://server.example/v1/");
    vi.stubEnv("OPENAI_MODEL", "server-model");
    expect((await readOpenAIEnvironment()).baseURL).toBe("https://server.example/v1");
    expect((await readOpenAIEnvironment()).model).toBe("server-model");
    expect(await readOpenAIEnvironment(provider)).toEqual(provider);
  });

  it("never fills a missing custom key with the server key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-server-key");
    await expect(readOpenAIEnvironment({ baseURL: provider.baseURL, model: provider.model } as ProviderConfig))
      .rejects.toThrow("OpenAI server configuration is missing or invalid.");
  });

  it("creates an isolated SDK client that sends the selected URL, key, and model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-server-key");
    vi.stubEnv("OPENAI_ADMIN_KEY", "test-only-server-admin-key");
    vi.stubEnv("OPENAI_ORG_ID", "test-only-server-org");
    vi.stubEnv("OPENAI_PROJECT_ID", "test-only-server-project");
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: "test-only-response" }));
    vi.stubGlobal("fetch", fetch);
    const { client, model } = await createOpenAIClient(provider);
    await client.responses.create({ model, input: "Test transport configuration only.", store: false });
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://gateway.example/v1/responses");
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-only-user-key");
    expect(new Headers(options.headers).has("OpenAI-Organization")).toBe(false);
    expect(new Headers(options.headers).has("OpenAI-Project")).toBe(false);
    expect(JSON.parse(options.body as string).model).toBe(provider.model);
    expect(options.redirect).toBe("error");
    expect(client.maxRetries).toBe(0);
    expect(client.logLevel).toBe("off");
  });
});
