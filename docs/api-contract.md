# E02 生成接口与共享类型 v1.1

最新配置变更：API 连接改为服务端 `.env` 配置。页面只发送 `title`、`lecture`、`outputLanguage`；路由拒绝 `provider` 覆盖并返回 `INVALID_PROVIDER_CONFIG`。下文 v1.1 的浏览器自定义配置说明是旧版行为。`OPENAI_MODEL` 默认 `gpt-5.5`；`OPENAI_API_FORMAT` 支持 `responses` / `chat_completions`。

更新：后端已实现生成与审核，合法请求不再返回 501。默认响应为下面定义的 NDJSON；发送 `Accept: application/json` 时成功响应直接为 `StudyKit`，失败为 JSON 错误包。真实接入与部署限制见 [后端接入说明](backend-handoff.md)。早期骨架描述仅为历史记录。

本文件对应项目骨架的接口定义。`POST /api/generate` 已实现请求校验和 JSON 错误响应；合法输入目前返回 **HTTP 501 / `NOT_IMPLEMENTED`**。AI 生成、流式传输、原文分段、语义审核和结果页尚未实现，不应把这个版本作为比赛完成版。

## 1. 前后端导入入口

| 入口 | 内容 | 负责人 |
| --- | --- | --- |
| `lib/input.ts` | `GenerateRequestSchema`、`OutputLanguageSchema`、`INPUT_LIMITS`、`countWords`、`validateLecture`、`validateGenerationInput` | elika-88 |
| `lib/schemas/studyMaterials.ts` | AI 输入/输出 Schema、最终 `StudyKitSchema` 和由 Zod 推导的类型 | elika-88 |
| `lib/contracts/generation.ts` | 进度事件 Schema、联合类型、NDJSON 编码、终止事件判断；重新导出请求和错误类型 | elika-88 |
| `lib/contracts/errors.ts` | 稳定错误码、错误响应 Schema、HTTP 状态映射 | elika-88 |
| `lib/provider.ts` | 自定义 API URL、密钥和模型的 Schema 与默认值 | elika-88 |
| `lib/server/env.ts` | 服务端环境变量读取，标记为 `server-only` | elika-88 |
| `lib/openai.ts` | 按请求创建独立 SDK 客户端；返回 client 和 model | elika-88 |

xiaomao 直接从这些模块导入类型，不另建 DTO。共享模块不会导入 OpenAI 客户端或服务端密钥。`lib/server/` 不可导入到客户端组件；环境校验延迟到实际调用，因此安装、测试和构建不需要 API 密钥。

## 2. 请求

```http
POST /api/generate
Content-Type: application/json
```

```json
{
  "title": "",
  "lecture": "用户提交的完整讲稿",
  "outputLanguage": "auto"
}
```

上述三个字段都必填，`title` 可为空字符串。支持 `auto`、`ru`、`en`、`zh`；`auto` 表示跟随讲稿语言。文本不做自动 trim 或改写，以保留原文引用位置。

v1.1 新增可选的 `provider` 对象，未提供时保留服务器默认配置模式，旧请求继续有效：

```json
{
  "title": "",
  "lecture": "用户提交的完整讲稿",
  "outputLanguage": "auto",
  "provider": {
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "<user-supplied-key>",
    "model": "gpt-5-mini"
  }
}
```

自定义模式的三个字段必须完整，不能从服务端密钥补齐缺失值。拒绝顶层 `apiKey`、未知字段和 null provider。URL 与模型/密钥会去除首尾空白，URL 去除末尾斜杠。模型 ID 是自由文本，允许 `vendor/model`，不绑定固定列表。

Base URL 必须为 HTTPS，或 HTTP 的 localhost / 127.0.0.1 / ::1；拒绝 URL 内的用户名、密码、查询参数和 fragment。填写 API 根地址（如 `/v1`），不是 `/responses` 或 `/chat/completions` 的完整操作地址。本地地址指应用服务端所在机器，不是远端访问者的设备。

自定义设置只存在于页面内存，不写入 localStorage、sessionStorage、cookie 或配置文件；刷新清空，切回服务器模式或重置会清空密钥。提交时 provider 经请求正文发送到本站服务端，错误响应不回显密钥，不能把整个请求对象存到学习会话或日志中。

后续 E04 使用 `createOpenAIClient(request.provider)` 获取 client/model。工厂会隔离服务端 admin key、organization、project 等隐式环境配置，关闭 SDK 日志和自动重试，禁止请求重定向。当前生成路由仅验证配置，仍返回 501，不向自定义地址发起外部请求；测试工厂的请求转发使用单元测试专用传输替身。外部服务是否支持 Responses API 和 Structured Outputs 尚未实测，公网接入时需在 E04/E06 中实现出站目标策略，不能将配置校验等同于网络访问授权。

当前输入规则：

- 标题最多 200 个 UTF-16 代码单元。
- 讲稿最多 60,000 个 UTF-16 代码单元，包括空白。
- 讲稿至少 300 个非空白 UTF-16 代码单元、80 个词单位；两项同时满足。
- 词单位由 `Intl.Segmenter("und", { granularity: "word" })` 的 `isWordLike` 统计；中文不依赖空格。该数量不是模型 token 数，也不能证明内容足够丰富。
- 请求正文最多 512 KiB，服务端按实际接收字节计数，不依赖 `Content-Length`。
- `INPUT_LIMITS.maxInputTokens = 16_000` 是留给 E03 的服务端 token 上限；当前版本尚未实现 token 计数，不能声称已校验这个限制。真实模型接入前必须补齐。

`GenerateRequestSchema` 只负责字段结构和标题长度；需要调用 `validateGenerationInput` 才会执行讲稿长度和词数校验。前端可提前显示错误，服务端始终重新校验。

## 3. 开始流之前的错误

```json
{
  "error": {
    "code": "INPUT_TOO_SHORT",
    "message": "Please provide at least 80 words and 300 non-whitespace characters.",
    "retryable": false
  }
}
```

接口消息是安全的英文回退文案，UI 按 `code` 本地化。`retryable` 表示相同请求是否适合在条件恢复后重试；它不是自动重试指令。只有未来 pipeline 的显式策略才可以触发有界重试。

| 错误码 | HTTP 状态 | 当前骨架可返回 |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | 是：无效 JSON、编码、结构或标题长度 |
| `INVALID_PROVIDER_CONFIG` | 400 | 是：自定义 URL、密钥或模型不完整或不合法 |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | 是：Content-Type 不是 JSON |
| `EMPTY_INPUT` | 400 | 是 |
| `INPUT_TOO_SHORT` | 400 | 是 |
| `INPUT_TOO_LONG` | 413 | 是：字符或请求字节超过上限 |
| `NOT_IMPLEMENTED` | 501 | 是：输入合法，但生成流程未接入 |
| `INSUFFICIENT_CONTENT` | 422 | E04 后接入 |
| `SERVER_CONFIG` | 503 | E04 后接入 |
| `RATE_LIMITED` | 429 | E06 后接入 |
| `UPSTREAM_FAILURE`、`INVALID_OUTPUT` | 502 | E04-E06 后接入 |
| `MODEL_REFUSAL`、`VERIFICATION_FAILED` | 422 | E04-E06 后接入 |
| `TIMEOUT` | 504 | E06 后接入 |

框架对不支持的 HTTP 方法返回 405；该框架响应不属于上述应用 JSON 错误包。

## 4. 流式事件契约

以下 Schema 和编码工具已实现，但骨架尚不发送成功流。E06 输出、X03 消费。传输类型为 `application/x-ndjson`，UTF-8，每条事件占一行，以 `\n` 结束。TCP/fetch 数据块可能包含半行或多行，不能对每个 chunk 直接 `JSON.parse`。

每条事件的 `runId` 为 UUID，同一次运行必须一致。客户端还应持有自己的请求标识，在收到服务端 runId 之前也能阻止旧请求更新 UI。

| type | 字段 | 约束 |
| --- | --- | --- |
| `stage` | `runId`、`stage` | 阶段为 `validating / analyzing / generating / verifying / correcting / complete` |
| `retry` | `runId`、`stage`、`attempt`、`maxAttempts`、`message` | attempt 为下一次调用的序号，初次调用算 1；事件中的 attempt 为 2 或 3，且不超过 maxAttempts；不允许重试 validating/complete 阶段 |
| `result` | `runId`、`data: StudyKit` | 成功终止事件，外层 runId 必须等于 data.runId |
| `error` | `runId`、`error: GenerationError` | 失败终止事件；流开始后不通过 HTTP 状态变化表达错误 |

例如真实进入分析阶段时才发送：

```json
{"type":"stage","runId":"9e37789a-d9d3-4539-b381-7b19db62e715","stage":"analyzing"}
```

每次运行恰好一个终止事件。`complete` 阶段不是成功数据；流结束但没有 `result` 或 `error` 时按断线失败处理。终止后不得继续发送或接收其他事件。单个事件的 Zod 校验已实现；跨事件 runId、一致终止、取消和断流状态机分别由 E06/X03 实现，不能仅凭单个 Schema 判定整个流有效。

`encodeGenerationEvent` 会先校验，再执行 JSON 序列化和加换行。X03 解析后的未知数据必须通过 `GenerationEventSchema`，禁止用类型断言代替运行时校验。

## 5. 材料数据

Schema 是唯一事实来源；不要从文档复制另一份类型。可导入 `Analysis`、`GeneratedMaterials`、`StudyKit`、`QuizQuestion`、`Flashcard`、`ReviewItem` 等推导类型。

| 字段/类型 | 约定 |
| --- | --- |
| `Evidence` | `segmentId`、`quote`；材料至少一条证据；审核失败记录允许空证据数组 |
| `SourceSegment` | `id`、`text`、`start`、`end`；位置指向未修改原文，UTF-16 `[start, end)` |
| `Analysis` | 标题、语言、sufficient、可为 null 的 insufficiencyReason、主题、概念、关系和歧义 |
| `overview` | 有独立 id、text、evidence 的 Claim，不是裸字符串 |
| `summary` | 每节有 title、text、topicIds、evidence |
| `keyPoints` | 每项有 text、topicId、importance、evidence |
| `quiz` | 四个字符串选项；correctAnswer 仅 0/1/2/3；question、explanation、topicId、kind、evidence |
| `flashcards` | front、back、topicId、evidence |
| `limitations` | 数量不足等真实限制；没有限制时为空数组 |
| `StudyKit` | 材料字段加 runId、原文及分段、主题、审核明细和代码计算的统计值 |

通常生成 8-10 题、10-12 张卡片。Schema 容许更少但非零数量，避免为凑数编造；达到常规题量的策略和不足说明由后续生成/校验阶段执行。

当前 Schema 检查字段、类型、长度、枚举、严格对象结构；它不证明引文存在、不证明答案正确，也不保证 id 唯一或审核数量一致。E03/E05 必须实现原文区间校验、引用匹配、主题关联、id 唯一性、审核全覆盖、统计一致性和事实支持检查，只有通过这些检查才可发送最终 `result`。

`AnalysisSchema`、`GeneratedMaterialsSchema`、`VerificationResponseSchema` 保持为可转换的普通 Zod 对象，已纳入 `zodTextFormat` SDK 转换测试。跨事件约束放在传输契约中，语义约束放在后续 pipeline 中。结构化输出本身不能取代来源审核。

## 6. 给 xiaomao 的交接

1. 安装与运行按 README 操作；不配置 API key 也能开发和执行基础检查。
2. `app/page.tsx` 目前只是最小表单和错误联调页面；从 X01 开始由你接管页面、布局、样式和 `components/`。
3. 现有页面只消费 JSON 错误；X03 接入真实生成时必须升级为先判断状态和 Content-Type，再消费 NDJSON 流。
4. `/results` 当前固定重定向到 `/`；X03/X04 接入会话状态后替换。
5. 单元测试 fixture 只存在于 `tests/fixtures/`，禁止从运行时代码导入；当前应用没有模拟 AI 结果。
6. `tests/e2e/foundation.spec.ts` 是骨架的浏览器回归基线；后续接入生成流程时由双方一起更新 HTTP 501 的断言。
7. E02 代码交付后仍需你评审契约；未得到实际评审前不会记录为“双方已确认”。
