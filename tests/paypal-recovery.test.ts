import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('PayPal verification diagnostics', () => {
  const config = { env: 'live' as const, baseUrl: 'https://api-m.paypal.com', clientId: 'test-client', clientSecret: 'secret-not-to-log', webhookId: null, currency: 'USD', plans: { basic: { monthly: null, yearly: null }, pro: { monthly: null, yearly: null } } };

  it('reports rejected credentials without claiming an approved payment failed or logging secrets', async () => {
    const { getSubscription } = await import('@/lib/server/paypal');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: 'invalid_client', error_description: config.clientSecret, debug_id: 'abc123' }, { status: 401 }));
    await expect(getSubscription(config, 'I-APPROVED1', fetcher)).rejects.toMatchObject({ code: 'PAYPAL_AUTH_FAILED', status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain(config.clientSecret);
    expect(log).toHaveBeenCalledWith('PayPal token request failed', expect.objectContaining({ status: 401, debugId: 'abc123' }));
  });

  it('does not misdiagnose upstream downtime as wrong credentials', async () => {
    const { getSubscription } = await import('@/lib/server/paypal');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(getSubscription(config, 'I-APPROVED1', fetcher)).rejects.toMatchObject({ code: 'PAYPAL_VERIFICATION_UNAVAILABLE' });
  });

  it('refreshes the access token after a secret changes', async () => {
    const { getSubscription } = await import('@/lib/server/paypal');
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).endsWith('/oauth2/token')
      ? Response.json({ access_token: 'test-token', expires_in: 3600 })
      : Response.json({ id: 'I-APPROVED1', status: 'ACTIVE' }));
    await getSubscription(config, 'I-APPROVED1', fetcher);
    await getSubscription(config, 'I-APPROVED1', fetcher);
    await getSubscription({ ...config, clientSecret: 'rotated-secret' }, 'I-APPROVED1', fetcher);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/oauth2/token'))).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/billing/subscriptions/'))).toHaveLength(3);
  });
});

describe('pending subscription recovery', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  });

  it('keeps recovery separate per account and cannot clear a newer approval', async () => {
    const pending = await import('@/lib/client/pending-paypal');
    pending.savePendingPayPal('alice', 'I-APPROVED1');
    expect(pending.readPendingPayPal('bob')).toBeNull();
    pending.savePendingPayPal('alice', 'I-APPROVED2');
    pending.clearPendingPayPal('alice', 'I-APPROVED1');
    expect(pending.readPendingPayPal('alice')).toBe('I-APPROVED2');
    pending.clearPendingPayPal('alice', 'I-APPROVED2');
    expect(pending.readPendingPayPal('alice')).toBeNull();
  });

  it('survives reload and refuses plan IDs and invalid values', async () => {
    let pending = await import('@/lib/client/pending-paypal');
    pending.savePendingPayPal('alice', 'P-NOTASUBSCRIPTION');
    expect(pending.readPendingPayPal('alice')).toBeNull();
    pending.savePendingPayPal('alice', 'I-APPROVED1');
    vi.resetModules();
    pending = await import('@/lib/client/pending-paypal');
    expect(pending.readPendingPayPal('alice')).toBe('I-APPROVED1');
  });

  it('keeps a usable in-memory recovery hint when browser storage is blocked', async () => {
    vi.stubGlobal('window', { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } } });
    const pending = await import('@/lib/client/pending-paypal');
    pending.savePendingPayPal('alice', 'I-APPROVED1');
    expect(pending.readPendingPayPal('alice')).toBe('I-APPROVED1');
    pending.clearPendingPayPal('alice', 'I-APPROVED1');
    expect(pending.readPendingPayPal('alice')).toBeNull();
  });
});
