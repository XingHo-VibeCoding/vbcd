-- ============================================================================
-- db/seed.sql —— Day 16 种子数据
--
-- 用途：给 notes / tasks 两张表灌入**虚构样例**数据，供建表验证与 Day 17 读接口调试。
--
-- ⚠️ 这里的数据全部是编造的，**不是** data/ 目录里的真实资料。
--    本文件入公开仓，真实资料按 SPEC 第 1 章「仓库边界」不入库。
--
-- 幂等：主键固定 + ON CONFLICT (id) DO NOTHING，可重复执行且不报错。
--      重复执行时 psql 会打印 INSERT 0 0（插了 0 行），不是错误。
--
-- 期望结果：notes 6 行、tasks 6 行；tasks.type 覆盖全部 5 种取值；
--          3 条任务通过 note_id 指向 notes（演示两表的关联）。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- notes：6 条虚构资料
--   hash 用 Postgres 内置 sha256() 按 body 现算，避免手抄 64 位十六进制出错
--   （真实链路的 hash 由业务层对「正文 + 元数据」计算，此处只保证种子内自洽）
-- ---------------------------------------------------------------------------
INSERT INTO notes (id, title, category, date, tags, source_url,
                   created_at, updated_at, hash, schema_version, body)
SELECT t.id, t.title, t.category, t.date, t.tags, t.source_url,
       t.created_at, t.updated_at,
       encode(sha256(t.body::bytea), 'hex'), 1, t.body
FROM (VALUES
  ('2026-09-01-demo-markdown-syntax',
   'Markdown 常用语法速查',
   'learning',
   date '2026-09-01',
   ARRAY['markdown', '速查'],
   'https://commonmark.org/',
   timestamptz '2026-09-01 09:12:00+08',
   timestamptz '2026-09-01 09:12:00+08',
   '标题用 #，列表用 -，表格用竖线分隔。链接写成 [文字](地址)，代码块用三个反引号包裹。'),

  ('2026-09-03-demo-postgres-types',
   'PostgreSQL 常用字段类型怎么选',
   'learning',
   date '2026-09-03',
   ARRAY['postgres', '数据库'],
   NULL,
   timestamptz '2026-09-03 14:05:00+08',
   timestamptz '2026-09-03 14:05:00+08',
   '文本一律用 text；时间点用 timestamptz；纯日期用 date；结构不固定的参数用 jsonb；并列标签用 text 数组。'),

  ('2026-09-05-demo-weekly-menu',
   '一周备菜清单',
   'life',
   date '2026-09-05',
   ARRAY['饮食', '清单'],
   NULL,
   timestamptz '2026-09-05 20:30:00+08',
   timestamptz '2026-09-06 08:00:00+08',
   '周一番茄鸡蛋面，周二香菇滑鸡饭，周三清炒时蔬配杂粮饭，周四虾仁豆腐汤，周五简单点吃剩菜。'),

  ('2026-09-08-demo-deploy-checklist',
   '单机部署上线前检查表',
   'work',
   date '2026-09-08',
   ARRAY['部署', 'checklist'],
   NULL,
   timestamptz '2026-09-08 10:00:00+08',
   timestamptz '2026-09-08 10:00:00+08',
   '检查项：环境变量齐全且不进仓库，后端端口不对公网暴露，反向代理只开必要端口，数据库不发布端口，备份策略写进运维记录。'),

  ('2026-09-12-demo-reading-notes',
   '读卡片笔记写作法随手记',
   'learning',
   date '2026-09-12',
   ARRAY['读书', '笔记'],
   NULL,
   timestamptz '2026-09-12 21:40:00+08',
   timestamptz '2026-09-12 21:40:00+08',
   '笔记的价值在于能被重新读到，所以要写清楚来源与自己的疑问，而不是照抄原文。'),

  ('2026-09-15-demo-ssr-vs-csr',
   '服务端渲染与客户端渲染的取舍',
   'learning',
   date '2026-09-15',
   ARRAY['前端', '架构'],
   'https://web.dev/articles/rendering-on-the-web',
   timestamptz '2026-09-15 16:20:00+08',
   timestamptz '2026-09-15 16:20:00+08',
   '首屏要快、要能被搜索引擎读到，就偏服务端渲染；交互复杂、状态多，就偏客户端渲染。两者可以按页面混用。')
) AS t(id, title, category, date, tags, source_url, created_at, updated_at, body)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- tasks：6 条虚构任务
--   type 覆盖全部 5 种取值（note / organize / remind / delete_note / transcribe_url）
--   前 3 条通过 note_id 关联到上面的资料，演示 tasks.note_id → notes.id
-- ---------------------------------------------------------------------------
INSERT INTO tasks (id, type, payload, asr, organize, status, result, origin, note_id,
                   created_at, updated_at, schema_version)
VALUES
  -- ① 记资料：任务执行完把产出的资料回填进 note_id
  ('1790000000001-a1b2c3',
   'note',
   '{"title":"Markdown 常用语法速查","content":"标题用 #，列表用 -。"}'::jsonb,
   NULL, NULL,
   'done',
   '已归档为 data/learning/2026-09-01-demo-markdown-syntax.md',
   'phone',
   '2026-09-01-demo-markdown-syntax',
   timestamptz '2026-09-01 09:10:00+08',
   timestamptz '2026-09-01 09:12:00+08',
   1),

  -- ② 收敛链接：归档成功后同样回填 note_id
  ('1790000000002-b2c3d4',
   'organize',
   '{"url":"https://web.dev/articles/rendering-on-the-web","category":"learning","tags":["前端","架构"]}'::jsonb,
   NULL,
   '{"stage":"archive","attempts":1,"started_at":"2026-09-15T16:18:00+08:00","last_error":null}'::jsonb,
   'done',
   '已归档为 data/learning/2026-09-15-demo-ssr-vs-csr.md',
   'phone',
   '2026-09-15-demo-ssr-vs-csr',
   timestamptz '2026-09-15 16:18:00+08',
   timestamptz '2026-09-15 16:20:00+08',
   1),

  -- ③ 转写：还没归档，所以 note_id 为空（这正是 note_id 可空的原因）
  ('1790000000003-c3d4e5',
   'transcribe_url',
   '{"url":"https://example.com/demo-lecture","category":"learning","formats":["text","segments"]}'::jsonb,
   '{"job_id":"job-demo-0001","stage":"transcribing","done":3,"total":7,"percent":42,"submitted_at":"2026-09-16T20:00:00+08:00","last_error":null}'::jsonb,
   NULL,
   'doing',
   NULL,
   'phone',
   NULL,
   timestamptz '2026-09-16 20:00:00+08',
   timestamptz '2026-09-16 20:05:00+08',
   1),

  -- ④ 提醒：不指向任何资料
  ('1790000000004-d4e5f6',
   'remind',
   '{"text":"周五前把备菜清单更新一版","at":"2026-09-19T09:00:00+08:00"}'::jsonb,
   NULL, NULL,
   'todo',
   NULL,
   'phone',
   NULL,
   timestamptz '2026-09-16 21:00:00+08',
   timestamptz '2026-09-16 21:00:00+08',
   1),

  -- ⑤ 删除资料：高风险动作，停在 attention 等确认；note_id 指向待删的那条
  ('1790000000005-e5f6a7',
   'delete_note',
   '{"note_id":"2026-09-05-demo-weekly-menu","title":"一周备菜清单"}'::jsonb,
   NULL, NULL,
   'attention',
   '等待确认：确认后将从资料库中删除该条，无法自动恢复',
   'desktop',
   '2026-09-05-demo-weekly-menu',
   timestamptz '2026-09-16 21:30:00+08',
   timestamptz '2026-09-16 21:30:00+08',
   1),

  -- ⑥ 失败样本：执行失败的任务同样留痕
  ('1790000000006-f6a7b8',
   'note',
   '{"title":"临时速记","content":"内容写了一半"}'::jsonb,
   NULL, NULL,
   'failed',
   '保存失败：标题为空，已跳过该条任务',
   'phone',
   NULL,
   timestamptz '2026-09-17 08:15:00+08',
   timestamptz '2026-09-17 08:15:10+08',
   1)
ON CONFLICT (id) DO NOTHING;

COMMIT;
