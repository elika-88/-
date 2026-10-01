import { z } from 'zod';
import type { SourceSegment } from '../schemas/studyMaterials';

export type SourceExcerpt = { sourceId: string; segmentId: string; text: string; start: number; end: number };

export function citationCatalog(segments: SourceSegment[]): SourceExcerpt[] {
  const excerpts: SourceExcerpt[] = [];
  for (const segment of segments) {
    let start = 0;
    while (start < segment.text.length) {
      let end = Math.min(start + 600, segment.text.length);
      if (end < segment.text.length) {
        const space = segment.text.lastIndexOf(' ', end);
        if (space > start + 300) end = space;
        else if (/^[\uDC00-\uDFFF]$/.test(segment.text[end])) end--;
      }
      const text = segment.text.slice(start, end);
      if (text.trim()) excerpts.push({ sourceId: `e${excerpts.length + 1}`, segmentId: segment.id, text, start: segment.start + start, end: segment.start + end });
      if (end === segment.text.length) break;
      // Overlap preserves context across excerpt boundaries without inventing text.
      const overlap = segment.text.indexOf(' ', end - 150);
      start = overlap >= end - 150 && overlap < end ? overlap + 1 : end;
    }
  }
  return excerpts;
}

// Modify only the provider-facing evidence representation. The saved application
// schema remains {segmentId, quote}, filled from trusted source text on the server.
export function citationSelectionSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(citationSelectionSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const object = schema as Record<string, unknown>;
  const properties = object.properties as Record<string, unknown> | undefined;
  if (object.type === 'object' && properties && Object.keys(properties).length === 2 && properties.segmentId && properties.quote) {
    return { type: 'object', properties: { sourceId: { type: 'string', description: 'An existing sourceId from the supplied source excerpts.' } }, required: ['sourceId'], additionalProperties: false };
  }
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, citationSelectionSchema(value)]));
}

const SelectionSchema = z.strictObject({ sourceId: z.string().min(1) });
export class CitationSelectionError extends Error {
  constructor() { super('Choose an existing sourceId from the supplied excerpts.'); this.name = 'CitationSelectionError'; }
}

export function resolveCitationSelections(value: unknown, catalog: SourceExcerpt[]): unknown {
  const byId = new Map(catalog.map(item => [item.sourceId, item]));
  function visit(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(Object.entries(node).map(([key, child]) => {
      if (key !== 'evidence' || !Array.isArray(child)) return [key, visit(child)];
      return [key, child.map(selection => {
        const parsed = SelectionSchema.safeParse(selection);
        const excerpt = parsed.success ? byId.get(parsed.data.sourceId) : undefined;
        if (!excerpt) throw new CitationSelectionError();
        return { segmentId: excerpt.segmentId, quote: excerpt.text };
      })];
    }));
  }
  return visit(value);
}
