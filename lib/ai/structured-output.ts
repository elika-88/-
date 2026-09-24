import { z } from 'zod';

// Some OpenAI-compatible relays wrap structured output in one Markdown fence.
// Unwrap only that complete envelope; never extract JSON from surrounding prose,
// fix malformed JSON, coerce fields, or bypass the application's strict schema.
export function parseStructuredOutput<T>(text: string, schema: z.ZodType<T>): T {
  if (text.length > 1_000_000) throw new Error('Structured output exceeds its size limit.');
  const trimmed = text.trim();
  const fenced = /^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  return schema.parse(JSON.parse(fenced ? fenced[1] : trimmed));
}
