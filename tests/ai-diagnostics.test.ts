import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { diagnoseAnalysis } from '@/lib/ai/diagnostics';
import type { createOpenAIClient } from '@/lib/openai';
const input = { title: '', lecture: 'The source says something.', outputLanguage: 'auto' as const };
const connection = (result: unknown) => ({ model: 'test-model', apiFormat: 'responses', client: { responses: { create: vi.fn().mockResolvedValue(result) } } }) as unknown as Awaited<ReturnType<typeof createOpenAIClient>>;

describe('admin analysis diagnostics', () => {
  it('detects markdown-wrapped JSON without returning raw content', async () => {
    const result = await diagnoseAnalysis(input, connection({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '```json\n{"private":"content"}\n```' }] }] }));
    expect(result).toMatchObject({ jsonValid: false, representation: 'fenced' });
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('reports only structural issue paths', async () => {
    const result = await diagnoseAnalysis(input, connection({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"title":"private-title"}' }] }] }));
    expect(result).toMatchObject({ schemaValid: false });
    expect(JSON.stringify(result)).not.toContain('private-title');
  });
  it('does not expose provider errors or credentials', async () => {
    const c = connection({});
    vi.mocked(c.client.responses.create).mockRejectedValue(new Error('private-provider-message'));
    expect(await diagnoseAnalysis(input, c)).toMatchObject({ failed: true, kind: 'Error' });
    expect(JSON.stringify(await diagnoseAnalysis(input, c))).not.toContain('private-provider-message');
  });
});
