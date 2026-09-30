import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseStructuredOutput, StructuredOutputError, validateStructuredValue } from '@/lib/ai/structured-output';
const schema = z.strictObject({ title: z.string(), count: z.number().int() });
const raw = '{"title":"Nightingale","count":3}';
describe('strict structured output with Markdown envelope compatibility', () => {
  it('can discard only unrecognized root metadata without modifying the original response', () => {
    const value = { title: 'Nightingale', count: 3, commentary: 'Do something else' };
    expect(validateStructuredValue(value, schema, true)).toEqual({ title: 'Nightingale', count: 3 });
    expect(value.commentary).toBe('Do something else');
    expect(() => validateStructuredValue(value, schema)).toThrow();
  });
  it('still rejects missing fields, wrong types and unknown nested keys alongside root metadata', () => {
    for (const value of [{ title: 'Nightingale', commentary: 'extra' }, { title: 'Nightingale', count: '3', commentary: 'extra' }]) {
      expect(() => validateStructuredValue(value, schema, true)).toThrow();
    }
    expect(() => validateStructuredValue({ inner: { ok: true, fabricated: true }, metadata: {} }, z.strictObject({ inner: z.strictObject({ ok: z.boolean() }) }), true)).toThrow();
  });
  it.each([raw, `\n${raw}\n`, `\uFEFF${raw}`, '```json\n'+raw+'\n```', '```JSON\r\n'+raw+'\r\n```', '```\n'+raw+'\n```'])('accepts bare JSON or one complete JSON fence: %s', (text) => {
    expect(parseStructuredOutput(text, schema)).toEqual({ title: 'Nightingale', count: 3 });
  });
  it.each([
    'Here is the answer: '+raw,
    '```json\n'+raw+'\n```\nextra text',
    'prefix\n```json\n'+raw+'\n```',
    '```json\n'+raw+'\n```\n```json\n'+raw+'\n```',
    '```javascript\n'+raw+'\n```',
    '```json\n'+raw,
    '{"title":"Nightingale","count":3,}',
    '{"title":"Nightingale"}',
    '{"title":"Nightingale","count":"3"}',
    '{"title":"Nightingale","count":3,"extra":true}',
    'null', '',
  ])('rejects malformed, ambiguous or schema-invalid content: %s', text => {
    expect(() => parseStructuredOutput(text, schema)).toThrow();
  });
  it('bounds parsing size', () => {
    expect(() => parseStructuredOutput(' '.repeat(1_000_001), schema)).toThrow(StructuredOutputError);
  });
});
