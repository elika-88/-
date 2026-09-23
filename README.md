# LECTOR AI / Lumina

将讲稿转换为有原文依据的摘要、要点、测试题和复习卡片。前端采用 Lumina 界面，项目原名 LECTOR AI。

## 已实现

- 讲稿输入、输出语言，以及通过服务端 `.env` 配置的 API 根地址、密钥和模型。
- 分析 → 并行生成三组材料 → 原文引用校验 → 独立 AI 审核 → 必要时修复。
- 真实阶段进度、取消、错误提示、重新生成。
- 四类材料页签、答题计分/重做、错题主题复习、翻卡、原文高亮。
- 登录用户的课程与生成材料云同步，支持搜索、重命名、删除、保存重试和版本冲突处理；访客使用本机历史，选择导入后才复制到账号。失败保留旧结果。
- 界面语言与浅色、深色、系统主题设置。
- 普通用户注册、用户名或邮箱登录、会话恢复和退出：侧栏「登录或注册账号」，或直接访问 `/login`、`/signup`。

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

密钥只保存在服务端环境中，不发送给浏览器。`.env` 已被 Git 忽略；`.env.local` 的同名变量会优先于 `.env`。登录用户的讲稿与成功材料保存在账号数据库，访客历史保存在 localStorage。未完成的账号保存暂存在当前标签页按账号隔离的 sessionStorage 中；云端保存成功后移除，关闭标签页前应完成同步或下载备份。

本次发布使用用户名、邮箱和密码直接注册，不发送验证邮件，不要求 Resend 或自有域名。邮箱尚未验证，不能作为已验证身份或密码找回依据；邮件验证留待发件域名就绪后接入，计划见 `docs/email-verification-roadmap.md`。

## 检查

```bash
npm run check
npx playwright install chromium
npm run test:e2e
```

check 包含 lint、typecheck、单元测试、生产 build。Playwright 自动使用独立 `.next-e2e` 输出目录和独立本地 SQLite 数据库，清空 Turso 配置以防写入真实数据库，可以与 3000 端口开发服务并行。不要同时运行两个 Playwright 套件。下载受限时，PowerShell 可先设置 `$env:PLAYWRIGHT_CHANNEL = 'chrome'` 或 `'msedge'` 使用已安装浏览器。

真实测试完成两次：短讲稿约183秒，1,538词讲稿约200秒，每次10题、12卡片、36个审核条目；第二次通过真实页面完成生成、答题、翻卡和来源查看。早期串行版本有超时及审核失败。这不是所有输入的成功率保证。

## 架构和限制

Next.js、React、TypeScript、Tailwind、Zod、OpenAI SDK。普通路径为分析1次、并行材料3次、审核1次。最多15次调用，总限时240秒。引用、ID、选项、主题和审核覆盖由代码校验。审核仍可能漏错，不能声称100%准确。

输入至少80个词单位和300个非空白字符，最多60,000字符及16,000个o200k_base token；第三方模型计数可能不同。复杂或含糊讲稿可能被拒绝，修复也可能耗尽时限。英文界面，材料可跟随讲稿或指定中俄英。

普通用户认证复用 xiaomao 在 `4254dd7` 提交的数据库实现：密码以 scrypt 哈希保存，登录会话使用 HttpOnly Cookie，有效期七天，退出时撤销服务端会话。普通用户登录不会获得管理员权限；管理员仍通过 `/admin` 独立登录。用户数据库表在首次使用时自动创建。工作区通过 `/api/study-sessions` 保存账号课程，650 ms 防抖、串行写入，并通过 revision 处理多设备冲突。不同账号视图和访客历史相互隔离；设置中的 JSON 导出包含当前工作区及未保存编辑。详情见下方学习记录接入文档。

本地开发使用 SQLite；Vercel 自动使用 `@libsql/client` 连接 Turso。生产部署必须设置 `TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN`，以及 `ADMIN_PASSWORD`、`ADMIN_ENCRYPTION_KEY`；没有持久化数据库时管理页会明确提示配置缺失。首次打开管理页使用 `/api/admin/status` 检查状态，因此未登录不会产生误导性的 `/api/admin` 401 日志。详见 `docs/admin.md`。

自托管时若要启用按 IP 限流，只在可信反向代理**覆盖** `X-Real-IP` 后设置 `AUTH_TRUST_PROXY=true`；不要信任浏览器自行提交的转发头。没有可信客户端 IP 时，程序不会用一个共享的“direct”桶封锁所有用户，应在入口代理另设限流。

## 文档

- [任务分工](docs/team-tasks.md)
- [后端接入](docs/backend-handoff.md)
- [前端接入](docs/frontend-handoff.md)
- [接口契约](docs/api-contract.md)
- [评估记录](docs/evaluation.md)
- [学习记录接入服务端数据库：开发交接](docs/study-records-server-integration.md)

后续重点：降低延迟、更多语言与主题的人工评估、线上并发和额度控制。
