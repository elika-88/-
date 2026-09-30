import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/user-auth', () => ({
  AccountError: class extends Error {},
  getUserFromRequest: vi.fn(async () => ({ id: 'account-a' })),
  readAccountJson: (request: Request) => request.json(),
  requireSameOrigin: vi.fn(),
}));
vi.mock('@/lib/server/paypal', () => ({
  PayPalError: class extends Error { constructor(message: string, public status: number, public code: string) { super(message); } },
  paypalConfig: () => ({ env: 'live' }),
  planForPayPalId: vi.fn(() => ({ tier: 'basic', interval: 'yearly' })),
  getSubscription: vi.fn(), cancelSubscription: vi.fn(),
}));
vi.mock('@/lib/server/billing', () => ({
  activeSubscriptionId: vi.fn(async () => null),
  syncSubscription: vi.fn(async () => ({ applied: true })),
  billingSummary: vi.fn(async () => ({ plan: 'basic', signedIn: true })),
}));
import { POST } from '@/app/api/billing/paypal/confirm/route';
import { getSubscription, PayPalError, planForPayPalId } from '@/lib/server/paypal';
import { syncSubscription } from '@/lib/server/billing';

const request = () => new Request('https://example.invalid/api/billing/paypal/confirm', { method: 'POST', body: JSON.stringify({ subscriptionId: 'I-APPROVED1' }) });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(planForPayPalId).mockReturnValue({ tier: 'basic', interval: 'yearly' }); });

describe('recovering an already approved subscription', () => {
  it('keeps access locked on authentication failure and allows a later verified retry', async () => {
    vi.mocked(getSubscription).mockRejectedValueOnce(new PayPalError('Authentication unavailable; do not pay again.', 503, 'PAYPAL_AUTH_FAILED'));
    const failed = await POST(request());
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ code: 'PAYPAL_AUTH_FAILED' });
    expect(syncSubscription).not.toHaveBeenCalled();
    vi.mocked(getSubscription).mockResolvedValue({ id: 'I-APPROVED1', status: 'ACTIVE', custom_id: 'account-a', plan_id: 'P-BASIC-Y' });
    const recovered = await POST(request());
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({ plan: 'basic' });
    expect(syncSubscription).toHaveBeenCalledTimes(1);
  });

  it('cannot restore someone else’s paid subscription', async () => {
    vi.mocked(getSubscription).mockResolvedValue({ id: 'I-APPROVED1', status: 'ACTIVE', custom_id: 'another-account', plan_id: 'P-BASIC-Y' });
    expect((await POST(request())).status).toBe(403);
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it('cannot grant access based on an unapproved subscription', async () => {
    vi.mocked(getSubscription).mockResolvedValue({ id: 'I-APPROVED1', status: 'APPROVAL_PENDING', custom_id: 'account-a', plan_id: 'P-BASIC-Y' });
    expect((await POST(request())).status).toBe(409);
    expect(syncSubscription).not.toHaveBeenCalled();
  });
});
