"use client";

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { BillingInterval, PaidPlanId } from '@/lib/billing/plans';
import { revenueCatPackage, withRevenueCat, type RevenueCatPublicConfig } from '@/lib/client/revenuecat';
import { setPendingRevenueCat } from '@/lib/client/pending-revenuecat';
import { useSettings } from '@/lib/i18n/SettingsContext';
import styles from './billing.module.css';

export function RevenueCatSubscribeButton({ config, tier, interval, userId, onPurchased, onError, onBusy }: {
  config: RevenueCatPublicConfig; tier: PaidPlanId; interval: BillingInterval; userId: string;
  onPurchased: () => Promise<void>; onError: (message: string) => void; onBusy: (busy: boolean) => void;
}) {
  const { language } = useSettings();
  const zh = language === 'zh';
  const [price, setPrice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const clicking = useRef(false);
  useEffect(() => {
    let active = true;
    void withRevenueCat(config, userId, sdk => revenueCatPackage(sdk, config, tier, interval))
      .then(pkg => { if (active) setPrice(pkg.product.price.formattedPrice); })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [config, userId, tier, interval]);
  async function purchase() {
    if (clicking.current) return;
    clicking.current = true; onBusy(true); let started = false;
    try {
      await withRevenueCat(config, userId, async sdk => {
        const response = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'revenuecat', tier, interval }), signal: AbortSignal.timeout(30_000) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Checkout is unavailable.');
        if (data.appUserId !== userId || data.publicApiKey !== config.publicApiKey || data.products?.[tier]?.[interval] !== config.products[tier][interval]) throw new Error('Your account or plan changed. Reload before subscribing.');
        const pkg = await revenueCatPackage(sdk, config, tier, interval);
        setPendingRevenueCat(userId, true); started = true;
        await sdk.purchase({ rcPackage: pkg });
      });
      await onPurchased();
    } catch (error) {
      const { PurchasesError, ErrorCode } = await import('@revenuecat/purchases-js');
      if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError) setPendingRevenueCat(userId, false);
      else onError(started ? (zh ? '暂时无法确认订阅。若已付款，请勿重复支付，在下方同步 RevenueCat 订阅。' : 'Subscription confirmation is pending. If you paid, do not pay again; sync your RevenueCat subscription below.') : error instanceof Error ? error.message : 'Checkout is unavailable.');
    } finally { clicking.current = false; onBusy(false); }
  }
  if (loadError) return <p className={styles.error}>{zh ? '此方案暂时无法加载，请刷新或联系支持。' : 'This plan could not load. Refresh or contact support.'}</p>;
  return <div className={styles.manage}>
    <p className={styles.price}>{price ?? '…'}<span>{interval === 'monthly' ? (zh ? '/ 月' : '/ month') : (zh ? '/ 年' : '/ year')}</span></p>
    {config.sandbox && <p className={styles.muted}>{zh ? '测试模式：不收取真实费用' : 'Sandbox: no real charge'}</p>}
    <Button type="button" disabled={!price} onClick={() => void purchase()}>{zh ? '通过 RevenueCat 订阅' : 'Subscribe with RevenueCat'}</Button>
  </div>;
}
