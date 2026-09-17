# 后端接入说明

连接设置仅来自服务端 `.env`：OPENAI_BASE_URL、OPENAI_API_KEY、OPENAI_MODEL（默认 gpt-5.5）、OPENAI_API_FORMAT（responses 或 chat_completions）。两种接口都要求严格 JSON Schema 输出；网页不提供 API 设置，浏览器 provider 覆盖被拒绝。

超时优化：分析只输出主题与必要歧义；默认8道题、10张卡片，摘要控制为3-5个简短章节。并行生成成功的组保留在本次请求内，某组失败不会重做其它组；审核传输或格式失败只重试审核。审核指出问题时只重新生成受影响的组，然后整份重新审核。缓存不跨请求、不持久化，不改变模型和240秒整体上限。

后端已实现真实 Responses / Chat Completions API 调用：讲稿分段 → 分析 → 三组并行生成四类材料 → 引用校验 → 独立审核 → 最多两轮修复。最终结果保持原 `StudyKit` 字段，前端已接入。

## 最快接入

```ts
const response = await fetch('/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ title, lecture, outputLanguage }),
});
const body = await response.json();
if (!response.ok) throw new Error(body.error.message);
// body 是 StudyKit；overview.text、summary、keyPoints、quiz、flashcards
```

需要真实阶段进度时不发送 `Accept: application/json`，响应为 NDJSON。按换行缓冲解析；`stage` 显示阶段，`retry` 显示修复，`result.data` 是最终结果，`error.error` 是错误。未收到终止事件就断流须视作失败。

环境配置使用 `.env` 中的 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 和 `OPENAI_API_FORMAT`。仅服务端配置决定请求目标；服务须支持所选接口和严格 JSON Schema。已有 `.env.local` 的同名变量会优先于 `.env`。

最多240秒、15次模型调用；普通路径5次调用。结构/来源错误最多重试两次，审核结论按条目反馈修复。API错误不回显原始上游内容。16,000 o200k_base token是应用预算，第三方模型计数可能不同。

质量数字由审核记录计算。AI 审核仍可能出错，不得宣传 100% 准确。人工评估和完整前端联调仍需进行。原文引用精确匹配，重复出现的引文可展示整个对应片段；前端不应声称重复引文只对应唯一位置。
