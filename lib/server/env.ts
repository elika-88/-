import "server-only";
import { z } from "zod";
import { readStoredSettings } from "./admin-db";
import { DEFAULT_API_BASE_URL, DEFAULT_MODEL, ProviderConfigSchema, type ProviderConfig } from "@/lib/provider";
import type { AdminSettings } from "@/lib/admin-schema";

export const ApiFormatSchema = z.enum(["responses", "chat_completions"]);
export type ApiFormat = z.infer<typeof ApiFormatSchema>;

export async function readOpenAIEnvironment(provider?: ProviderConfig): Promise<ProviderConfig> {
  const stored = provider ? null : await readStoredSettings();
  return parseEnvironment(provider, stored?.settings);
}

function parseEnvironment(provider?: ProviderConfig, settings?: AdminSettings): ProviderConfig {
  const parsed = ProviderConfigSchema.safeParse(provider ?? (settings ? { baseURL: settings.baseURL, apiKey: settings.apiKey, model: settings.model } : {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL ?? DEFAULT_API_BASE_URL,
    model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
  }));
  if (!parsed.success) {
    throw new Error("OpenAI server configuration is missing or invalid.");
  }
  return parsed.data;
}

export async function readApiFormat(custom = false): Promise<ApiFormat> {
  const format = custom ? 'responses' : (await readStoredSettings())?.settings.apiFormat ?? process.env.OPENAI_API_FORMAT ?? 'responses';
  return ApiFormatSchema.parse(format);
}

// Credentials and protocol must come from the same committed settings revision.
export async function readOpenAIConfiguration(provider?: ProviderConfig) {
  const settings = provider ? undefined : (await readStoredSettings())?.settings;
  return {
    ...parseEnvironment(provider, settings),
    apiFormat: ApiFormatSchema.parse(provider ? 'responses' : settings?.apiFormat ?? process.env.OPENAI_API_FORMAT ?? 'responses'),
  };
}
