import type { Evidence, GeneratedMaterials, ReviewItem, SourceSegment, Topic } from '../schemas/studyMaterials';

export class ReviewFailure extends Error {
  constructor(public issues: Pick<ReviewItem, 'itemId' | 'status' | 'reason'>[]) {
    super('Some claims or their citations are not fully supported.');
    this.name = 'ReviewFailure';
  }
}

export function materialItems(materials: GeneratedMaterials) {
  return [materials.overview, ...materials.summary, ...materials.keyPoints, ...materials.quiz, ...materials.flashcards];
}

export class SourceReferenceError extends Error {
  constructor() {
    super('Quote does not match its source segment.');
    this.name = 'SourceReferenceError';
  }
}

type MaterialIssue = { itemId: string; code: 'source_reference' | 'duplicate_id' | 'topic_reference' | 'duplicate_options' | 'duplicate_content'; reason: string };

export class MaterialValidationError extends Error {
  constructor(public issues: MaterialIssue[]) {
    super('Learning materials failed validation.');
    this.name = 'MaterialValidationError';
  }
}

function sourceQuote(quote: string, text: string): string | null {
  if (!quote.trim()) return null;
  if (text.includes(quote)) return quote;

  // Match whitespace only, then recover the literal source span for saved citations.
  // Never delete line numbers, fix OCR words, or match across source segments.
  const parts: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  for (const match of text.matchAll(/\s+|\S+/gu)) {
    const value = /^\s/u.test(match[0]) ? ' ' : match[0];
    parts.push(value);
    for (let i = 0; i < value.length; i++) {
      starts.push(match.index + i);
      ends.push(value === ' ' ? match.index + match[0].length : match.index + i + 1);
    }
  }
  const normalized = quote.replace(/\s+/gu, ' ').trim();
  const index = parts.join('').indexOf(normalized);
  return index === -1 ? null : text.slice(starts[index], ends[index + normalized.length - 1]);
}

export function validateEvidence(evidence: Evidence[], segments: SourceSegment[]) {
  if (!evidence.length) throw new Error('Missing source evidence.');
  const quotes = evidence.map((item) => {
    const segment = segments.find((part) => part.id === item.segmentId);
    const quote = segment ? sourceQuote(item.quote, segment.text) : null;
    if (quote === null) throw new SourceReferenceError();
    return quote;
  });
  for (let i = 0; i < evidence.length; i++) evidence[i].quote = quotes[i];
}

export function validateMaterials(materials: GeneratedMaterials, topics: Topic[], segments: SourceSegment[]) {
  const items = materialItems(materials);
  if (!topics.length || new Set(topics.map((item) => item.id)).size !== topics.length) throw new Error('Invalid topic IDs.');
  for (const topic of topics) validateEvidence(topic.evidence, segments);
  const issues: MaterialIssue[] = [];
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) issues.push({ itemId: item.id, code: 'duplicate_id', reason: 'Use a unique ID across all material groups.' });
    ids.add(item.id);
    try { validateEvidence(item.evidence, segments); }
    catch { issues.push({ itemId: item.id, code: 'source_reference', reason: 'Copy a literal quote from its stated segment. Preserve embedded numbers and punctuation.' }); }
  }
  const topicIds = new Set(topics.map((item) => item.id));
  const references = [...materials.summary.flatMap((item) => item.topicIds), ...materials.keyPoints.map((item) => item.topicId), ...materials.quiz.map((item) => item.topicId), ...materials.flashcards.map((item) => item.topicId)];
  for (const item of [...materials.summary, ...materials.keyPoints, ...materials.quiz, ...materials.flashcards]) {
    const referenced = 'topicIds' in item ? item.topicIds : [item.topicId];
    if (referenced.some((id) => !topicIds.has(id))) issues.push({ itemId: item.id, code: 'topic_reference', reason: 'Use only topic IDs from the supplied analysis.' });
  }
  for (const question of materials.quiz) {
    if (new Set(question.options.map((option) => option.trim().toLowerCase())).size !== 4) issues.push({ itemId: question.id, code: 'duplicate_options', reason: 'Provide four distinct answer options.' });
  }
  for (const group of [materials.quiz.map((item) => ({ id: item.id, text: item.question })), materials.flashcards.map((item) => ({ id: item.id, text: item.front })), materials.keyPoints]) {
    const seen = new Set<string>();
    for (const item of group) {
      const text = item.text.trim().toLowerCase();
      if (seen.has(text)) issues.push({ itemId: item.id, code: 'duplicate_content', reason: 'Remove this duplicate or replace it with a distinct source-supported item.' });
      seen.add(text);
    }
  }
  if (issues.length) throw new MaterialValidationError(issues);
  return new Set(references).size;
}

export function validateReview(materials: GeneratedMaterials, reviews: ReviewItem[], segments: SourceSegment[]) {
  const ids = new Set(materialItems(materials).map((item) => item.id));
  if (reviews.length !== ids.size || new Set(reviews.map((item) => item.itemId)).size !== ids.size || reviews.some((item) => !ids.has(item.itemId))) throw new Error('Review must cover every item exactly once.');
  for (const item of reviews) if (item.status === 'supported') validateEvidence(item.evidence, segments);
  const concerns = reviews.filter((item) => item.status !== 'supported');
  if (concerns.length) throw new ReviewFailure(concerns.map(({ itemId, status, reason }) => ({ itemId, status, reason })));
}
