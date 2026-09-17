# LECTOR AI 两人任务分工

最新集成状态：前端迁入与后端已合并，真实生成短讲稿及1,538词演示讲稿均成功；答题、卡片、来源和历史可用。以下编号保留为任务归属；原先的骨架状态记录已过时。当前剩余交付重点是团队人工准确性复核和线上部署验证，详见 evaluation.md。

成员：**elika-88** 与 **xiaomao**。开发分支分别为 `elika` 和 `xiaomao`，`main` 用作可演示的集成分支。

时间安排按里程碑推进，不假设比赛的具体时长。技术细节参见 [实施方案](implementation-plan.md)，代码层接口参见 [接口契约](api-contract.md)。

当前进度：E01 项目骨架已完成本地验收；E02 共享类型和请求接口代码已完成，xiaomao 评审仍待进行。已通过 npm ci、lint、typecheck、30 项单元测试、生产 build，以及使用本机 Chrome 的 4 项桌面/手机视口浏览器测试。其他任务尚未验收，基础表单不代表 X01-X03 的完整交付。

## 1. 分工原则

elika-88 负责从讲稿到已审核学习材料的服务端流程；xiaomao 负责从输入讲稿到学习与复习的用户流程。每项任务只有一个主负责人，另一人承担评审和验收。

两人的工作量按交付范围平衡：elika-88 的主要难点是 AI 输出与证据可靠性；xiaomao 的主要难点是异步状态、学习交互、移动端适配和端到端测试。发生阻塞时，优先帮助对方完成当前里程碑，不扩展额外功能。

共同底线：真实 API、四类材料、原文依据、重复处理、清晰错误。暂不做登录、支付、数据库、聊天、音视频、复杂 RAG；文件导入和导出也不占用核心开发时间。

## 2. elika-88 的任务

| 编号 | 任务 | 主要文件或交付物 | 依赖 | 验收标准 |
| --- | --- | --- | --- | --- |
| E01 | 初始化项目和工具链 | `package.json`、锁文件、TypeScript/Next/Tailwind 配置、`.gitignore`、`.env.example`、测试脚本 | 无 | 本地可启动；lint、typecheck、初始 build 可执行；密钥不会被提交；双方安装同一套依赖 |
| E02 | 定义共享数据和事件接口 | `lib/schemas/studyMaterials.ts`、`lib/contracts/generation.ts`、`lib/input.ts` | E01；与 xiaomao 共同评审 | 请求、结果、进度、错误字段完整；答案索引约定为 0-3；前后端复用同一份类型和输入规则 |
| E03 | 实现输入校验与原文分段 | `lib/source.ts`、`lib/input.ts`、`tests/input.test.ts` | E02 | 空、短、超长输入被拒绝；分段保留原文位置；中俄英输入可正确处理；片段 ID 稳定 |
| E04 | 接入真实 AI 分析和生成 | `lib/openai.ts`、`lib/prompts/`、`lib/ai/analyzeLecture.ts`、`lib/ai/generateMaterials.ts` | E02、E03 | 一篇真实讲稿生成摘要、要点、题目和卡片；结构符合 Schema；演示路径没有预制结果 |
| E05 | 实现引用校验、审核和修复 | `lib/ai/verifyMaterials.ts`、证据校验模块、`tests/grounding.test.ts` | E04 | 引文存在于对应原文；每项材料都有审核记录；不支持的内容修复后重审；计数由代码计算 |
| E06 | 串联 API、进度、取消和重试 | `app/api/generate/route.ts`、`lib/ai/pipeline.ts`、`lib/ai/retry.ts` | E04；与 X03 尽早联调，最终接入 E05 | 输出真实阶段事件；能取消和超时；重试有上限；失败有明确错误；只有审核通过才发送最终结果 |
| E07 | 后端故障测试与准确性修复 | `tests/pipeline.test.ts`、后端测试配置、`docs/prompts.md` | E05、E06 | 覆盖 API 失败、无效输出、缺失审核项、错误引用、重试耗尽；修复人工评估发现的问题 |
| E08 | 部署与技术交付 | Vercel 配置、环境变量、README 技术章节、`docs/architecture.md` | 联调和发布检查通过 | 线上真实生成成功；部署使用评审后的代码；README 可复现运行；说明真实限制和配置项 |

E06 的进度传输框架可在 E02 后开始，先让 X03 接入真实校验/错误事件；不能提前把未经审核的材料标为最终可用结果。

## 3. xiaomao 的任务

| 编号 | 任务 | 主要文件或交付物 | 依赖 | 验收标准 |
| --- | --- | --- | --- | --- |
| X01 | 搭建界面结构与基础样式 | `app/layout.tsx`、`app/globals.css`、`components/ui/` | E01；确认基础交接 | 输入页就是可用工作区；品牌清楚；移动端无溢出；表单和按钮可键盘操作 |
| X02 | 实现讲稿输入 | `app/page.tsx`、`components/LectureInput.tsx` | E02、X01 | 标题、讲稿、语言、字数和生成操作完整；空短文本提示清楚；演示按钮只载入讲稿 |
| X03 | 实现请求与会话状态 | `components/StudySessionProvider.tsx`、`components/ProcessingState.tsx`、`lib/client/generationStream.ts` | E02；与 E06 联调 | 正确解析跨网络分块的事件；取消、断线、错误可恢复；旧请求不能覆盖新结果；失败不丢失输入 |
| X04 | 实现摘要、要点和原文查看 | `app/results/page.tsx`、`components/StudyDashboard.tsx`、`SummaryView.tsx`、`KeyPointsView.tsx`、`SourceEvidence.tsx`、`QualityIndicator.tsx` | E02、X01；最终接入 X03 | 四个页签可切换；摘要与要点分开；引用打开原文并定位；审核计数只读真实结果 |
| X05 | 实现测试题学习流程 | `components/QuizView.tsx` | X04 | 选择、检查、解释、原文、下一题、总分、重做完整；已检查答案锁定；记录错题主题 |
| X06 | 实现卡片与错题复习 | `components/FlashcardsView.tsx` | X04、X05 | 翻转、前后切换、计数正常；可按错题主题筛选；无匹配卡片时有明确状态；可恢复全部卡片 |
| X07 | 浏览器测试和视觉检查 | `tests/study-flow.spec.ts`、Playwright 配置 | X02-X06；E06 | 测试重新生成、错误恢复、计分、卡片、来源抽屉；桌面和手机无重叠；刷新和结果页直达有合理行为 |
| X08 | 演示讲稿、人工评估与演示流程 | `public/demo/lecture.txt`、`docs/evaluation.md`、`docs/demo.md` | 讲稿可提前准备；评估需真实结果 | 准备 1,500-3,000 词且主题丰富的讲稿并记录来源/使用条件；建立逐项评估表；完成 2-4 分钟演示排练并记录实际耗时 |

X08 的评估表由 xiaomao 组织，elika-88 必须共同核对：20 项材料陈述、10 个题目答案、10 个卡片答案。实际数量不足时记录真实分母，不编造评估数据。

## 4. 共享接口先确定

E02 由 elika-88 编写，xiaomao 评审后双方开始依赖它。下表契约已在共享 Schema 中定义；API 当前只执行请求校验，合法输入返回 501，实际生成和事件流仍待 E04-E06 实现。以 [接口契约](api-contract.md) 区分已实现内容与后续责任。

| 项目 | 约定 |
| --- | --- |
| 请求 | `POST /api/generate`，JSON 为 `{ title, lecture, outputLanguage, provider? }`；provider 为自定义 `{ baseURL, apiKey, model }`，不传则使用服务器配置；详情见接口契约 v1.1 |
| 客户端请求身份 | 每次提交生成本地请求标识；只允许当前请求更新状态；取消或重新提交时废弃旧标识 |
| 非流式错误 | 开始处理前返回相应 HTTP 状态和 `{ error: { code, message, retryable } }` |
| 传输 | 成功开始后使用 `application/x-ndjson`；每行一个完整 JSON 事件，客户端按换行缓冲解析 |
| 事件公共字段 | 每条事件携带 `type`、`runId`；同一次运行的 `runId` 不变 |
| `stage` | 携带 `stage`，值为 `validating`、`analyzing`、`generating`、`verifying`、`correcting`、`complete` |
| `retry` | 携带 `stage`、`attempt`、`maxAttempts`、`message`；`attempt` 是包括初次调用在内的下一次尝试序号 |
| `result` | 携带 `data: StudyKit`；为成功终止事件；`data.runId` 与事件 `runId` 一致 |
| `error` | 携带 `error: { code, message, retryable }`；为失败终止事件；流开始后不能依赖 HTTP 状态变化 |
| 终止规则 | 每次运行恰好一个 `result` 或 `error`；没有终止事件的断流按失败处理；`complete` 阶段本身不代替成功结果 |
| 材料类型 | 以共享 Zod Schema 为唯一来源；禁止前端另写一套不一致的 DTO；完整草案见实施方案 |
| 题目答案 | 四个选项，`correctAnswer` 为 0-3；展示 A-D 时才转换；答案检查后显示解释 |
| 证据 | `segmentId` 和原文 `quote`；原文位置由服务端确定，UI 不信任模型自报的位置 |
| 输入范围 | 上下限和计数函数放在共享模块，前端提示和后端校验一致；最终安全校验始终在服务端 |
| 不足与失败 | 来源信息不足时明确说明；最终结果不得包含未解决的审核失败项 |

错误码至少覆盖 `EMPTY_INPUT`、`INPUT_TOO_SHORT`、`INPUT_TOO_LONG`、`INSUFFICIENT_CONTENT`、`SERVER_CONFIG`、`RATE_LIMITED`、`UPSTREAM_FAILURE`、`MODEL_REFUSAL`、`INVALID_OUTPUT`、`VERIFICATION_FAILED` 和 `TIMEOUT`。面向用户的错误不暴露密钥或服务端堆栈。

## 5. 文件归属和交接

| 文件范围 | 主负责人 | 协作规则 |
| --- | --- | --- |
| `lib/schemas/`、`lib/contracts/`、`lib/input.ts` | elika-88 | 修改契约前先与 xiaomao 同步，并在同一轮集成中更新调用方 |
| `lib/ai/`、`lib/prompts/`、`lib/openai.ts`、`lib/source.ts`、`app/api/` | elika-88 | xiaomao 提问题和验收案例，避免同时修改核心实现 |
| 页面、`components/`、`lib/client/`、全局样式、界面资源 | xiaomao | elika-88 初始化空壳后明确交接；后续页面改动由 xiaomao 负责 |
| `package.json`、唯一包管理锁文件、全局配置 | elika-88 | xiaomao 先列依赖需求，由 elika-88 统一更新；同一时间只由一人安装或改配置 |
| 后端单元测试 | elika-88 | xiaomao 评审输入和错误案例 |
| Playwright 测试及其配置 | xiaomao | 涉及共享依赖或全局配置时与 elika-88 协调 |
| README、技术架构、提示词说明 | elika-88 | xiaomao 提供用户流程和演示内容；由一人汇总避免冲突 |
| 演示讲稿、评估记录、演示脚本 | xiaomao | elika-88 核对技术描述、引用和实际测量结果 |
| `docs/team-tasks.md` | elika-88 | 每个里程碑收集双方进展后统一更新；未验收任务不能标完成 |

初始化需要建立页面、布局或样式时，elika-88 只创建可启动的基础结构；E01 合并后这些文件交给 xiaomao。分工不要求任何一人等待对方所有任务结束。

## 6. 里程碑和并行顺序

| 里程碑 | elika-88 | xiaomao | 双方通过条件 |
| --- | --- | --- | --- |
| M0：共同起点 | 完成 E01、E02，提交基础 PR | 评审接口，列出 UI 依赖，准备演示讲稿 | 双方能启动同一基线，确认请求/结果/错误字段 |
| M1：首次真实贯通 | 完成 E03、E04，搭建 E06 传输骨架 | 完成 X01-X03、X04 的基本展示 | 输入任意合格讲稿，真实 API 生成的四类数据能够联调展示；未审核数据只用于开发验证，不能标为最终验收 |
| M2：完整学习流程 | 完成 E05、E06，补 E07 | 完成 X04-X06，开始 X07 | 用户能生成已审核材料、答题、复习卡片、查看原文、重新生成 |
| M3：验收与发布 | 修复后端问题，完成 E07、E08 | 完成 X07、X08，修复界面问题 | 质量检查通过、真实评估已记录、线上完整流程和演示排练通过 |

建议将总可用时间约 15% 用于 M0、30% 用于 M1、30% 用于 M2、25% 用于 M3。先保住最后的联调、修复和排练时间；时间不足时删掉可选功能，不取消真实审核和错误处理。

M0 后前端可以先完成布局、空状态、表单校验和组件接口；真实结果联调尽早在 M1 开始。自动化测试专用数据必须与运行路径隔离，不能成为演示的回退结果。

## 7. GitHub 协作流程

任务分工和实施方案先上传到 `elika` 分支，xiaomao 可以直接在 GitHub 查看。此动作不等于已经合并到 `main`，也不代表应用开发完成。

每人使用自己的工作目录和分支，避免两人同时切换同一目录的分支。先通过常规 PR 将分工文档和后续基础提交集成到 `main`；基础 PR 评审通过后，两人各自在工作区同步 `main`。不强制推送，不覆盖对方提交。

elika-88 在自己的工作区同步：

```bash
git switch elika
git fetch origin
git merge origin/main
```

xiaomao 在自己的工作区同步：

```bash
git switch xiaomao
git fetch origin
git merge origin/main
```

以上假设本地已经存在各自分支；首次检出使用 `git switch --track origin/elika` 或 `git switch --track origin/xiaomao`。切换和合并前先检查 `git status`，妥善保存当前工作；遇到冲突由相关文件负责人共同解决，不用整体覆盖来消除冲突。

每个 PR 尽量只交付一个可验收任务，例如 `[E03] Validate and segment lecture input` 或 `[X05] Add interactive quiz`。PR 写明任务编号、行为变化、测试结果和已知限制，由另一人评审后通过常规合并进入 `main`。未运行的测试写明未运行。

共享接口变更先合入，再让双方同步；不能依靠两边私下修改不同版本的字段来联调。`main` 上的检查失败先修复，暂缓继续集成新功能。部署以通过检查的 `main` 提交为准。

此处规定的是工作流程，本次任务不代替双方自动创建 PR、合并 `main` 或部署应用。

## 8. 共同验收清单

- [ ] 空讲稿、过短讲稿、超长讲稿均有清晰错误，且不浪费生成调用。
- [ ] 真实讲稿现场生成四类材料；更换讲稿后内容和引用随之改变。
- [ ] 摘要、要点、题目和卡片都以原文为依据；引用能在原文找到。
- [ ] 信息不足或含糊时有明确处理；没有为了凑题量编造知识。
- [ ] API 失败、无效输出、超时、取消、重试耗尽都可恢复。
- [ ] 重新生成失败时保留上一份成功结果；旧请求不能覆盖新结果。
- [ ] 答题计分、解释、重做、卡片翻转和错题主题复习均可用。
- [ ] 桌面和移动端无内容重叠；键盘可操作；进度和质量数字是真实的。
- [ ] lint、typecheck、单元测试、浏览器测试、生产 build 通过。
- [ ] 人工准确性评估有逐项证据和真实分母；无未测量的准确率声明。
- [ ] GitHub 中没有密钥；README 说明安装、配置、运行、功能和限制。
- [ ] Vercel 线上用真实 API 完成流程；双方都能完成现场演示。

发布时由 elika-88 确认技术状态，xiaomao 确认用户流程与展示材料，两人共同核对人工评估结果。
