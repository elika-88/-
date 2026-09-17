import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { generateStudyKit } from '@/lib/ai/pipeline';
import { GeneratedMaterialsSchema } from '@/lib/schemas/studyMaterials';
import { segmentLecture } from '@/lib/source';
import { validateMaterials, validateReview } from '@/lib/ai/grounding';
import type { createOpenAIClient } from '@/lib/openai';
import { studyKitFixture } from './fixtures/studyKit';

const kit = studyKitFixture();
const materials = GeneratedMaterialsSchema.parse(Object.fromEntries(Object.entries(kit).filter(([key]) => !['runId', 'source', 'topics', 'verification'].includes(key))));
const analysis = { title: 'Schemas', language: 'en', sufficient: true, insufficiencyReason: null, topics: kit.topics, concepts: [], relationships: [], ambiguities: [] };
const response = (output_parsed: unknown) => ({ status: 'completed', output: [], output_parsed });
const chatResponse = (parsed: unknown, finish_reason = 'stop', refusal: string | null = null) => ({
  choices: [{ finish_reason, message: { parsed, refusal } }],
});

function chatConnection(parse: ReturnType<typeof vi.fn>, model = 'gpt-5.5') {
  return { client: { chat: { completions: { parse } } }, model, apiFormat: 'chat_completions' } as unknown as ReturnType<typeof createOpenAIClient>;
}

const input = { title: '', lecture: kit.source.text, outputLanguage: 'en' as const };

describe('source grounding', () => {
  it('preserves exact offsets for long multilingual sources', () => {
    const text = ('学习 😀 knowledge\n').repeat(500);
    const parts = segmentLecture(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(text.slice(part.start, part.end)).toBe(part.text);
    expect(parts.map((part) => part.text).join('')).toBe(text);
  });
  it('rejects fake evidence and incomplete reviews', () => {
    const bad = structuredClone(materials);
    bad.quiz[0].evidence[0].quote = 'Invented fact';
    expect(() => validateMaterials(bad, kit.topics, kit.source.segments)).toThrow();
    expect(() => validateReview(materials, kit.verification.items.slice(1), kit.source.segments)).toThrow();
    expect(() => validateReview(materials, kit.verification.items.map((item) => ({ ...item, status: 'unsupported' })), kit.source.segments)).toThrow();
  });
});

describe('generation pipeline', () => {
  it('runs three real-call stages and computes counts from review records', async () => {
    const parse = vi.fn().mockResolvedValueOnce(response(analysis)).mockResolvedValueOnce(response(materials)).mockResolvedValueOnce(response({ items: kit.verification.items }));
    const connection = { client: { responses: { parse } }, model: 'test-model' } as unknown as ReturnType<typeof createOpenAIClient>;
    const emit = vi.fn();
    const result = await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, emit);
    expect(result.verification.supportedItems).toBe(5);
    expect(result.source.text).toBe(kit.source.text);
    expect(parse).toHaveBeenCalledTimes(3);
    expect(parse.mock.calls[0][0]).toMatchObject({ model: 'test-model', max_output_tokens: 7000 });
    expect(parse.mock.calls[0][0]).not.toHaveProperty('reasoning');
    expect(emit.mock.calls.map(([event]) => event.stage)).toEqual(['analyzing', 'generating', 'verifying']);
  });
  it('does not publish a kit when repeated reviews are unsupported', async () => {
    const parse = vi.fn().mockResolvedValueOnce(response(analysis));
    for (let i = 0; i < 3; i++) parse.mockResolvedValueOnce(response(materials)).mockResolvedValueOnce(response({ items: kit.verification.items.map((item) => ({ ...item, status: 'unsupported' })) }));
    const connection = { client: { responses: { parse } }, model: 'test-model' } as unknown as ReturnType<typeof createOpenAIClient>;
    await expect(generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'VERIFICATION_FAILED' });
    expect(parse).toHaveBeenCalledTimes(7);
  });

  it.each(['responses', 'chat_completions'] as const)('uses exact gpt-5.5 with strict structured output through %s', async (apiFormat) => {
    const wrap = apiFormat === 'responses' ? response : chatResponse;
    const parse = vi.fn().mockResolvedValueOnce(wrap(analysis)).mockResolvedValueOnce(wrap(materials)).mockResolvedValueOnce(wrap({ items: kit.verification.items }));
    const unused = vi.fn();
    const connection = {
      client: { responses: { parse: apiFormat === 'responses' ? parse : unused }, chat: { completions: { parse: apiFormat === 'chat_completions' ? parse : unused } } },
      model: 'gpt-5.5', apiFormat,
    } as unknown as ReturnType<typeof createOpenAIClient>;
    const signal = new AbortController().signal;
    const emit = vi.fn();
    const result = await generateStudyKit(input, connection, kit.runId, signal, emit);
    expect(result.source.text).toBe(input.lecture);
    expect(result.verification.supportedItems).toBe(5);
    expect(emit.mock.calls.map(([event]) => event.stage)).toEqual(['analyzing', 'generating', 'verifying']);
    expect(unused).not.toHaveBeenCalled();
    expect(parse).toHaveBeenCalledTimes(3);
    for (const [body, options] of parse.mock.calls) {
      expect(body).toMatchObject(apiFormat === 'responses'
        ? { model: 'gpt-5.5', store: false, max_output_tokens: 7000, reasoning: { effort: 'low' }, text: { format: { type: 'json_schema', strict: true } } }
        : { model: 'gpt-5.5', store: false, max_completion_tokens: 7000, reasoning_effort: 'low', response_format: { type: 'json_schema', json_schema: { strict: true } } });
      expect(options).toEqual({ signal });
    }
  });

  it.each(['gpt-4o', 'vendor/custom-model'])('omits reasoning configuration for chat model %s', async (model) => {
    const parse = vi.fn().mockResolvedValueOnce(chatResponse(analysis)).mockResolvedValueOnce(chatResponse(materials)).mockResolvedValueOnce(chatResponse({ items: kit.verification.items }));
    await generateStudyKit(input, chatConnection(parse, model), kit.runId, new AbortController().signal, vi.fn());
    expect(parse.mock.calls[0][0]).not.toHaveProperty('reasoning_effort');
    expect(parse.mock.calls[0][0].model).toBe(model);
  });

  it('stops immediately on chat refusal without exposing the refusal text', async () => {
    const parse = vi.fn().mockResolvedValue(chatResponse(null, 'stop', 'Private upstream refusal details.'));
    await expect(generateStudyKit(input, chatConnection(parse), kit.runId, new AbortController().signal, vi.fn())).rejects.toMatchObject({
      code: 'MODEL_REFUSAL', message: 'The model declined this lecture. Try another source.',
    });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['truncated', chatResponse(analysis, 'length')],
    ['filtered', chatResponse(analysis, 'content_filter')],
    ['missing parsed output', chatResponse(null)],
    ['malformed schema', chatResponse({ title: 'Only a title' })],
    ['missing choice', { choices: [] }],
  ])('rejects %s chat output within the existing retry budget', async (_, output) => {
    const parse = vi.fn().mockResolvedValue(output);
    const emit = vi.fn();
    await expect(generateStudyKit(input, chatConnection(parse), kit.runId, new AbortController().signal, emit)).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(parse).toHaveBeenCalledTimes(3);
    expect(emit.mock.calls.filter(([event]) => event.type === 'retry')).toHaveLength(2);
  });

  it('applies source verification to chat output before accepting materials', async () => {
    const bad = structuredClone(materials);
    bad.quiz[0].evidence[0].quote = 'An invented quotation.';
    const parse = vi.fn().mockResolvedValueOnce(chatResponse(analysis)).mockResolvedValue(chatResponse(bad));
    await expect(generateStudyKit(input, chatConnection(parse), kit.runId, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'VERIFICATION_FAILED' });
    expect(parse).toHaveBeenCalledTimes(4);
  });
});
