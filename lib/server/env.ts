import "server-only";
import { readStoredSettings } from './admin-db';
import { DEFAULT_API_BASE_URL, DEFAULT_MODEL, ProviderConfigSchema, type ProviderConfig } from "@/lib/provider";

// Call only when the AI pipeline is invoked, so builds never require a secret.
export function readOpenAIEnvironment(provider?: ProviderConfig): ProviderConfig {
  const stored = provider ? null : readStoredSettings();
  const settings = stored?.settings;
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

export function readApiFormat(custom = false): 'responses' | 'chat_completions' {
  const format = custom ? 'responses' : readStoredSettings()?.settings.apiFormat ?? process.env.OPENAI_API_FORMAT ?? 'responses';
  if (format !== 'responses' && format !== 'chat_completions') throw new Error('Invalid API format.');
  return format;
}
