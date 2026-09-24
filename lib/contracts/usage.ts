import { z } from 'zod';

const count = z.number().int().nonnegative();
export const UsageSummarySchema = z.strictObject({
  userId: z.uuid(),
  plan: z.literal('beta'),
  unit: z.literal('study_kit'),
  period: z.strictObject({ start: count, end: count }),
  limit: count, used: count, reserved: count, remaining: count,
  generationPaused: z.boolean(),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;
