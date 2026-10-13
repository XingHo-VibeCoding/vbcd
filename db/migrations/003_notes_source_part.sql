-- 仅添加来源分 P 元数据；不推断或回填旧档案。
BEGIN;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS source_part integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'notes'::regclass AND conname = 'notes_source_part_positive') THEN
    ALTER TABLE notes ADD CONSTRAINT notes_source_part_positive CHECK (source_part IS NULL OR source_part >= 1);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS notes_source_lookup ON notes (source_url, source_part);
COMMIT;
