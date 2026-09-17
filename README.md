# LECTOR AI / Lumina

将讲稿转换为有原文依据的摘要、要点、测试题和复习卡片。前端采用 Lumina 界面，项目原名 LECTOR AI。

## 已实现

- 讲稿输入、输出语言、自定义 API 根地址/密钥/模型。
- 分析 → 并行生成三组材料 → 原文引用校验 → 独立 AI 审核 → 必要时修复。
- 真实阶段进度、取消、错误提示、重新生成。
- 四类材料页签、答题计分/重做、错题主题复习、翻卡、原文高亮。
- 本机历史记录、搜索、重命名、删除；失败保留旧结果。
- 1,538 词演示讲稿加载；只预置输入，材料现场生成。

## 安装和运行

Node.js 22.15+，npm。

```bash
npm ci
npm run dev
```

访问 http://127.0.0.1:3000 。生产演示使用 `npm run build` 后执行 `npm start`。

复制 `.env.example` 为 `.env.local`，配置：

| 变量 | 用途 |
| --- | --- |
| OPENAI_API_KEY | 服务端密钥 |
| OPENAI_BASE_URL | API 根地址，默认 https://api.openai.com/v1 |
| OPENAI_MODEL | 精确模型 ID；默认 gpt-5-mini，本次实测使用 gpt-6-astra |
| ALLOWED_API_BASE_URLS | 生产环境额外允许的完整根地址，逗号分隔 |

不要在示例文件保存真实密钥。也可在页面 API settings → Use custom API 输入完整配置。服务必须支持 Responses API 和严格结构化输出。URL 为根地址，不是 /responses 操作路径；HTTP 仅限回环地址。生产环境只允许默认根地址、服务端配置地址和额外允许列表。

自定义密钥只存在于页面内存与请求处理，刷新或关闭自定义模式清空。讲稿和成功材料保存在 localStorage，可从历史记录删除。

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

无登录、数据库、音视频、聊天和导出。线上部署尚未完成，需要登录配置、可用API凭据及足够的函数执行时限。React ESLint插件当前使用兼容的ESLint 9，安装可能显示弃用提示。

## 文档

- [任务分工](docs/team-tasks.md)
- [后端接入](docs/backend-handoff.md)
- [前端接入](docs/frontend-handoff.md)
- [接口契约](docs/api-contract.md)
- [演示步骤](docs/demo.md)
- [评估记录](docs/evaluation.md)

后续重点：降低延迟、更多语言与主题的人工评估、线上并发和额度控制。
