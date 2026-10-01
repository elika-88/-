import 'server-only';
import { z } from 'zod';
import { inngest } from './inngest';
import { backgroundGenerationEnabled } from './generation-job-config';
import { recoverGenerationJobs } from './generation-jobs';
import { dispatchGenerationJobs } from './generation-dispatch';
import { runGenerationJob } from './generation-worker';

export const generateInBackground = inngest.createFunction({
  id: 'generate-study-kit',
  triggers: [{ event: 'lumina/generation.requested' }],
  concurrency: 3,
  // The database owns the two-attempt budget, including redelivery/crashes.
  retries: 0,
  checkpointing: false,
}, async ({ event, step }) => {
  if (!backgroundGenerationEnabled()) return { disabled: true };
  const input = z.object({ jobId: z.uuid() }).parse(event.data);
  return step.run('generate-and-save', () => runGenerationJob(input.jobId));
});

export const recoverBackgroundJobs = inngest.createFunction({
  id: 'recover-generation-jobs',
  // New jobs dispatch immediately; this sweep is only for recovery and cleanup.
  triggers: [{ cron: '*/10 * * * *' }],
  concurrency: 1,
  retries: 1,
  checkpointing: false,
}, async ({ step }) => {
  if (!backgroundGenerationEnabled()) return { disabled: true };
  await step.run('recover-leases-and-expire-history', recoverGenerationJobs);
  return step.run('deliver-outbox', () => dispatchGenerationJobs());
});
