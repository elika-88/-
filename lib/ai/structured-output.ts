import { z } from 'zod';

export class StructuredOutputError extends Error {
  constructor(public kind: 'json' | 'schema' | 'size', public issues: { path: string; code: string }[] = []) {
    super('The provider returned invalid structured output.');
    this.name = 'StructuredOutputError';
  }
}

export function validateStructuredValue<T>(value: unknown, schema: z.ZodType<T>, discardRootMetadata = false): T {
  let parsed = schema.safeParse(value);
  // Production relays sometimes append commentary/metadata fields at the root.
  // Discard only keys the schema explicitly reports as unknown there. Required
  // values, nested objects, evidence IDs and types are never changed or coerced.
  if (!parsed.success && discardRootMetadata && value && typeof value === 'object' && !Array.isArray(value)) {
    const rootKeys = parsed.error.issues.flatMap(issue => issue.code === 'unrecognized_keys' && issue.path.length === 0 ? issue.keys : []);
    if (rootKeys.length) {
      const cleaned = { ...value } as Record<string, unknown>;
      for (const key of rootKeys) delete cleaned[key];
      parsed = schema.safeParse(cleaned);
    }
  }
  if (!parsed.success) throw new StructuredOutputError('schema', parsed.error.issues.slice(0, 16).map(issue => ({ path: issue.path.map(String).join('.'), code: issue.code })));
  return parsed.data;
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
  return validateStructuredValue(value, schema);
}
