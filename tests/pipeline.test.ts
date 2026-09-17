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
const verdicts = kit.verification.items.map(({ itemId, status, reason }) => ({ itemId, status, reason }));
const notePart = { lectureTitle: materials.lectureTitle, overview: materials.overview, summary: materials.summary, keyPoints: materials.keyPoints, limitations: materials.limitations };
function successfulCalls() {
  return vi.fn().mockResolvedValueOnce(response(analysis))
    .mockResolvedValueOnce(response(notePart))
    .mockResolvedValueOnce(response({ quiz: materials.quiz }))
    .mockResolvedValueOnce(response({ flashcards: materials.flashcards }))
    .mockResolvedValueOnce(response({ items: verdicts }));
}

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
  it('uses the configured chat format with strict structured output and full review', async () => {
    const outputs = [analysis, notePart, { quiz: materials.quiz }, { flashcards: materials.flashcards }, { items: verdicts }];
    const parse = vi.fn().mockImplementation(async () => ({ choices: [{ finish_reason: 'stop', message: { parsed: outputs.shift(), refusal: null } }] }));
    const connection = { client: { chat: { completions: { parse } } }, model: 'test-model', apiFormat: 'chat_completions' } as unknown as ReturnType<typeof createOpenAIClient>;
    const result = await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn());
    expect(result.verification.supportedItems).toBe(5);
    expect(parse).toHaveBeenCalledTimes(5);
    expect(parse.mock.calls[0][0].response_format.type).toBe('json_schema');
  });
  it('retries only a failed group while retaining successful siblings', async () => {
    const parse = vi.fn().mockResolvedValueOnce(response(analysis))
      .mockResolvedValueOnce(response(notePart))
      .mockRejectedValueOnce(new Error('temporary timeout'))
      .mockResolvedValueOnce(response({ flashcards: materials.flashcards }))
      .mockResolvedValueOnce(response({ quiz: materials.quiz }))
      .mockResolvedValueOnce(response({ items: verdicts }));
    const connection = { client: { responses: { parse } }, model: 'test-model' } as unknown as ReturnType<typeof createOpenAIClient>;
    await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn());
    expect(parse.mock.calls.map(([request]) => request.text.format.name)).toEqual(['lecture_analysis', 'study_notes', 'study_quiz', 'study_cards', 'study_quiz', 'material_review']);
  });
  it('retries a malformed review without regenerating material', async () => {
    const parse = successfulCalls();
    // Replace the final successful response with an incomplete review.
    parse.mockReset().mockResolvedValueOnce(response(analysis))
      .mockResolvedValueOnce(response(notePart))
      .mockResolvedValueOnce(response({ quiz: materials.quiz }))
      .mockResolvedValueOnce(response({ flashcards: materials.flashcards }))
      .mockResolvedValueOnce(response({ items: verdicts.slice(1) }))
      .mockResolvedValueOnce(response({ items: verdicts }));
    const connection = { client: { responses: { parse } }, model: 'test-model' } as unknown as ReturnType<typeof createOpenAIClient>;
    await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn());
    expect(parse.mock.calls.map(([request]) => request.text.format.name)).toEqual(['lecture_analysis', 'study_notes', 'study_quiz', 'study_cards', 'material_review', 'material_review']);
  });
  it('repairs only the rejected group then reviews the entire kit again', async () => {
    const parse = vi.fn().mockResolvedValueOnce(response(analysis))
      .mockResolvedValueOnce(response(notePart))
      .mockResolvedValueOnce(response({ quiz: materials.quiz }))
      .mockResolvedValueOnce(response({ flashcards: materials.flashcards }))
      .mockResolvedValueOnce(response({ items: verdicts.map((v) => v.itemId === materials.quiz[0].id ? { ...v, status: 'unsupported' } : v) }))
      .mockResolvedValueOnce(response({ quiz: materials.quiz }))
      .mockResolvedValueOnce(response({ items: verdicts }));
    const connection = { client: { responses: { parse } }, model: 'test-model' } as unknown as ReturnType<typeof createOpenAIClient>;
    await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn());
    expect(parse.mock.calls.map(([request]) => request.text.format.name)).toEqual(['lecture_analysis', 'study_notes', 'study_quiz', 'study_cards', 'material_review', 'study_quiz', 'material_review']);
  });
  it('runs analysis, parallel materials and review, computing counts from records', async () => {
    const parse = successfulCalls();
    const connection = { client: { responses: { parse } }, model: 'test-model' } as unknown as ReturnType<typeof createOpenAIClient>;
    const emit = vi.fn();
    const result = await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, emit);
    expect(result.verification.supportedItems).toBe(5);
    expect(result.source.text).toBe(kit.source.text);
    expect(parse).toHaveBeenCalledTimes(5);
    expect(emit.mock.calls.map(([event]) => event.stage)).toEqual(['analyzing', 'generating', 'verifying']);
  });
  it('does not publish a kit when repeated reviews are unsupported', async () => {
    const parse = vi.fn().mockResolvedValueOnce(response(analysis));
    for (let i = 0; i < 3; i++) parse.mockResolvedValueOnce(response(notePart)).mockResolvedValueOnce(response({ quiz: materials.quiz })).mockResolvedValueOnce(response({ flashcards: materials.flashcards })).mockResolvedValueOnce(response({ items: verdicts.map((item) => ({ ...item, status: 'unsupported' })) }));
    const connection = { client: { responses: { parse } }, model: 'test-model' } as unknown as ReturnType<typeof createOpenAIClient>;
    await expect(generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'VERIFICATION_FAILED' });
    expect(parse).toHaveBeenCalledTimes(13);
  });
});
