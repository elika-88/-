import 'server-only';
import { inngest } from './inngest';
import { reserveJobDeliveries } from './generation-jobs';

export async function dispatchGenerationJobs(id?: string) {
  const deliveries = await reserveJobDeliveries(id);
  if (!deliveries.length) return { sent: 0 };
  try {
    await inngest.send(deliveries.map(job => ({
      name: 'lumina/generation.requested',
      id: `generation-${job.id}-${job.delivery}`,
      data: { jobId: job.id },
    })));
    return { sent: deliveries.length };
  } catch {
    // The committed outbox will be retried by the sweeper. Never lose accepted
    // work or ask the user to create another billable task after a send timeout.
    console.warn(JSON.stringify({ event: 'generation_dispatch_deferred', count: deliveries.length }));
    return { sent: 0 };
  }
}
