# Lumina 阅读备考改造：研究依据、实现范围与上线标准

核验日期：2026-09-29。依据考试机构原始资料、官方练习入口与学习研究；产品设计判断单独标注。题目为原创训练，不复制受版权保护的官方题库，不承诺提分。

## 1. 三类考试不能共用一种“长文 + 选择题”模板

| 考试 | 官方要求要点 | 考生真正需要的训练 | 本次处理 |
| --- | --- | --- | --- |
| IELTS | 阅读 60 分钟、40 题；Academic 与 General Training 的材料结构不同。[1][2] | 定位与同义改写；事实判断和作者观点判断的区别；段意；字数限制和拼写；长篇时间分配 | 学术／培训类别，T/F/NG、Y/N/NG、选择、句子填空、短答、标题专项；保留原文与证据定位 |
| Digital SAT | Reading and Writing：两模块，每模块 32 分钟；54 题。每个 25–150 词单／双文本配一道题；四领域包含语言规范和表达，不只是阅读理解。[3][4] | 短文推理、语境词汇、双文本关系、证据、逻辑衔接、句界、语法、笔记整合；模块内回看 | 每题独立语境与字数校验；覆盖上述文本类专项；标记回看、选项排除；目标使用本科目 200–800 分 |
| TOEFL iBT 2026 | 2026-01-21 起采用新版；阅读有 Complete the Words、Read in Daily Life、Read an Academic Passage。ETS 列出约 50 题／30 分钟，实际自适应题量与时间会变化。[5][6] | 词形与上下文联合推断；日常信息行动／目的；学术短文推理。不能只使用旧版长文题型 | 新版三类任务入口，保留底层词汇／推断技能；补词目前明确为单空专项，不伪装成完整官方多空任务 |

TOEFL 单项与总等级使用 1–6、0.5 分间隔；过渡期另提供可比较的 0–120 总分。[7] 小题组正确率不能预测正式考试分数，界面已删除原来的雅思按比例估分。SAT／TOEFL 自适应路由需要经过标定的题库和评分模型，当前不宣称实现。

## 2. 学习闭环比无限生成题目更重要

设计判断：以“选择一个薄弱技能 → 做题 → 解释证据和干扰项 → 记录错因 → 延时再回忆 → 在新材料上检验迁移”为核心。检索练习的研究支持主动回忆对延迟保持的帮助，但不能据此保证考试提分。[10]

已实现：

- 可选 4／6／8 题，最多三类技能；基础／标准／挑战为定性设置，不冒充经过测量的难度参数。
- 自定义限时／不限时；隐藏计时、练习延时倍率；时间到锁定答案，未答按错题统计。这里的延时不代表官方批准的考试便利安排。
- 题目导航、标记回看、选项排除；答案及提交状态刷新恢复。
- 答案解释、各选项理由、解题策略和原文证据。AI 二次复核是同一供应商的另一次模型调用，仍不能取代专业审题。
- 错题和标记题自动进入复习队列；可记录词汇、证据、推断、语法、时间、粗心和争议等错因。
- 回忆后才展开答案；1／3／7／14／30／60 天的简单复习安排。这是产品默认计划，不是已针对该用户验证的最优算法。
- 语境词汇本：词／词组、意义和原句；支持删除。
- 首次提交的题型统计、样本不足提示；重做同一套不重复抬高成绩。统计只比较练习表现，不推算能力等级。
- 目标、考试日期、每天可用时间与可执行的当天时间分配；考前一周提示使用官方练习校准节奏。
- 官方格式、评分说明、备考入口可在每个考试页展开，附资料核验日期。

## 3. 出题正确性与稳定性

此次修复了原有备考路径与课程路径分叉造成的问题：

1. 采用 SDK 原始结构化调用后自行解析，接受完整 JSON 或单层完整 Markdown JSON 包裹；仍严格验证必需字段、类型和嵌套结构。[11]
2. 模型只选择服务端原文片段 ID；服务器还原证据，避免让模型重抄带行号、特殊空格的文章。
3. 拒绝空证据、重复题干、不支持题型、错误选项数、超字数答案和不符合 SAT 字数范围的语境。
4. 第二次模型调用审查答案是否由显示的语境支持、是否唯一、干扰项是否公平、解析是否正确、是否泄露填空答案。缺失审查项或拒绝项不会被当作成功。
5. 每次请求最多两轮出题与复核，共最多四次模型调用；整体超时与取消信号向下传播。失败不返回伪造题目。

正式发布仍应增加按考试／题型划分的专家标注集。建议至少先积累每个主要题型 20 个经过教师审核的案例，再定期监控唯一答案率、证据正确率、解析错误率、用户争议率、成功率、P50/P95 时延。这里的样本数量是建议，不代表已完成评测。

## 4. 账号、数据与成本

- 生成接口必须验证登录 Cookie 和匹配的 X-Lumina-Account，并校验同源请求；请求体按接收字节限长。
- 请求次数在 SQLite／Turso 写事务中计数：默认每账号每 UTC 日 10 次、每五分钟窗口 2 次、全站每 UTC 日 200 次。失败／取消也计为一次请求，界面已说明。这是防滥用限额，不是收费额度。
- 可配置 `LUMINA_PREP_DAILY_ATTEMPTS` 和 `LUMINA_PREP_GLOBAL_DAILY_ATTEMPTS`；支持 `LUMINA_GENERATION_PAUSED=true` 暂停新出题。
- 新表 `prep_records`、`prep_request_limits` 按需建立，不修改既有课程表。
- 本机记录按账号隔离；旧共享记录只在用户确认后导入，旧 SAT 总分和 TOEFL 0–120 目标不会误当新单项目标。
- 云端使用手动保存／读取与 revision 冲突检查；不会自动用本机旧副本覆盖另一设备的数据。冲突时保留本机记录并提示导出。
- JSON 导入有 schema／体积校验和替换确认；支持导出备份。浏览器空间不足应显示错误，而不是宣称保存成功。
- 记录有上限：100 次练习、100 道复习题和100 条词汇；云端单份备份上限 512 KiB。数据增长后应导出并清理。
- 既有每月 60 次课程额度 PR #4 仍是独立未合并工作。付费发布前应设计统一用量账本，不能声称本次已完成订阅扣费。

## 5. 明确尚未覆盖的内容

| 优先级 | 后续能力 | 为什么不能当作已经完成 |
| --- | --- | --- |
| P0 | 生产模型完整端到端验收、Turso 并发与迁移检查 | 本机模型、模拟浏览器及本地数据库测试不能替代生产配置验收 |
| P0 | 专业教师题目审核及争议处理后台 | 同模型二次检查存在共同盲区；当前争议仅支持个人记录 |
| P1 | IELTS 共用选项池匹配、多选、图表／流程图／地图／标注等完整任务 | 当前标题题是单项技能训练，不能等同全部真题题型 |
| P1 | TOEFL 完整多空词汇任务、分阶段路由和官方导航约束 | 当前单空与混合专项不模拟自适应考试流程 |
| P1 | SAT 定量证据图表、完整 27 题模块与经过校准的自适应组卷 | 没有标定题库与图表校验，不能提供可信官方分数预测 |
| P1 | 备考生成迁入持久后台任务、幂等重连和统一额度 | 当前出题保持请求连接，关闭页面会中止；现有课程后台任务可作为后续基础 |
| P1 | 自动跨设备增量同步、自动合并冲突、删除账号与备份保留策略 | 当前手动版本化备份可用，但不是自动同步系统 |
| P2 | 教师班级、作业、语料许可、离线 PWA 与打印导出 | 需要独立产品设计和验收 |
| P2 | 听力、写作、口语 | 本次用户重点是阅读；这些科目不伪装成已开放 |

上线前由团队确认隐私政策、版权来源和供应商数据处理约定。官方考试材料使用官方链接，未经授权不导入为自有题库。此为产品实施清单，不是法律意见。

## 6. 原始资料

1. IELTS Academic Reading format: https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading
2. IELTS General Training Reading: https://ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-reading
3. College Board Reading and Writing: https://satsuite.collegeboard.org/sat/whats-on-the-test/reading-writing
4. SAT structure: https://satsuite.collegeboard.org/sat/whats-on-the-test/structure
5. ETS Reading tasks: https://www.ets.org/toefl/test-takers/ibt/about/content/reading.html
6. ETS Content and timing: https://www.ets.org/toefl/test-takers/ibt/about/content.html
7. ETS score interpretation: https://www.ets.org/toefl/test-takers/ibt/scores/understand-scores.html
8. College Board official practice: https://satsuite.collegeboard.org/practice
9. IELTS access arrangements: https://ielts.org/take-a-test/booking-your-test/access-arrangements
10. Karpicke & Roediger, retrieval practice and long-term retention: https://pubmed.ncbi.nlm.nih.gov/20951630/
11. OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs

核验应继续随考试制度更新；官方网页可变，不能把 2026 年说明永久硬编码为不变规则。
