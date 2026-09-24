import { z } from 'zod';

export class StructuredOutputError extends Error {
  constructor(public kind: 'json' | 'schema' | 'size', public issues: { path: string; code: string }[] = []) {
    super('The provider returned invalid structured output.');
    this.name = 'StructuredOutputError';
  }
}

// Some OpenAI-compatible relays wrap structured output in one Markdown fence.
// Unwrap only that complete envelope; never extract JSON from surrounding prose,
// fix malformed JSON, coerce fields, or bypass the application's strict schema.
export function parseStructuredOutput<T>(text: string, schema: z.ZodType<T>): T {
  if (text.length > 1_000_000) throw new StructuredOutputError('size');
  const trimmed = text.trim();
  const fenced = /^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  let value: unknown;
  try { value = JSON.parse(fenced ? fenced[1] : trimmed); }
  catch { throw new StructuredOutputError('json'); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new StructuredOutputError('schema', parsed.error.issues.slice(0, 16).map(issue => ({ path: issue.path.map(String).join('.'), code: issue.code })));
  return parsed.data;
}
