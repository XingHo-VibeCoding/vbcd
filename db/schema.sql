-- ============================================================================
-- db/schema.sql —— buddy 核心表结构（Day 16）
--
-- 上游依据：SPEC.md §2（数据对象及字段）、§7.3（文件存储 → 数据库 的迁移场景）
-- 目标库  ：PostgreSQL 18
--
-- 两张核心表：
--   notes —— 知识库资料。一条 Markdown 文件 = 一行
--   tasks —— 手机端发起的任务（记资料 / 收敛链接 / 转写 / 提醒 / 删除）
--
-- 关联字段：tasks.note_id → notes.id
--   一条资料可被多个任务引用（0→N）。可空，因为 remind 这类任务不指向资料。
--
-- 本文件幂等：全部用 IF NOT EXISTS，可重复执行，不删除任何已有数据。
-- 注意：表已存在时不会重建约束，改约束请写新的迁移脚本（未来放 server/migrations/）。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- notes：知识库资料
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
  id             text        PRIMARY KEY,
  title          text        NOT NULL,
  category       text        NOT NULL,
  date           date        NOT NULL,
  tags           text[]      NOT NULL DEFAULT '{}',
  source_url     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  hash           text        NOT NULL,
  schema_version integer     NOT NULL DEFAULT 1,
  body           text        NOT NULL
);

COMMENT ON TABLE  notes IS '知识库资料：一条 Markdown 对应一行（对齐 SPEC §2.1）';
COMMENT ON COLUMN notes.id IS '业务主键 = 原文件名「日期-slug」。不用自增代理键：迁移时无需新旧 id 映射表，GET /api/notes/:id 的契约不变（SPEC §7.3 要求迁移期间不改 API）';
COMMENT ON COLUMN notes.title IS '标题，不定长。PG 里 varchar(n) 相对 text 无性能优势，长度限制由业务层把关';
COMMENT ON COLUMN notes.category IS '分类 = 目录名（learning / life / work…）。用 text 不用 ENUM：分类属用户侧可新增的开放集合，ENUM 每加一项都要 ALTER TYPE';
COMMENT ON COLUMN notes.date IS '资料归属日期，可与创建时间不同。用 date 而非字符串：月历（F11）与热力图要做区间比较和排序，date 能走索引';
COMMENT ON COLUMN notes.tags IS '标签数组。PG 原生 text[]，配 GIN 索引即可检索，因此不需要为标签单开一张表';
COMMENT ON COLUMN notes.source_url IS '来源链接（F8 / F13 / F14 归档来的资料才有），可空';
COMMENT ON COLUMN notes.created_at IS '创建时间。timestamptz 存瞬时点（内部按 UTC），展示时换算成 Asia/Shanghai，换服务器或改时区都不会算错';
COMMENT ON COLUMN notes.updated_at IS '更新时间。不用数据库触发器自动改，由业务层统一写（迁移期文件与库双写，时间戳必须同源才一致）';
COMMENT ON COLUMN notes.hash IS '正文与元数据的 SHA-256（64 位十六进制），用于查重与迁移校验（SPEC §2 通用约定）';
COMMENT ON COLUMN notes.schema_version IS '结构版本，当前 1。为迁移留位（SPEC §2 通用约定）';
COMMENT ON COLUMN notes.body IS 'Markdown 正文，即原文件的主体部分';

CREATE INDEX IF NOT EXISTS idx_notes_category_date ON notes (category, date DESC);
CREATE INDEX IF NOT EXISTS idx_notes_tags          ON notes USING GIN (tags);

-- ---------------------------------------------------------------------------
-- tasks：手机端发起的任务
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id             text        PRIMARY KEY,
  type           text        NOT NULL
                             CHECK (type IN ('note', 'organize', 'remind', 'delete_note', 'transcribe_url')),
  payload        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  asr            jsonb,
  organize       jsonb,
  status         text        NOT NULL DEFAULT 'todo'
                             CHECK (status IN ('todo', 'doing', 'done', 'failed', 'attention')),
  result         text,
  origin         text        NOT NULL CHECK (origin IN ('phone', 'desktop')),
  note_id        text        REFERENCES notes (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  schema_version integer     NOT NULL DEFAULT 1
);

COMMENT ON TABLE  tasks IS '手机端发起的任务（对齐 SPEC §2.3）。与 notes 的关系：tasks.note_id → notes.id';
COMMENT ON COLUMN tasks.id IS '业务主键 = 递增时间戳-随机串，与 SPEC §2.3 一致';
COMMENT ON COLUMN tasks.type IS '任务类型。用 CHECK 而非 ENUM：类型是代码里定义的封闭集合，新增类型必然要改代码，顺带改 CHECK 不额外增加负担（对照 notes.category 用 text 的理由）';
COMMENT ON COLUMN tasks.payload IS '任务参数。结构随 type 变（note 为 {title,content}；organize 为 {url,category?,tags?}；transcribe_url 为 {url,formats?…}），jsonb 存异构参数且可索引';
COMMENT ON COLUMN tasks.asr IS '转写进度，仅 type=transcribe_url 有：{job_id,stage,done,total,percent,…}。不写转写正文，避免运行时数据膨胀';
COMMENT ON COLUMN tasks.organize IS '收敛进度，仅 type=organize 有：{stage,attempts,started_at,last_error}';
COMMENT ON COLUMN tasks.status IS '任务状态：todo / doing / done（终态）/ failed / attention（高风险动作待确认，见 SPEC §5.4）';
COMMENT ON COLUMN tasks.result IS '执行结果摘要（成功信息或失败原因），失败时才有内容';
COMMENT ON COLUMN tasks.origin IS '任务来源：phone / desktop';
COMMENT ON COLUMN tasks.note_id IS '★ 关联字段：指向 notes.id。ON DELETE SET NULL 而非 RESTRICT —— delete_note 任务自身就引用着要删的资料，用 RESTRICT 会在删资料时被这条任务自锁；SET NULL 让任务留痕保留、关联断开';
COMMENT ON COLUMN tasks.created_at IS '任务创建时间（timestamptz，理由同 notes.created_at）';
COMMENT ON COLUMN tasks.updated_at IS '任务更新时间，由业务层维护';
COMMENT ON COLUMN tasks.schema_version IS '结构版本，当前 1（SPEC §2 通用约定「所有对象带 schema_version」，§2.3 的字段表漏列，此处按通用约定补上）';

CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_note_id    ON tasks (note_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);

COMMIT;
