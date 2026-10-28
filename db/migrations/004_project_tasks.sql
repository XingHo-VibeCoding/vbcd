-- 阶段 B：项目子任务和依赖；只增加结构，不回填或改写旧日程。
BEGIN;
CREATE TABLE IF NOT EXISTS project_tasks (
  id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description)<=10000),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','blocked','done','cancelled')),
  due_at timestamptz,
  position integer NOT NULL CHECK (position>=0),
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user','agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  schema_version integer NOT NULL DEFAULT 1,
  UNIQUE(plan_id,id),
  CHECK ((status='done') = (completed_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS project_task_dependencies (
  plan_id text NOT NULL,
  task_id text NOT NULL,
  depends_on_task_id text NOT NULL,
  PRIMARY KEY(task_id,depends_on_task_id),
  FOREIGN KEY(plan_id,task_id) REFERENCES project_tasks(plan_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(plan_id,depends_on_task_id) REFERENCES project_tasks(plan_id,id) ON DELETE RESTRICT,
  CHECK(task_id<>depends_on_task_id)
);
ALTER TABLE planning_drafts ADD COLUMN IF NOT EXISTS created_objects jsonb;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS task_id text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='schedules'::regclass AND conname='schedules_task_plan_required') THEN
    ALTER TABLE schedules ADD CONSTRAINT schedules_task_plan_required CHECK(task_id IS NULL OR plan_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='schedules'::regclass AND conname='schedules_project_task_fk') THEN
    ALTER TABLE schedules ADD CONSTRAINT schedules_project_task_fk FOREIGN KEY(plan_id,task_id) REFERENCES project_tasks(plan_id,id) ON DELETE RESTRICT;
  END IF;
  ALTER TABLE planning_changes DROP CONSTRAINT IF EXISTS planning_changes_object_type_check;
  ALTER TABLE planning_changes ADD CONSTRAINT planning_changes_object_type_check CHECK(object_type IN ('plan','schedule','project_task'));
END $$;
CREATE INDEX IF NOT EXISTS project_tasks_plan_order ON project_tasks(plan_id,position,id);
CREATE INDEX IF NOT EXISTS project_tasks_plan_status_order ON project_tasks(plan_id,status,position,id);
CREATE INDEX IF NOT EXISTS project_dependencies_reverse ON project_task_dependencies(depends_on_task_id,task_id);
CREATE INDEX IF NOT EXISTS schedules_task ON schedules(task_id);
COMMIT;
