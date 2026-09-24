import { describe, expect, it } from 'vitest';
import { citationCatalog, citationSelectionSchema, resolveCitationSelections } from '@/lib/ai/citation-catalog';
import { segmentLecture } from '@/lib/source';
import { zodTextFormat } from 'openai/helpers/zod';
import { GeneratedMaterialsSchema } from '@/lib/schemas/studyMaterials';

describe('server-owned source excerpts', () => {
  it('covers long sources without changing line numbers, whitespace, words or Unicode', () => {
    const text = ('Nightingale\n\n\u3000\u30005 lived after the war. 😀 She would not rest.\n').repeat(200);
    const segments = segmentLecture(text);
    const catalog = citationCatalog(segments);
    expect(new Set(catalog.map(e => e.sourceId)).size).toBe(catalog.length);
    for (const segment of segments) {
      const excerpts = catalog.filter(e => e.segmentId === segment.id);
      const covered = new Set<number>();
      for (const e of excerpts) {
        const offset = e.start - segment.start;
        expect(text.slice(e.start, e.end)).toBe(e.text);
        for (let i = offset; i < offset + e.text.length; i++) covered.add(i);
      }
      for (let i = 0; i < segment.text.length; i++) if (!/\s/u.test(segment.text[i])) expect(covered.has(i)).toBe(true);
    }
  });
  it('resolves only known selections to exact source text', () => {
    const text = 'Florence\n\u3000\u300010 Nightingale';
    const catalog = citationCatalog(segmentLecture(text));
    expect(resolveCitationSelections({ evidence: [{ sourceId: 'e1' }] }, catalog)).toEqual({ evidence: [{ segmentId: 's1', quote: text }] });
    for (const evidence of [[{ sourceId: 'fake' }], [{ sourceId: 'e1', quote: 'invented' }], [{ segmentId: 's1', quote: text }]]) {
      expect(() => resolveCitationSelections({ evidence }, catalog)).toThrow();
    }
  });
  it('changes only evidence schema fields and preserves strict structural validation', () => {
    const schema = citationSelectionSchema(zodTextFormat(GeneratedMaterialsSchema, 'materials').schema);
    const text = JSON.stringify(schema);
    expect(text).toContain('sourceId');
    expect(text).not.toContain('segmentId');
    expect(text).not.toContain('"quote"');
    expect(text).toContain('correctAnswer');
    expect(text).toContain('additionalProperties":false');
  });
});
