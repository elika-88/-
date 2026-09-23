# 后台生成配置与接口

后台生成使用 Inngest 负责可靠投递和执行，Turso 负责任务状态、输入快照和结果。浏览器关闭后，任务仍可继续；浏览器只负责查询状态。

## Vercel 配置

1. 在 Inngest 控制台创建或选择应用，复制 **Event Key** 和 **Signing Key**。不要把它们提交到 GitHub，也不要发到聊天中。
2. 打开 Vercel 项目 `elika-88/-` 的 **Settings -> Environment Variables**，为 **Production**（并按需为 Preview）添加：

   - `LUMINA_BACKGROUND_GENERATION=true`
   - `INNGEST_EVENT_KEY`：Inngest Event Key
   - `INNGEST_SIGNING_KEY`：Inngest Signing Key
   - `TURSO_DATABASE_URL`：当前生产数据库 URL
   - `TURSO_AUTH_TOKEN`：当前生产数据库 token

   AI 配置继续使用已有的 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`、`OPENAI_API_FORMAT`，或者已保存的 admin 配置。后台任务只读取服务端配置，不接受或保存用户 API key。

3. 点击 **Deployments -> Redeploy**，选择最新 `main` 部署并确认使用最新环境变量。
4. 在 Inngest 控制台把应用同步到生产 URL：
   `https://lumina-six-chi-20.vercel.app/api/inngest`
5. 确认 Inngest 中出现两个函数：`generate-study-kit` 和 `recover-generation-jobs`。恢复函数每分钟运行一次，用于重新投递中断任务和清理过期任务。

如果 Inngest 尚未同步，接口会返回 `503 QUEUE_UNAVAILABLE`，不会创建一个用户看不到的任务。配置完成前可保持 `LUMINA_BACKGROUND_GENERATION=false`。

## 本地调试

使用 Inngest Dev Server 后，在本机环境文件中设置 `INNGEST_DEV=1` 和 `LUMINA_BACKGROUND_GENERATION=true`，然后启动 Next.js 与 Inngest Dev Server。不要把本地密钥写入 `.env.example`。

## 接口

所有接口都要求已登录，并要求 `X-Lumina-Account` 等于当前账号 ID。

- `POST /api/generation-jobs`：`{ sessionId, expectedRevision, idempotencyKey }`，课程必须已云保存。返回 `202` 和 `job`。
- `GET /api/generation-jobs?active=true&sessionId=<id>`：列出当前账号的任务。
- `GET /api/generation-jobs/<jobId>`：查询任务和成功后的 `result`。
- `POST /api/generation-jobs/<jobId>/cancel`：取消排队或执行中的任务。
- `POST /api/generation-jobs/<jobId>/retry`：对失败/取消任务重试，body 为新的 `{ idempotencyKey }`。

任务状态为 `queued`、`running`、`succeeded`、`failed`、`cancelled`。`sourceRevision` 是提交时课程版本。完成时若课程仍是该版本，结果更新原课程；若用户已经编辑，结果另存为新课程；若课程已删除，结果只保存在任务中，不会恢复已删除课程。

## 限制

每个账号同时运行 1 个任务；每小时最多 5 次、每天最多 20 次。单个任务最多执行 2 次，排队超过 30 分钟会失败。任务结果保留 30 天。计费账本和套餐额度属于后续任务，本阶段只有基础并发和频率保护。
