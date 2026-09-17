import "server-only";
import { z } from "zod";
import { DEFAULT_API_BASE_URL, DEFAULT_MODEL, ProviderConfigSchema, type ProviderConfig } from "@/lib/provider";

export const ApiFormatSchema = z.enum(["responses", "chat_completions"]);
export type ApiFormat = z.infer<typeof ApiFormatSchema>;

export function readApiFormat(): ApiFormat {
  return ApiFormatSchema.parse(process.env.OPENAI_API_FORMAT ?? "responses");
}

// Call only when the AI pipeline is invoked, so builds never require a secret.
export function readOpenAIEnvironment(provider?: ProviderConfig): ProviderConfig {
  const parsed = ProviderConfigSchema.safeParse(provider ?? {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL ?? DEFAULT_API_BASE_URL,
    model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
  });
  if (!parsed.success) {
    throw new Error("OpenAI server configuration is missing or invalid.");
  }
  return parsed.data;
}
