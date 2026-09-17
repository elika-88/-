# 后端接入说明

后端已实现真实 Responses API 调用：讲稿分段 → 分析 → 三组并行生成四类材料 → 引用校验 → 独立审核 → 最多两轮修复。最终结果保持原 `StudyKit` 字段，前端已接入。

## 最快接入

```ts
const response = await fetch('/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ title, lecture, outputLanguage, ...(provider ? { provider } : {}) }),
});
const body = await response.json();
if (!response.ok) throw new Error(body.error.message);
// body 是 StudyKit；overview.text、summary、keyPoints、quiz、flashcards
```

需要真实阶段进度时不发送 `Accept: application/json`，响应为 NDJSON。按换行缓冲解析；`stage` 显示阶段，`retry` 显示修复，`result.data` 是最终结果，`error.error` 是错误。未收到终止事件就断流须视作失败。

环境配置使用 `.env.local` 中的 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`。服务须支持 Responses API 和严格 JSON Schema。自定义配置仍通过 provider 提交，不继承服务器密钥。生产模式仅允许默认地址、环境变量指定地址及 `ALLOWED_API_BASE_URLS`（逗号分隔完整 Base URL）列出的地址；开发模式允许自定义本地 API。

最多240秒、15次模型调用；普通路径5次调用。结构/来源错误最多重试两次，审核结论按条目反馈修复。API错误不回显原始上游内容。16,000 o200k_base token是应用预算，第三方模型计数可能不同。

质量数字由审核记录计算。AI 审核仍可能出错，不得宣传 100% 准确。人工评估和完整前端联调仍需进行。原文引用精确匹配，重复出现的引文可展示整个对应片段；前端不应声称重复引文只对应唯一位置。
