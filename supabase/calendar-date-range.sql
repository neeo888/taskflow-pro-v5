ALTER TABLE public.tf_tasks ADD COLUMN IF NOT EXISTS start_date date;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tf_tasks_schedule_range' AND conrelid = 'public.tf_tasks'::regclass) THEN
    ALTER TABLE public.tf_tasks ADD CONSTRAINT tf_tasks_schedule_range
      CHECK (start_date IS NULL OR (due_date IS NOT NULL AND start_date <= due_date));
  END IF;
END $$;
