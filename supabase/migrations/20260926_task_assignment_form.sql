-- ฟอร์มมอบหมายงานแบบมีข้อมูลประชุม/อบรมที่เป็นโครงสร้าง
alter table public.tf_tasks
  add column if not exists meeting jsonb not null default '{}'::jsonb;
