-- 规划域：长期计划、一次性日程、agent 草案与确认留痕。
-- 不读取或改写旧的 schedule.md / .runtime/tasks.json；迁移由显式命令执行。
BEGIN;

CREATE TABLE IF NOT EXISTS plans (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  start_at timestamptz,
  due_at timestamptz,
  priority integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done', 'cancelled')),
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  schema_version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS schedules (
  id text PRIMARY KEY,
  plan_id text REFERENCES plans (id) ON DELETE SET NULL,
  title text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  completed_at timestamptz,
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  schema_version integer NOT NULL DEFAULT 1,
  CHECK ((all_day AND end_at IS NULL) OR (NOT all_day AND end_at IS NOT NULL AND end_at > start_at))
);

CREATE TABLE IF NOT EXISTS planning_drafts (
  id text PRIMARY KEY,
  operation text NOT NULL CHECK (operation IN ('create', 'update', 'cancel')),
  payload jsonb NOT NULL,
  summary text NOT NULL,
  conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'failed')),
  source_session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  error text,
  schema_version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS confirmations (
  id text PRIMARY KEY,
  draft_id text NOT NULL REFERENCES planning_drafts (id) ON DELETE CASCADE,
  action text NOT NULL,
  summary text NOT NULL,
  decision text CHECK (decision IN ('approved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE TABLE IF NOT EXISTS planning_changes (
  id bigserial PRIMARY KEY,
  draft_id text REFERENCES planning_drafts (id) ON DELETE SET NULL,
  object_type text NOT NULL CHECK (object_type IN ('plan', 'schedule')),
  object_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'cancel', 'complete')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_status_due ON plans (status, due_at);
CREATE INDEX IF NOT EXISTS idx_schedules_start ON schedules (start_at);
CREATE INDEX IF NOT EXISTS idx_schedules_plan ON schedules (plan_id);
CREATE INDEX IF NOT EXISTS idx_planning_drafts_status ON planning_drafts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_confirmations_draft ON confirmations (draft_id);

COMMIT;
