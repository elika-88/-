import { z } from "zod";

export const DEFAULT_API_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_MODEL = "gpt-5.5";

export const ApiBaseUrlSchema = z.string().trim().min(1).max(2048).superRefine((value, context) => {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
        url.username || url.password || url.search || url.hash) {
      context.addIssue({ code: "custom", message: "Use an HTTPS base URL (HTTP is allowed for localhost), without credentials, query, or fragment." });
    }
  } catch {
    context.addIssue({ code: "custom", message: "Enter a valid API base URL." });
  }
}).transform((value) => {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
});

export const ProviderConfigSchema = z.strictObject({
  baseURL: ApiBaseUrlSchema,
  apiKey: z.string().trim().min(1).max(4096).regex(/^[\x21-\x7e]+$/, "Enter a key without whitespace or control characters."),
  model: z.string().trim().min(1).max(256).regex(/^[^\s\x00-\x1f\x7f]+$/, "Enter a model ID without whitespace or control characters."),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
