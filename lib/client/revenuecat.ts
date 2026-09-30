"use client";

import type { Package, Purchases } from '@revenuecat/purchases-js';
import type { BillingInterval, BillingSummary, PaidPlanId } from '@/lib/billing/plans';

export type RevenueCatPublicConfig = NonNullable<BillingSummary['revenuecat']>;
let instance: { apiKey: string; userId: string; sdk: Purchases } | null = null;
let queue: Promise<unknown> = Promise.resolve();

// The singleton cannot change accounts in the middle of another checkout.
export function withRevenueCat<T>(config: RevenueCatPublicConfig, userId: string, action: (sdk: Purchases) => Promise<T>): Promise<T> {
  const task = queue.then(async () => {
    const { Purchases } = await import('@revenuecat/purchases-js');
    if (!instance || instance.apiKey !== config.publicApiKey) {
      instance?.sdk.close();
      instance = { apiKey: config.publicApiKey, userId, sdk: Purchases.configure({ apiKey: config.publicApiKey, appUserId: userId }) };
    } else if (instance.userId !== userId) {
      await instance.sdk.changeUser(userId);
      instance.userId = userId;
    }
    return action(instance.sdk);
  });
  queue = task.catch(() => undefined);
  return task;
}

export async function revenueCatPackage(sdk: Purchases, config: RevenueCatPublicConfig, tier: PaidPlanId, interval: BillingInterval): Promise<Package> {
  const offerings = await sdk.getOfferings({ currency: 'USD' });
  const offering = offerings.all[config.offeringId];
  const pkg = offering?.availablePackages.find(p => p.product.identifier === config.products[tier][interval]);
  if (!pkg || pkg.product.normalPeriodDuration !== (interval === 'monthly' ? 'P1M' : 'P1Y')) throw new Error('This plan is not available. Please contact support.');
  return pkg;
}
