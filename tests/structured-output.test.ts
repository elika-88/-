import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseStructuredOutput, StructuredOutputError } from '@/lib/ai/structured-output';
const schema = z.strictObject({ title: z.string(), count: z.number().int() });
const raw = '{"title":"Nightingale","count":3}';
describe('strict structured output with Markdown envelope compatibility', () => {
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
