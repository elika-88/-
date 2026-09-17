import "server-only";
import OpenAI from "openai";
import type { ProviderConfig } from "@/lib/provider";
import { readApiFormat, readOpenAIEnvironment } from "@/lib/server/env";

// Construct per request; a custom endpoint must never inherit server credentials.
export function createOpenAIClient(provider?: ProviderConfig) {
  const { apiKey, baseURL, model } = readOpenAIEnvironment(provider);
  const client = new OpenAI({
    apiKey,
    baseURL,
    adminAPIKey: null,
    organization: null,
    project: null,
    webhookSecret: null,
    maxRetries: 0,
    timeout: 110_000,
    logLevel: "off",
    fetchOptions: { redirect: "error" },
  });
  return { client, model, apiFormat: readApiFormat(Boolean(provider)) };
}
