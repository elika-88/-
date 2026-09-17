# LECTOR AI / Lumina

将讲稿转换为有原文依据的摘要、要点、测试题和复习卡片。前端采用 Lumina 界面，项目原名 LECTOR AI。

## 已实现

- 讲稿输入、输出语言，以及通过服务端 `.env` 配置的 API 根地址、密钥和模型。
- 分析 → 并行生成三组材料 → 原文引用校验 → 独立 AI 审核 → 必要时修复。
- 真实阶段进度、取消、错误提示、重新生成。
- 四类材料页签、答题计分/重做、错题主题复习、翻卡、原文高亮。
- 本机历史记录、搜索、重命名、删除；失败保留旧结果。
- 界面语言与浅色、深色、系统主题设置。

## 安装和运行

新增管理后台与SQLite数据库：运行 `npm run admin:setup` 后重启，访问 `/admin`。密码在本机 `.env.local` 的 `ADMIN_PASSWORD` 中。后台可保存加密API配置、模型及接口类型，立即供后续生成使用。详见 [管理说明](docs/admin.md)。此数据库方案需要持久化磁盘，不能直接用于无持久化磁盘的多实例部署。

Node.js 22.15+，npm。

```bash
npm ci
npm run dev
```

访问 http://127.0.0.1:3000 。生产演示使用 `npm run build` 后执行 `npm start`。

在项目根目录 `.env` 配置（已有本地配置请保留）：

| 变量 | 用途 |
| --- | --- |
| OPENAI_API_KEY | 服务端密钥 |
| OPENAI_BASE_URL | API 根地址，默认 https://api.openai.com/v1 |
| OPENAI_MODEL | 精确模型 ID，默认 gpt-5.5 |
| OPENAI_API_FORMAT | responses 或 chat_completions，匹配中转站支持的接口 |

不要在示例文件保存真实密钥。网页不提供 API 配置，路由拒绝浏览器提交的 provider 覆盖。服务必须支持所选接口和严格 JSON Schema 结构化输出。URL 为 API 根地址，通常以 /v1 结尾，不是 /responses 或 /chat/completions 操作路径；HTTP 仅限回环地址。修改配置后重启服务。

密钥只保存在服务端环境中，不发送给浏览器。`.env` 已被 Git 忽略；`.env.local` 的同名变量会优先于 `.env`。讲稿和成功材料保存在 localStorage，可从历史记录删除。

## 检查

```bash
npm run check
npx playwright install chromium
npm run test:e2e
```

check 包含 lint、typecheck、单元测试、生产 build。浏览器测试前停止其他开发服务器；同一目录不能并行运行 dev 和 build。下载受限时，PowerShell 可先设置 `$env:PLAYWRIGHT_CHANNEL = 'chrome'` 使用已安装 Chrome。

真实测试完成两次：短讲稿约183秒，1,538词讲稿约200秒，每次10题、12卡片、36个审核条目；第二次通过真实页面完成生成、答题、翻卡和来源查看。早期串行版本有超时及审核失败。这不是所有输入的成功率保证。

## 架构和限制

Next.js、React、TypeScript、Tailwind、Zod、OpenAI SDK。普通路径为分析1次、并行材料3次、审核1次。最多15次调用，总限时240秒。引用、ID、选项、主题和审核覆盖由代码校验。审核仍可能漏错，不能声称100%准确。

输入至少80个词单位和300个非空白字符，最多60,000字符及16,000个o200k_base token；第三方模型计数可能不同。复杂或含糊讲稿可能被拒绝，修复也可能耗尽时限。英文界面，材料可跟随讲稿或指定中俄英。

普通用户登录和注册尚未接入真实身份验证，模拟登录、伪造用户 ID 和用户写入接口已移除。管理员登录、配置保存和审计日志使用现有服务端接口。学习材料可导出为本地 JSON。

当前数据库调用仍使用本地 SQLite；虽然安装了 `@libsql/client`，Turso 驱动尚未接入，配置 Turso 变量不会自动迁移数据库。Vercel 上的数据库功能需完成云端驱动接入后再部署。已有数据库记录和本地学习历史不会因清理演示功能而被删除。

## 文档

- [任务分工](docs/team-tasks.md)
- [后端接入](docs/backend-handoff.md)
- [前端接入](docs/frontend-handoff.md)
- [接口契约](docs/api-contract.md)
- [评估记录](docs/evaluation.md)

后续重点：降低延迟、更多语言与主题的人工评估、线上并发和额度控制。
