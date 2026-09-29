import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { generateReadingSet, validateReadingSet } from '@/lib/server/prep-generation';
import { estimateIeltsBand } from '@/lib/prep/exams';
import type { PrepGenerateRequest, ReadingSet } from '@/lib/prep/schema';
import type { createOpenAIClient } from '@/lib/openai';
import { citationCatalog } from '@/lib/ai/citation-catalog';
import { segmentLecture } from '@/lib/source';

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
    const evidenceId=citationCatalog(segmentLecture(passage))[0].sourceId;
    const provider={...valid,questions:valid.questions.map(q=>({...q,context:passage,optionReasons:q.options.length?q.options.map(()=> 'Reason'):[],strategy:'Find evidence',wordLimit:q.type==='completion'?2:0,evidence:q.evidence.length?[evidenceId]:[]}))};
    const bad={...provider,questions:provider.questions.map(q=>({...q,evidence:['missing-id']}))};
    const output=(value:unknown)=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
    const create = vi.fn().mockResolvedValueOnce(output(bad)).mockResolvedValueOnce(output(provider)).mockResolvedValueOnce(output({items:valid.questions.map((q,i)=>({id:'q'+(i+1),valid:true,reason:''}))}));
    const connection = { client: { responses: { create } }, model: 'test-model', apiFormat: 'responses' } as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;
    const set = await generateReadingSet({...request,count:4}, connection, new AbortController().signal);
    expect(set.questions).toHaveLength(4);
    expect(create).toHaveBeenCalledTimes(3);
    expect(JSON.parse(create.mock.calls[1][0].input[1].content).feedback).toMatch(/excerpt IDs/);
  });

  it('never extrapolates small uncalibrated practice sets into IELTS bands', () => {
    expect(estimateIeltsBand(8, 8)).toBeNull();
    expect(estimateIeltsBand(6, 8)).toBeNull();
    expect(estimateIeltsBand(0, 8)).toBeNull();
  });
});
