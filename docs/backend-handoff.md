# 后端接入说明

当前连接设置仅来自服务端 `.env`：`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL=gpt-5.5`、`OPENAI_API_FORMAT=responses` 或 `chat_completions`。两种接口均需严格 JSON Schema 支持；下方旧版示例中的 `provider` 参数不再允许从浏览器提交。

后端已经实现真实 Responses API 调用：讲稿分段 → 分析 → 四类材料生成 → 引用校验 → 独立审核 → 最多两轮修复。最终结果保持原 `StudyKit` 字段。页面文件未修改，由前端负责人接入。

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

最多 240 秒、10 次模型调用；结构/来源错误最多重试两次。API 认证、限流等失败返回安全错误，不回显原始上游响应。输入上限 16,000 o200k_base token，此计数对第三方模型仅为应用保守预算，并非该模型的精确 tokenizer。

质量数字由审核记录计算。AI 审核仍可能出错，不得宣传 100% 准确。人工评估和完整前端联调仍需进行。原文引用精确匹配，重复出现的引文可展示整个对应片段；前端不应声称重复引文只对应唯一位置。
