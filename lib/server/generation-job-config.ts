import 'server-only';
import { AccountError } from './user-auth';

export const JOB_LIMITS = {
  attempts: 2, timeoutMs: 220_000, leaseMs: 300_000,
  retryDelayMs: 15_000, deliveryRetryMs: 120_000, queueTimeoutMs: 30 * 60_000,
  perUserHour: 5, perUserDay: 20, globalHour: 100, globalDay: 500,
  activePerUser: 1, activeGlobal: 100, retentionMs: 30 * 24 * 60 * 60_000,
} as const;

export function isLocalInngest() {
  return !['1', 'true'].includes(process.env.VERCEL ?? '')
    && process.env.NODE_ENV !== 'production' && process.env.INNGEST_DEV === '1';
}
export function backgroundGenerationEnabled() {
  return process.env.LUMINA_BACKGROUND_GENERATION === 'true';
}
export function requireBackgroundGeneration() {
  if (!backgroundGenerationEnabled()) throw new AccountError('BACKGROUND_DISABLED', 'Background generation is not enabled yet.', 503);
  if (!isLocalInngest() && (!process.env.INNGEST_EVENT_KEY?.trim() || !process.env.INNGEST_SIGNING_KEY?.trim())) {
    throw new AccountError('QUEUE_UNAVAILABLE', 'Background generation is not configured. Contact the administrator.', 503);
  }
}
