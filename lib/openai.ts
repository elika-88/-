import "server-only";
import OpenAI from "openai";
import type { ProviderConfig } from "@/lib/provider";
import { readOpenAIConfiguration } from "@/lib/server/env";

// Construct per request; a custom endpoint must never inherit server credentials.
export async function createOpenAIClient(provider?: ProviderConfig) {
  const { apiKey, baseURL, model, apiFormat } = await readOpenAIConfiguration(provider);
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
  return { client, model, apiFormat };
}
