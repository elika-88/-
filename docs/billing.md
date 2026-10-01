# 会员与 PayPal 订阅

Lumina 分为 **免费版**、**基础版** 和 **Pro 会员** 三档。基础版和 Pro 都可以按月或按年订阅。付款通过 PayPal Subscriptions 完成，网站不接触用户的卡号。

## 方案与额度

额度写在 `lib/billing/plans.ts`，改这一个文件即可调整。

| 项目 | 免费版 | 基础版 | Pro |
| --- | --- | --- | --- |
| 价格（美元） | $0 | $9.90/月，年付 $95 | $12.90/月，年付 $124 |
| 讲稿生成 | 每天 3 次 | 每天 40 次（合理使用上限） | 每天 40 次（合理使用上限） |
| 讲稿长度 | 20,000 字符 | 60,000 字符 | 60,000 字符 |
| 备考专区 | 不可用，显示升级页 | 不可用 | 每天 30 套，每套最多 15 题 |

未配置支付时，页面从 `lib/billing/prices.json` 展示上表价格；建套餐脚本也使用这个价格表。年费按年一次收取。配置支付后，页面显示 `PAYPAL_PRICE_*` 和 `PAYPAL_CURRENCY` 中的金额与币种，实际扣款以对应的 PayPal 套餐为准，两者必须一致。

修改代码或 `PAYPAL_PRICE_*` 不会修改已创建的 PayPal 套餐或现有订阅。已有套餐时，应先核对 PayPal 实际价格，再配置对应套餐 ID 与展示价格，不能只改页面数字。

- 每天的次数按 UTC 零点重置。只有生成成功才计次，失败不扣次数。
- 访客（未登录）也按免费版计算，用浏览器里的匿名 Cookie 计数。清除 Cookie 可以重置，所以只是软限制。只有登录用户才能订阅。
- **升级**：从基础版升级到 Pro 时，新的 Pro 订阅生效后，旧的基础版订阅会在 PayPal 自动取消，不会重复扣费。
- **降级**：要从 Pro 换成基础版，先取消 Pro，到期后再订阅基础版。
- **取消与扣款失败**：取消后，已付费的周期结束前保留原来的方案；PayPal 扣款失败（SUSPENDED）时立即回到免费版。

## 第一次配置（正式 Business 账号）

1. 在 [developer.paypal.com](https://developer.paypal.com) 切到 **Live**，在 Apps & Credentials 里创建应用，拿到 Client ID 和 Secret。
2. 写进本机的 `.env.local`（不要提交到 Git，也不要发到聊天里）：
   ```
   PAYPAL_ENV=live
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   ```
3. 创建商品和四个套餐（基础版、Pro 各有月付和年付），默认价格就是上表：
   ```
   npm run paypal:setup
   ```
   如果要改价格：
   ```
   npm run paypal:setup -- --basic-monthly 9.90 --basic-yearly 95 --pro-monthly 12.90 --pro-yearly 124
   ```
   脚本会输出 `PAYPAL_PLAN_BASIC_MONTHLY_ID` 等几行，把它们复制到 `.env.local`，然后重启 `npm run dev`。
4. 打开 `/pricing`，登录后就能看到 PayPal 订阅按钮。

## Webhook（上线时必须配置）

续费、取消、扣款失败这些事件由 PayPal 主动通知网站，接收地址是 `/api/billing/paypal/webhook`。这个地址必须能从公网通过 HTTPS 访问，所以本机开发时收不到通知，只能在部署后配置：

```
npm run paypal:setup -- --webhook-only --webhook-url https://你的域名/api/billing/paypal/webhook
```

`--webhook-only` 只创建 Webhook，不会重复建套餐。它会输出 `PAYPAL_WEBHOOK_ID`，填进服务器的环境变量即可。也可以在 PayPal 开发者后台的应用里手动添加 Webhook，勾选下面这些事件：

- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED`

没有配置 Webhook 时，网站会尝试在付款批准后立即向 PayPal 确认；只有服务器认证、订阅归属和状态核验成功，会员才会生效。用户在 PayPal 那边取消或续费失败时，也需要 Webhook 才能自动同步。

### 已付款但会员未开通

PayPal 收款与网站确认会员是两个步骤。按钮加载成功不代表服务器的 Client ID / Secret 可以取得访问令牌，确认失败也不能证明没有扣款。

1. 先查看 PayPal 交易和自动付款记录，不要重新订阅。保留以 `I-` 开头的订阅／自动付款协议编号；它不是交易 ID，也不是以 `P-` 开头的套餐 ID。
2. 管理员确认 Production 中的 `PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET` 来自同一个 Live 应用，`PAYPAL_ENV=live`，保存后重新部署。凭据仍失败时，查看 Vercel 日志中的 `PayPal token request failed`：这里只记录 HTTP 状态、环境、错误代码和 debug ID，不记录凭据或访问令牌。
3. 本次修复后，浏览器会按登录账号保存已批准但未确认的订阅编号，并暂时隐藏新的付款入口。在价格页选择“同步已有订阅（不重新付款）”，重试服务器核验同一订阅。刷新后该记录仍保留（取决于浏览器是否允许存储）。
4. 旧版本发生的付款或换设备时，登录原账号，展开“已经付款？恢复订阅”，输入原订阅编号。恢复只调用已有确认接口，仍会核验 PayPal 状态、套餐和账号归属；不会根据浏览器记录直接开通会员。
5. 也可在服务器凭据与 Webhook 修复后，通过 PayPal 的 Webhook 事件记录重发该订阅的通知。确认投递成功，并在网站检查会员状态；不要只凭发送动作判断已恢复。

`PAYPAL_AUTH_FAILED` 表示令牌接口返回认证失败；`PAYPAL_VERIFICATION_UNAVAILABLE` 表示该接口其他异常，不能一概归因于密钥填错。现有真实付款仍须在正式环境核实，模拟测试不会产生付款。

## 安全设计

- **浏览器不能自己宣称已付费。** 付款完成后，服务器会用订阅 ID 向 PayPal 重新查询，并同时核对三点：状态是 ACTIVE、套餐是我们配置的套餐、`custom_id` 是当前用户，全部通过才开通 Pro。
- **Webhook 必须通过 PayPal 验签**（`verify-webhook-signature`）。验签通过后，服务器还会重新查询一次订阅，再更新数据库。
- **密钥只在服务器端使用。** 浏览器只会拿到公开的 Client ID 和套餐 ID。

## 测试

`tests/billing.test.ts` 覆盖了以下情况：

- 免费版额度用完后被拦截；
- 长讲稿需要基础版或 Pro；
- 基础版不含备考专区，备考专区需要 Pro；
- 升级会替换旧订阅，旧订阅迟到的通知不会覆盖新订阅；
- 别人的订阅、未知套餐都不会开通 Pro；
- 取消后在付费期内仍是 Pro；
- Webhook 验签失败会被拒绝。

真实付款流程需要在 PayPal 里实际订阅一次。可以先用 `PAYPAL_ENV=sandbox` 配上沙箱密钥和沙箱测试买家账号跑一遍，确认没问题再切回 `live`。
