import 'server-only';
import { Inngest } from 'inngest';
import { isLocalInngest } from './generation-job-config';

export const inngest = new Inngest({
  id: 'lumina-background-generation',
  isDev: isLocalInngest(),
  // Do not leak course content, provider credentials or raw errors to broker logs.
  fetch: (input, init) => fetch(input, { ...init, signal: init?.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }),
});
