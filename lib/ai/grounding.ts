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

export function validateEvidence(evidence: Evidence[], segments: SourceSegment[]) {
  if (!evidence.length) throw new Error('Missing source evidence.');
  for (const item of evidence) {
    const segment = segments.find((part) => part.id === item.segmentId);
    if (!item.quote.trim() || !segment?.text.includes(item.quote)) throw new Error('Quote does not match its source segment.');
  }
}

export function validateMaterials(materials: GeneratedMaterials, topics: Topic[], segments: SourceSegment[]) {
  const items = materialItems(materials);
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error('Material IDs must be unique.');
  if (!topics.length || new Set(topics.map((item) => item.id)).size !== topics.length) throw new Error('Invalid topic IDs.');
  for (const item of [...items, ...topics]) validateEvidence(item.evidence, segments);
  const topicIds = new Set(topics.map((item) => item.id));
  const references = [...materials.summary.flatMap((item) => item.topicIds), ...materials.keyPoints.map((item) => item.topicId), ...materials.quiz.map((item) => item.topicId), ...materials.flashcards.map((item) => item.topicId)];
  if (references.some((id) => !topicIds.has(id))) throw new Error('Unknown topic reference.');
  for (const question of materials.quiz) {
    if (new Set(question.options.map((option) => option.trim().toLowerCase())).size !== 4) throw new Error('Quiz options must be distinct.');
  }
  for (const texts of [materials.quiz.map((item) => item.question), materials.flashcards.map((item) => item.front), materials.keyPoints.map((item) => item.text)]) {
    if (new Set(texts.map((text) => text.trim().toLowerCase())).size !== texts.length) throw new Error('Duplicate learning items.');
  }
  return new Set(references).size;
}

export function validateReview(materials: GeneratedMaterials, reviews: ReviewItem[], segments: SourceSegment[]) {
  const ids = new Set(materialItems(materials).map((item) => item.id));
  if (reviews.length !== ids.size || new Set(reviews.map((item) => item.itemId)).size !== ids.size || reviews.some((item) => !ids.has(item.itemId))) throw new Error('Review must cover every item exactly once.');
  for (const item of reviews) if (item.status === 'supported') validateEvidence(item.evidence, segments);
  const concerns = reviews.filter((item) => item.status !== 'supported');
  if (concerns.length) throw new ReviewFailure(concerns.map(({ itemId, status, reason }) => ({ itemId, status, reason })));
}
