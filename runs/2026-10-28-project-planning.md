# 2026-10-28｜ProjectTask 阶段 B 本地实现与验收

## 范围与授权

使用者在整体设计清单后指示“进行 非必要 不要停下”，据此连续实施 PLAN-admin §10.2.1–5 的阶段 B；保留此前三项 A 决定。没有执行提交、推送、真实数据库迁移或远程部署，没有改 .env 或读取真实密钥。所有测试使用合成数据和临时口令。

## 实际改动

- `db/migrations/004_project_tasks.sql`：ProjectTask、依赖边表、复合外键/自依赖 CHECK、Schedule.task_id、规划审计对象类型、创建结果持久化和索引；旧字段/ID不回填改写。
- `server/src/services/planning-schema.js`、`project-planning.js`、`planning.js` 与 `server/src/db/planning.js`：共用输入、Task/依赖/截止、局部引用、批量/重排、过期审阅、权限下的显式确认、保存点全业务回滚及创建结果幂等。
- `server/src/routes/planning.js`、`services/agent/{loop,manifest}.js`、`tools/{get-planning,propose-planning}.js`：查询参数与工具结构一致、真实结果回灌，游客 readonly 不变。
- `web/src/{App.jsx,api/planning.js,pages/PlanningPage.jsx,pages/PlanningDraftConfirmPage.jsx,agent/ToolFallback.jsx}`：Task 页面、Plan 过滤、截止与依赖、日程关联、活跃列表排序草案、完整前后预览、游客灰显。最后补齐 PlanningPage 既有 `planning-page/view-switch/planning-list/item` 样式挂点，复用原站点 workflow token。
- `server/scripts/{smoke.mjs,project-planning-selftest.mjs,project-planning-browser.py}`：原有回归与新增数据库/浏览器测试。
- `PLAN-admin.md`、`SPEC.md §3.0.6`、`TECH_DESIGN.md §4.11`、`RUN.md §8.7.1`：规格、实际锁策略、部署及恢复说明。

## 2026-10-28 实跑结果

| 命令或检查 | 结果 |
|---|---|
| `node server/scripts/project-planning-selftest.mjs --browser` | ProjectTask **21/21**；另有浏览器四条实际交互检查通过 |
| `node server/scripts/smoke.mjs --planning-lifecycle-selftest` | **26/26** |
| `node server/scripts/smoke.mjs --planning-selftest` | **25/25**（含假模型后续对话/会话同步回归） |
| `node server/scripts/agent-session-access-selftest.mjs` | PASS，10 条访问边界断言 |
| `node server/scripts/auth-proxy-selftest.mjs` | PASS |
| `(cd web && npm run build)` | 成功；仍有既有的大体积 chunk 提示，未为此扩大范围重构 |
| `git diff --check` | 通过 |

专项最终摘要：

```text
ProjectTask 专项：21/21 通过（独立 PostgreSQL，临时数据退出即清理）
规划生命周期专项：26/26 通过（独立 PostgreSQL 容器；临时数据将在退出时全部移除）
规划确认专项：25/25 通过（独立 PostgreSQL 容器；临时数据将在退出时全部移除）
agent-session-access-selftest: PASS (10 access-boundary assertions)
auth-proxy-selftest: PASS
```

21 条数据库/HTTP/工具验收包括：重复迁移与旧字段指纹一致；游客/登录/登出权限；一次草案创建 Plan/Task/依赖/Schedule；未满足依赖的启动/完成拒绝；拒绝零业务写入；人工 blocked；终态只读；活跃列表排序；过期重审；反向并发依赖至多一个成功；数据库同 Plan/自依赖/删除保护；审计故障全业务回滚；筛选上下文；前向 ref；doing 新增依赖明确退回；原子解绑；排序幂等与反向决定冲突；取消前置不自动解锁；Plan 终态使旧新增草案失效；临时库 pg_dump/恢复后记录数一致。

浏览器采用本地 browser-use Actor 和 Chrome，未调用外部模型；真实页面通过 Vite 代理连接临时后端及临时数据库：

1. 游客能看到 Task 列表，编辑与新增入口 disabled。
2. 登录后编辑先显示完整确认差异；拒绝后 GET 读回原标题。
3. 排序草案显示前后差异，批准后 GET 读回反转后的任务顺序。
4. 390px 手机宽度下无横向溢出；另已查看 1280px 桌面截图。

本机临时截图 `/tmp/vbcd-project-planning-ui.png`、`/tmp/vbcd-project-planning-mobile.png` 不入库。测试中曾遇到数据库就绪与浏览器旧页面会话/DOM 时序问题：前者改为等待真实 SELECT 1；后者每次完整导航获取新的 Page，并等待 DOM 存在。最终完整场景复跑通过，不把失败轮次算成通过。

## 部署边界和已知限制

- 使用者随后要求直接更新当前本地部署：已备份到 `/home/bird/buddy-backups/pre-project-tasks-20261028-124857.sql`，并对当前本地 Compose PostgreSQL 执行 004；核验迁移前后计划数均 1、日程数均 2，子任务/依赖/task 关联均为 0。规划 API、本地首页 API 随后均为 HTTP 200。此属于本地数据库实际迁移。
- 本地 web 镜像已为规划视觉修复重建。真实桌面站点截图 `/tmp/vbcd-planning-unified.png` 已确认页面复用站点导航、容器、主色、玻璃卡片；`npm run build` 和 `git diff --check` 通过。最后为移动截图启动的 headless Chrome 在本机卡住并中止，所以移动端结论仍仅引用之前独立实现轮次中 390px 无横溢出的证据；本次只核对桌面最终外观。
- 本次确认事务采用既有 Schedule 表级串行锁的扩展锁序，不宣称跨 Plan 并行写；存储/审计失败保留批准事实但明确 failed，不留半份业务数据。
- 其他真实/远程环境仍未迁移。目标环境须按 RUN §8.7.1 停写、备份、迁移 004、核对旧字段与行数并重建 server/web。
- 没有实施重复规则、无日期独立待办、提醒推送、自动进度或自动改期；没有调用真实模型现场生成 Task 草案，已验证共用工具输入和假模型确认/继续链路。
- 备份恢复仅在隔离测试库实跑；生产恢复和远程上线未执行，不声称已完成。
- 下一步是提交范围确认与使用者明确选择目标环境的部署，不能将本轮连续执行授权解释成自动提交、推送或远程数据库操作。
