# 生成接口契约 v1.2

## 请求

POST /api/generate，Content-Type 为 application/json：

```json
{
  "title": "",
  "lecture": "完整讲稿",
  "outputLanguage": "auto",
  "provider": {
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "<用户提供的密钥>",
    "model": "gpt-6-astra"
  }
}
```

provider 可省略，省略时使用服务器环境配置；提供时三个字段必须完整。自定义地址不继承服务器密钥。语言支持 auto/en/ru/zh。未知字段会被拒绝，原讲稿不会被自动trim。

限制：标题200字符、讲稿60,000字符、至少80词单位和300非空白字符、16,000 o200k_base token、请求正文512KiB。中文词单位使用Intl.Segmenter。

## 响应

默认 application/x-ndjson，UTF-8，每条JSON后换行。客户端必须跨chunk缓冲行和UTF-8字符。

| type | 字段 | 含义 |
| --- | --- | --- |
| stage | runId, stage | validating/analyzing/generating/verifying/correcting/complete |
| retry | runId, stage, attempt, maxAttempts, message | attempt为下一次尝试序号，2或3 |
| result | runId, data | data为StudyKit，内外runId一致 |
| error | runId, error | 安全错误包 |

每次运行只有一个终止事件result或error，终止后关闭流。complete不能替代result；断流、混合runId、多终止事件都应视为失败。

显式发送Accept: application/json时，成功响应直接为StudyKit，失败返回相应HTTP状态和错误包。

```json
{"error":{"code":"SERVER_CONFIG","message":"安全错误文案","retryable":false}}
```

流开始前错误通过HTTP状态表示，开始后通过error事件表示。错误码及HTTP状态以lib/contracts/errors.ts为准。没有原501占位行为。

## 类型与校验

- lib/input.ts：请求Schema、输入限制和计数。
- lib/provider.ts：配置Schema。
- lib/schemas/studyMaterials.ts：材料、原文、审核及最终结果Schema。
- lib/contracts/generation.ts：共享事件及类型。
- lib/ai/grounding.ts：引用、ID、主题、选项和审核覆盖校验。
- lib/client/generationStream.ts：流式消费与取消。

答案索引为0-3。overview包含id/text/evidence；summary、keyPoints、quiz、flashcards均带证据。Evidence为segmentId和原文quote；SourceSegment为原文UTF-16 [start,end)。统计由代码计算，模型不填写可信统计。

独立审核返回每个材料条目的状态和理由，代码将其与已校验且由审核检查的材料证据关联。部分支持或不支持会触发修复及重审；仍失败则拒绝发布。AI审核不是准确性证明。

## 配置和边界

服务须支持Responses API与严格JSON Schema。根地址必须HTTPS或HTTP本机回环，禁止内嵌用户名密码、query、fragment。生产模式只接受默认地址、OPENAI_BASE_URL及ALLOWED_API_BASE_URLS允许列表；本地地址指服务端机器。重定向被禁用。

密钥不持久化、不回显，不得存入学习历史。默认请求15次调用上限、240秒整体时限。原文与成功材料可保存在本机历史，用户可删除。详情见backend-handoff.md。
