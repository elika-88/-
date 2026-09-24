import { describe, expect, it } from 'vitest';
import { MaterialValidationError, SourceReferenceError, validateEvidence, validateMaterials } from '@/lib/ai/grounding';
import { segmentLecture } from '@/lib/source';
import { studyKitFixture } from './fixtures/studyKit';

const excerpt = "The name of Florence Nightingale lives in the memory of the\n\n\u3000\u3000world by virtue of the heroic adventure of the Crimea. Had she\n\n\u3000\u3000died - as she nearly did - upon her return to England, her\n\n\u3000\u3000reputation would hardly have been different; her legend would\n\n\u3000\u30005 have come down to us almost as we know it today - that gentle\n\n\u3000\u3000vision of female virtue";

describe('source reference layout tolerance', () => {
  it.each([
    'The name of Florence Nightingale lives in the memory of the world by virtue of the heroic adventure of the Crimea.',
    'her legend would 5 have come down to us almost as we know it today - that gentle vision of female virtue',
  ])('restores an exact source span from a reflowed quote', (quote) => {
    const evidence = [{ segmentId: 's1', quote }];
    validateEvidence(evidence, segmentLecture(excerpt));
    expect(excerpt.includes(evidence[0].quote)).toBe(true);
    expect(evidence[0].quote).toContain('\n\n\u3000\u3000');
    expect(evidence[0].quote.replace(/\s+/gu, ' ')).toBe(quote);
  });

  it('preserves UTF-16 offsets and handles CRLF, tabs and non-breaking spaces', () => {
    const text = 'Introduction: \ud83d\ude00\t\u4e16\u754c\r\nnext\u00a0line. End.';
    const evidence = [{ segmentId: 's1', quote: '\ud83d\ude00 \u4e16\u754c next line.' }];
    validateEvidence(evidence, segmentLecture(text));
    expect(evidence[0].quote).toBe('\ud83d\ude00\t\u4e16\u754c\r\nnext\u00a0line.');
  });

  it.each([
    'her legend would have come down to us',
    'her legend would 6 have come down to us',
    'The name of Florence Nightingale lives in the memory of the universe',
    'The name of Florence Nightingale vision of female virtue',
    'florence nightingale',
    'died as she nearly did',
    '   \n\u3000',
  ])('rejects altered content: %s', (quote) => {
    expect(() => validateEvidence([{ segmentId: 's1', quote }], segmentLecture(excerpt))).toThrow(SourceReferenceError);
  });

  it('does not repair OCR text or concatenate words', () => {
    const text = 'unknown sat\nlabor; no\tbenefit';
    for (const quote of ['unknown labor', 'nobenefit']) {
      expect(() => validateEvidence([{ segmentId: 's1', quote }], segmentLecture(text))).toThrow(SourceReferenceError);
    }
  });

  it('rejects wrong segment IDs and references spanning two segments', () => {
    const segments = [
      { id: 's1', text: 'first part', start: 0, end: 10 },
      { id: 's2', text: ' next part', start: 10, end: 20 },
    ];
    for (const evidence of [
      [{ segmentId: 'missing', quote: 'first part' }],
      [{ segmentId: 's1', quote: 'next part' }],
      [{ segmentId: 's1', quote: 'first part next part' }],
    ]) expect(() => validateEvidence(evidence, segments)).toThrow(SourceReferenceError);
  });

  it('keeps exact citations unchanged and does not partially repair a failed list', () => {
    const exact = [{ segmentId: 's1', quote: excerpt.slice(4, 115) }];
    validateEvidence(exact, segmentLecture(excerpt));
    expect(exact[0].quote).toBe(excerpt.slice(4, 115));
    const evidence = [{ segmentId: 's1', quote: 'the world by virtue' }, { segmentId: 's1', quote: 'invented' }];
    const before = structuredClone(evidence);
    expect(() => validateEvidence(evidence, segmentLecture(excerpt))).toThrow(SourceReferenceError);
    expect(evidence).toEqual(before);
  });
});

describe('actionable material validation', () => {
  it('identifies invalid material IDs, references, duplicate options and duplicate content', () => {
    const kit = studyKitFixture();
    kit.quiz[0].options[1] = kit.quiz[0].options[0];
    kit.flashcards[0].topicId = 'unknown';
    kit.keyPoints.push(structuredClone(kit.keyPoints[0]));
    kit.summary[0].evidence = [{ segmentId: 's1', quote: 'Invented.' }];
    try {
      validateMaterials(kit, kit.topics, kit.source.segments);
      expect.fail('Invalid materials must be rejected.');
    } catch (error) {
      expect(error).toBeInstanceOf(MaterialValidationError);
      expect((error as MaterialValidationError).issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ itemId: 'q1', code: 'duplicate_options' }),
        expect.objectContaining({ itemId: 'f1', code: 'topic_reference' }),
        expect.objectContaining({ itemId: 'point1', code: 'duplicate_id' }),
        expect.objectContaining({ itemId: 'point1', code: 'duplicate_content' }),
        expect.objectContaining({ itemId: 'summary1', code: 'source_reference' }),
      ]));
    }
  });
});
