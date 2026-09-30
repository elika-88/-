# 会员与 PayPal 订阅

Lumina 分为 **免费版** 和 **Pro 会员**（按月或按年）。付款通过 PayPal Subscriptions 完成，网站不接触用户的卡号。

## 方案与额度

额度写在 `lib/billing/plans.ts`，改这一个文件即可调整。

| 项目 | 免费版 | Pro |
| --- | --- | --- |
| 讲稿生成 | 每天 3 次 | 每天 40 次（合理使用上限） |
| 讲稿长度 | 20,000 字符 | 60,000 字符 |
| 备考专区 | 不可用，显示升级页 | 每天 30 套，每套最多 15 题 |

- 每天的次数按 UTC 零点重置。只有生成成功才计次，失败不扣次数。
- 访客（未登录）也按免费版计算，用浏览器里的匿名 Cookie 计数。清除 Cookie 可以重置，所以只是软限制。只有登录用户才能订阅。
- 取消订阅后，已付费的周期结束前仍是 Pro。PayPal 扣款失败（SUSPENDED）时立即回到免费版。

## 第一次配置（正式 Business 账号）

1. 在 [developer.paypal.com](https://developer.paypal.com) 切到 **Live**，在 Apps & Credentials 里创建应用，拿到 Client ID 和 Secret。
2. 写进本机的 `.env.local`（不要提交到 Git，也不要发到聊天里）：
   ```
   PAYPAL_ENV=live
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   ```
3. 创建商品和两个套餐，价格自己定：
   ```
   npm run paypal:setup -- --monthly 4.99 --yearly 39.99
   ```
   脚本会输出 `PAYPAL_PLAN_MONTHLY_ID` 等几行，把它们复制到 `.env.local`，然后重启 `npm run dev`。
4. 打开 `/pricing`，登录后就能看到 PayPal 订阅按钮。

## Webhook（上线时必须配置）

续费、取消、扣款失败这些事件由 PayPal 主动通知网站，接收地址是 `/api/billing/paypal/webhook`。这个地址必须能从公网通过 HTTPS 访问，所以本机开发时收不到通知，只能在部署后配置：

```
npm run paypal:setup -- --monthly 4.99 --yearly 39.99 --webhook-url https://你的域名/api/billing/paypal/webhook
```

如果套餐已经建好，不想再建一遍，可以在 PayPal 开发者后台的应用里手动添加 Webhook，勾选下面这些事件，然后把 Webhook ID 填到 `PAYPAL_WEBHOOK_ID`：

- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED`

没有配置 Webhook 时，订阅当下仍会生效（付款后网站会立即向 PayPal 确认）。但用户在 PayPal 那边取消、或者续费失败时，网站不会自动更新。

## 安全设计

- **浏览器不能自己宣称已付费。** 付款完成后，服务器会用订阅 ID 向 PayPal 重新查询，并同时核对三点：状态是 ACTIVE、套餐是我们配置的套餐、`custom_id` 是当前用户，全部通过才开通 Pro。
- **Webhook 必须通过 PayPal 验签**（`verify-webhook-signature`）。验签通过后，服务器还会重新查询一次订阅，再更新数据库。
- **密钥只在服务器端使用。** 浏览器只会拿到公开的 Client ID 和套餐 ID。

## 测试

`tests/billing.test.ts` 覆盖了以下情况：

- 免费版额度用完后被拦截；
- 备考专区和长讲稿需要 Pro；
- 别人的订阅、未知套餐都不会开通 Pro；
- 取消后在付费期内仍是 Pro；
- Webhook 验签失败会被拒绝。

真实付款流程需要在 PayPal 里实际订阅一次。可以先用 `PAYPAL_ENV=sandbox` 配上沙箱密钥和沙箱测试买家账号跑一遍，确认没问题再切回 `live`。
