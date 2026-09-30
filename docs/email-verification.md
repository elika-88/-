# Lumina 邮箱验证配置

注册邮箱验证已经启用。用户注册后不会立即创建账号，服务会向邮箱发送 30 分钟内有效的一次性链接；用户打开链接设置密码后，才会创建账号并自动登录。

## Vercel 环境变量

在项目的 **Settings → Environment Variables** 中，为 **Production** 添加：

| 变量 | 值 |
| --- | --- |
| `APP_BASE_URL` | `https://lectorai.tech` |
| `RESEND_API_KEY` | Resend 控制台生成的服务端密钥 |
| `RESEND_FROM_EMAIL` | 已验证域名下的发件地址，例如 `no-reply@lectorai.tech` |

不要把密钥提交到 GitHub，也不要发到聊天中。保存后在 Vercel 对最新部署执行 **Redeploy**。

## Resend 域名

在 Resend 的 **Domains → Add Domain** 添加 `lectorai.tech`。Resend 会显示需要加入 DNS 的 SPF、DKIM 等记录；在 Vercel 的域名 DNS 管理中逐条添加，直到 Resend 显示 **Verified**。只有完成验证后，注册邮件才会正常送达。

## 验证范围

- `/api/auth` 的注册接口只返回待验证状态，不会签发登录 Cookie。
- 验证链接使用 URL fragment 传递令牌，令牌不会发送到服务器日志。
- 令牌只保存 SHA-256 摘要，30 分钟后过期，成功使用后立即删除。
- 重复注册会替换同一邮箱的旧令牌；发送失败会清理待验证记录。
- 缺少邮件配置时注册返回 503，不会创建半成品账号。

现有在邮箱验证上线前创建的账号仍可正常登录；它们的邮箱尚未被证明为已验证地址。
