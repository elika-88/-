import { z } from "zod";

export const ErrorCodeSchema = z.enum([
  "INVALID_REQUEST", "UNSUPPORTED_MEDIA_TYPE", "EMPTY_INPUT", "INPUT_TOO_SHORT",
  "INPUT_TOO_LONG", "INSUFFICIENT_CONTENT", "SERVER_CONFIG", "RATE_LIMITED",
  "UPSTREAM_FAILURE", "MODEL_REFUSAL", "INVALID_OUTPUT", "VERIFICATION_FAILED",
  "TIMEOUT", "NOT_IMPLEMENTED", "INVALID_PROVIDER_CONFIG",
  "LOGIN_REQUIRED", "BACKGROUND_REQUIRED", "INVALID_ORIGIN",
]);

export const GenerationErrorSchema = z.strictObject({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
});

export const ErrorResponseSchema = z.strictObject({ error: GenerationErrorSchema });

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type GenerationError = z.infer<typeof GenerationErrorSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const ERROR_HTTP_STATUS = {
  LOGIN_REQUIRED: 401,
  BACKGROUND_REQUIRED: 409,
  INVALID_ORIGIN: 403,
  INVALID_REQUEST: 400,
  INVALID_PROVIDER_CONFIG: 400,
  UNSUPPORTED_MEDIA_TYPE: 415,
  EMPTY_INPUT: 400,
  INPUT_TOO_SHORT: 400,
  INPUT_TOO_LONG: 413,
  INSUFFICIENT_CONTENT: 422,
  SERVER_CONFIG: 503,
  RATE_LIMITED: 429,
  UPSTREAM_FAILURE: 502,
  MODEL_REFUSAL: 422,
  INVALID_OUTPUT: 502,
  VERIFICATION_FAILED: 422,
  TIMEOUT: 504,
  NOT_IMPLEMENTED: 501,
} as const satisfies Record<ErrorCode, number>;
