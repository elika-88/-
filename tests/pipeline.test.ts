import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { generateStudyKit } from '@/lib/ai/pipeline';
import { GeneratedMaterialsSchema } from '@/lib/schemas/studyMaterials';
import { segmentLecture } from '@/lib/source';
import { validateMaterials, validateReview } from '@/lib/ai/grounding';
import type { createOpenAIClient } from '@/lib/openai';
import { studyKitFixture } from './fixtures/studyKit';
import OpenAI from 'openai';

const kit = studyKitFixture();
const materials = GeneratedMaterialsSchema.parse(Object.fromEntries(Object.entries(kit).filter(([key]) => !['runId', 'source', 'topics', 'verification'].includes(key))));
const analysis = { title: 'Schemas', language: 'en', sufficient: true, insufficiencyReason: null, topics: kit.topics, concepts: [], relationships: [], ambiguities: [] };
function wire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(wire);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'evidence' && Array.isArray(child) ? child.map(item => ({ sourceId: item.quote === kit.source.text ? 'e1' : 'missing' })) : wire(child)]));
}
const response = (value: unknown) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(wire(value)) }] }] });
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
  it.each(['responses', 'chat_completions'] as const)('handles the actual SDK HTTP envelope with fenced JSON at every stage via %s', async (apiFormat) => {
    const outputs = [analysis, notePart, { quiz: materials.quiz }, { flashcards: materials.flashcards }, { items: verdicts }];
    const fetcher = vi.fn().mockImplementation(async () => {
      const text = '```json\n' + JSON.stringify({ ...wire(outputs.shift()) as object, provider_metadata: 'must not be saved' }) + '\n```';
      return Response.json(apiFormat === 'responses'
        ? { id: 'resp-test', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] }
        : { id: 'chat-test', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: text, refusal: null } }] });
    });
    const client = new OpenAI({ apiKey: 'test-only-key', baseURL: 'https://relay.example/v1', fetch: fetcher, maxRetries: 0 });
    const result = await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, { client, model: 'test-model', apiFormat }, kit.runId, new AbortController().signal, vi.fn());
    expect(result.verification.supportedItems).toBe(5);
    expect(JSON.stringify(result)).not.toContain('must not be saved');
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it.each(['incomplete', 'refusal'] as const)('never accepts JSON from a response marked %s', async (kind) => {
    const raw = kind === 'incomplete' ? { ...response(analysis), status: 'incomplete' }
      : { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }, { type: 'output_text', text: JSON.stringify(analysis) }] }] };
    const create = vi.fn().mockResolvedValue(raw);
    const connection = { client: { responses: { create } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    await expect(generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: kind === 'refusal' ? 'MODEL_REFUSAL' : 'INVALID_OUTPUT' });
    expect(create).toHaveBeenCalledTimes(kind === 'refusal' ? 1 : 3);
  });
  it.each(['responses', 'chat_completions'] as const)('accepts reflowed citations and saves literal source spans through %s', async (apiFormat) => {
    const lecture = kit.source.text.replace('defines a', 'defines\n\n\u3000\u3000a');
    const outputs = structuredClone([analysis, notePart, { quiz: materials.quiz }, { flashcards: materials.flashcards }, { items: verdicts }]);
    const parse = vi.fn().mockImplementation(async () => {
      const value = outputs.shift();
      return apiFormat === 'responses' ? response(value) : { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(wire(value)), refusal: null } }] };
    });
    const client = apiFormat === 'responses' ? { responses: { create: parse } } : { chat: { completions: { create: parse } } };
    const connection = { client, model: 'test-model', apiFormat } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    const result = await generateStudyKit({ title: '', lecture, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn());
    expect(parse).toHaveBeenCalledTimes(5);
    expect(result.source.text).toBe(lecture);
    for (const item of [...result.topics, result.overview, ...result.summary, ...result.keyPoints, ...result.quiz, ...result.flashcards, ...result.verification.items]) {
      for (const evidence of item.evidence) expect(evidence.quote).toBe(lecture);
    }
  });

  it('gives analysis retries source-reference feedback without accepting invented quotes', async () => {
    const bad = structuredClone(analysis);
    bad.topics[0].evidence[0].quote = 'An invented claim.';
    const outputs = [bad, analysis, notePart, { quiz: materials.quiz }, { flashcards: materials.flashcards }, { items: verdicts }];
    const parse = vi.fn().mockImplementation(async () => response(structuredClone(outputs.shift())));
    const connection = { client: { responses: { create: parse } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    const result = await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn());
    expect(parse).toHaveBeenCalledTimes(6);
    expect(parse.mock.calls[1][0].input[0].content).toContain('The previous response used invalid evidence.');
    expect(result.topics).toEqual(kit.topics);
  });

  it('fails after three invalid analyses without generating any materials', async () => {
    const bad = structuredClone(analysis);
    bad.topics[0].evidence[0].quote = 'An invented claim.';
    const parse = vi.fn().mockImplementation(async () => response(structuredClone(bad)));
    const connection = { client: { responses: { create: parse } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    await expect(generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(parse).toHaveBeenCalledTimes(3);
    expect(parse.mock.calls.every(([request]) => request.text.format.name === 'lecture_analysis')).toBe(true);
  });

  it('uses the configured chat format with strict structured output and full review', async () => {
    const outputs = [analysis, notePart, { quiz: materials.quiz }, { flashcards: materials.flashcards }, { items: verdicts }];
    const parse = vi.fn().mockImplementation(async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(wire(outputs.shift())), refusal: null } }] }));
    const connection = { client: { chat: { completions: { create: parse } } }, model: 'test-model', apiFormat: 'chat_completions' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    const result = await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn());
    expect(result.verification.supportedItems).toBe(5);
    expect(parse).toHaveBeenCalledTimes(5);
    expect(parse.mock.calls[0][0].response_format.type).toBe('json_schema');
    expect(parse.mock.calls[0][0].messages[0].content).toContain(JSON.stringify(parse.mock.calls[0][0].response_format.json_schema.schema));
  });

  it('repairs invalid fields with explicit schema feedback and exposes no content in diagnostics', async () => {
    const badQuiz = structuredClone(materials.quiz);
    const invalid = { quiz: badQuiz.map(item => ({ ...Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'correctAnswer')), answer: 'private-provider-content' })) };
    const parse = vi.fn().mockResolvedValueOnce(response(analysis))
      .mockResolvedValueOnce(response(notePart))
      .mockResolvedValueOnce(response(invalid))
      .mockResolvedValueOnce(response({ flashcards: materials.flashcards }))
      .mockResolvedValueOnce(response({ quiz: materials.quiz }))
      .mockResolvedValueOnce(response({ items: verdicts }));
    const connection = { client: { responses: { create: parse } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    const diagnose = vi.fn();
    await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn(), diagnose);
    const correction = JSON.parse(parse.mock.calls[4][0].input[1].content);
    expect(correction.previousValidationFeedback.fields).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'quiz.0.correctAnswer' })]));
    expect(parse.mock.calls[4][0].input[0].content).toContain(JSON.stringify(parse.mock.calls[4][0].text.format.schema));
    expect(diagnose.mock.calls.flat().some(d => d.stage === 'study_quiz' && d.outcome === 'schema')).toBe(true);
    expect(JSON.stringify(diagnose.mock.calls)).not.toContain('private-provider-content');
    expect(parse).toHaveBeenCalledTimes(6);
  });
  it('retries only a failed group while retaining successful siblings', async () => {
    const parse = vi.fn().mockResolvedValueOnce(response(analysis))
      .mockResolvedValueOnce(response(notePart))
      .mockRejectedValueOnce(new Error('temporary timeout'))
      .mockResolvedValueOnce(response({ flashcards: materials.flashcards }))
      .mockResolvedValueOnce(response({ quiz: materials.quiz }))
      .mockResolvedValueOnce(response({ items: verdicts }));
    const connection = { client: { responses: { create: parse } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
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
    const connection = { client: { responses: { create: parse } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn());
    expect(parse.mock.calls.map(([request]) => request.text.format.name)).toEqual(['lecture_analysis', 'study_notes', 'study_quiz', 'study_cards', 'material_review', 'material_review']);
    expect(JSON.parse(parse.mock.calls[5][0].input[1].content).previousReviewFeedback.error).toContain('every material ID exactly once');
  });
  it('repairs only the rejected group then reviews the entire kit again', async () => {
    const parse = vi.fn().mockResolvedValueOnce(response(analysis))
      .mockResolvedValueOnce(response(notePart))
      .mockResolvedValueOnce(response({ quiz: materials.quiz }))
      .mockResolvedValueOnce(response({ flashcards: materials.flashcards }))
      .mockResolvedValueOnce(response({ items: verdicts.map((v) => v.itemId === materials.quiz[0].id ? { ...v, status: 'unsupported' } : v) }))
      .mockResolvedValueOnce(response({ quiz: materials.quiz }))
      .mockResolvedValueOnce(response({ items: verdicts }));
    const connection = { client: { responses: { create: parse } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn());
    expect(parse.mock.calls.map(([request]) => request.text.format.name)).toEqual(['lecture_analysis', 'study_notes', 'study_quiz', 'study_cards', 'material_review', 'study_quiz', 'material_review']);
    const repair = JSON.parse(parse.mock.calls[5][0].input[1].content);
    expect(repair.previousCandidate).toEqual({ quiz: materials.quiz });
    expect(repair.previousValidationFeedback.reviewIssues[0].itemId).toBe(materials.quiz[0].id);
  });

  it.each(['responses', 'chat_completions'] as const)('corrects the actual rejected question using its review feedback with %s', async (apiFormat) => {
    const rejectedQuiz = structuredClone(materials.quiz);
    rejectedQuiz[0].explanation = 'Schemas cure disease.';
    const badVerdicts = verdicts.map((v) => v.itemId === 'q1' ? { ...v, status: 'unsupported', reason: 'The source does not claim schemas cure disease.' } : v);
    const parse = vi.fn().mockImplementation(async (request) => {
      const name = apiFormat === 'responses' ? request.text.format.name : request.response_format.json_schema.name;
      const data = JSON.parse((request.input ?? request.messages)[1].content);
      let value: unknown;
      if (name === 'lecture_analysis') value = analysis;
      else if (name === 'study_notes') value = notePart;
      else if (name === 'study_cards') value = { flashcards: materials.flashcards };
      else if (name === 'study_quiz') {
        if (data.previousCandidate) {
          expect(data.previousCandidate.quiz[0].explanation).toBe('Schemas cure disease.');
          expect(data.previousValidationFeedback.reviewIssues).toEqual([{ itemId: 'q1', status: 'unsupported', reason: 'The source does not claim schemas cure disease.' }]);
          value = { quiz: materials.quiz };
        } else value = { quiz: rejectedQuiz };
      } else value = { items: data.materials.quiz[0].explanation === 'Schemas cure disease.' ? badVerdicts : verdicts };
      return apiFormat === 'responses' ? response(structuredClone(value)) : { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(wire(value)), refusal: null } }] };
    });
    const client = apiFormat === 'responses' ? { responses: { create: parse } } : { chat: { completions: { create: parse } } };
    const connection = { client, model: 'test-model', apiFormat } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    const result = await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn());
    expect(result.quiz).toEqual(materials.quiz);
    expect(parse).toHaveBeenCalledTimes(7);
    expect(result.verification.supportedItems).toBe(result.verification.totalItems);
  });

  it('keeps the failed candidate and feedback when the first repair call has a transport failure', async () => {
    const parse = vi.fn().mockResolvedValueOnce(response(analysis))
      .mockResolvedValueOnce(response(notePart))
      .mockResolvedValueOnce(response({ quiz: materials.quiz }))
      .mockResolvedValueOnce(response({ flashcards: materials.flashcards }))
      .mockResolvedValueOnce(response({ items: verdicts.map((v) => v.itemId === 'q1' ? { ...v, status: 'unsupported' } : v) }))
      .mockRejectedValueOnce(new Error('temporary transport interruption'))
      .mockResolvedValueOnce(response({ quiz: materials.quiz }))
      .mockResolvedValueOnce(response({ items: verdicts }));
    const connection = { client: { responses: { create: parse } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn());
    expect(JSON.parse(parse.mock.calls[6][0].input[1].content)).toEqual(JSON.parse(parse.mock.calls[5][0].input[1].content));
    expect(parse).toHaveBeenCalledTimes(8);
  });

  it('provides item-specific structural problems and previous candidates on correction', async () => {
    const badQuiz = structuredClone(materials.quiz);
    badQuiz[0].topicId = 'missing-topic';
    const parse = vi.fn().mockResolvedValueOnce(response(analysis))
      .mockResolvedValueOnce(response(notePart))
      .mockResolvedValueOnce(response({ quiz: badQuiz }))
      .mockResolvedValueOnce(response({ flashcards: materials.flashcards }))
      .mockResolvedValueOnce(response(notePart))
      .mockResolvedValueOnce(response({ quiz: materials.quiz }))
      .mockResolvedValueOnce(response({ flashcards: materials.flashcards }))
      .mockResolvedValueOnce(response({ items: verdicts }));
    const connection = { client: { responses: { create: parse } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    await generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn());
    const repair = JSON.parse(parse.mock.calls[5][0].input[1].content);
    expect(repair.previousCandidate).toEqual({ quiz: badQuiz });
    expect(repair.previousValidationFeedback.materialIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: 'q1', code: 'topic_reference' }),
    ]));
  });

  it('reports an incomplete review as invalid output, not unsupported source content', async () => {
    const parse = vi.fn().mockResolvedValueOnce(response(analysis))
      .mockResolvedValueOnce(response(notePart))
      .mockResolvedValueOnce(response({ quiz: materials.quiz }))
      .mockResolvedValueOnce(response({ flashcards: materials.flashcards }))
      .mockResolvedValue(response({ items: verdicts.slice(1) }));
    const connection = { client: { responses: { create: parse } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    await expect(generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'INVALID_OUTPUT', message: expect.stringContaining('verification report') });
    expect(parse).toHaveBeenCalledTimes(7);
  });

  it.each(['duplicate_options', 'source_reference'] as const)('never publishes repeatedly invalid material: %s', async (kind) => {
    const badQuiz = structuredClone(materials.quiz);
    if (kind === 'duplicate_options') badQuiz[0].options[1] = badQuiz[0].options[0];
    else badQuiz[0].evidence[0].quote = 'Invented quotation.';
    const parse = vi.fn().mockImplementation(async request => {
      const name = request.text.format.name;
      return response(name === 'lecture_analysis' ? analysis : name === 'study_notes' ? notePart : name === 'study_quiz' ? { quiz: badQuiz } : { flashcards: materials.flashcards });
    });
    const connection = { client: { responses: { create: parse } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    await expect(generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: kind === 'source_reference' ? 'VERIFICATION_FAILED' : 'INVALID_OUTPUT' });
    expect(parse.mock.calls.some(([request]) => request.text.format.name === 'material_review')).toBe(false);
    expect(parse).toHaveBeenCalledTimes(kind === 'source_reference' ? 6 : 10);
  });
  it('runs analysis, parallel materials and review, computing counts from records', async () => {
    const parse = successfulCalls();
    const connection = { client: { responses: { create: parse } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
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
    const connection = { client: { responses: { create: parse } }, model: 'test-model' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    await expect(generateStudyKit({ title: '', lecture: kit.source.text, outputLanguage: 'en' }, connection, kit.runId, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'VERIFICATION_FAILED' });
    expect(parse).toHaveBeenCalledTimes(13);
  });
});
