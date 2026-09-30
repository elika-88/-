import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { generateReadingSet, validateReadingSet } from '@/lib/server/prep-generation';
import { estimateIeltsBand } from '@/lib/prep/exams';
import type { PrepGenerateRequest, ReadingSet } from '@/lib/prep/schema';
import type { createOpenAIClient } from '@/lib/openai';

const passage = ('Honeybees communicate the location of food through a waggle dance. The angle of the dance relative to vertical indicates the direction of the food source relative to the sun. '
  + 'Longer waggle runs signal greater distances. Researchers first decoded this behaviour in the twentieth century. ').repeat(4);
const request: PrepGenerateRequest = { exam: 'ielts', passage, types: ['tfng', 'mcq', 'completion'], explanationLanguage: 'en' };
const base = { explanation: 'Because the passage says so.' };
const valid: ReadingSet = {
  title: 'Bee communication',
  questions: [
    { ...base, id: 'x', type: 'tfng', prompt: 'Bees use dancing to share where food is.', options: [], answerIndex: 0, answerText: '', evidence: ['communicate the location of food through a waggle dance'] },
    { ...base, id: 'x', type: 'tfng', prompt: 'Bees prefer flowers of one colour.', options: [], answerIndex: 2, answerText: '', evidence: [] },
    { ...base, id: 'x', type: 'mcq', prompt: 'What do longer waggle runs signal?', options: ['Greater distances', 'More food', 'Danger', 'Rain'], answerIndex: 0, answerText: '', evidence: ['Longer waggle runs signal greater distances'] },
    { ...base, id: 'x', type: 'completion', prompt: 'The angle of the dance shows direction relative to the ____.', options: [], answerIndex: -1, answerText: 'sun', evidence: ['direction of the food source relative to the sun'] },
  ],
};

describe('prep reading sets', () => {
  it('normalises ids, fixed TFNG options and answer text', () => {
    const set = validateReadingSet(valid, request);
    expect(set.questions.map((question) => question.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
    expect(set.questions[0].options).toEqual(['True', 'False', 'Not Given']);
    expect(set.questions[1].answerText).toBe('Not Given');
    expect(set.questions[2].answerText).toBe('Greater distances');
    expect(set.questions[3]).toMatchObject({ options: [], answerIndex: -1, answerText: 'sun' });
  });

  it('rejects invented evidence, bad completion answers and unknown types', () => {
    const withQuestion = (index: number, patch: Partial<ReadingSet['questions'][number]>) => ({ ...valid, questions: valid.questions.map((question, i) => i === index ? { ...question, ...patch } : question) });
    expect(() => validateReadingSet(withQuestion(0, { evidence: ['bees are mammals'] }), request)).toThrow(/exact quote/);
    expect(() => validateReadingSet(withQuestion(0, { answerIndex: 0, evidence: [] }), request)).toThrow(/need evidence/);
    expect(() => validateReadingSet(withQuestion(3, { answerText: 'the sun above' }), request)).toThrow(/one or two words/);
    expect(() => validateReadingSet(withQuestion(3, { answerText: 'moon' }), request)).toThrow(/one or two words/);
    expect(() => validateReadingSet(withQuestion(2, { options: ['A', 'A', 'B', 'C'] }), request)).toThrow(/four distinct/);
    expect(() => validateReadingSet(withQuestion(2, { type: 'factual' }), request)).toThrow(/type must be/);
  });

  it('retries with validation feedback, then returns a valid set', async () => {
    const bad = { ...valid, questions: valid.questions.map((question) => ({ ...question, evidence: question.evidence.length ? ['invented quote here'] : [] })) };
    const parse = vi.fn()
      .mockResolvedValueOnce({ status: 'completed', output: [], output_parsed: bad })
      .mockResolvedValueOnce({ status: 'completed', output: [], output_parsed: valid });
    const connection = { client: { responses: { parse } }, model: 'test-model', apiFormat: 'responses' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    const set = await generateReadingSet(request, connection, new AbortController().signal);
    expect(set.questions).toHaveLength(4);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(JSON.parse(parse.mock.calls[1][0].input[1].content).previousValidationError).toMatch(/exact quote/);
  });

  it('estimates IELTS bands from scaled raw scores', () => {
    expect(estimateIeltsBand(8, 8)).toBe(9);
    expect(estimateIeltsBand(6, 8)).toBe(7);
    expect(estimateIeltsBand(0, 8)).toBe(2);
  });
});
