-- Calendar ranges: run once in Supabase SQL Editor before deploying the UI/API.
-- Existing one-day tasks remain valid: the application treats due_date as both
-- start and end until these fields are set.
alter table public.tf_tasks add column if not exists start_date date;
alter table public.tf_tasks add column if not exists end_date date;

update public.tf_tasks
set start_date = coalesce(start_date, due_date),
    end_date = coalesce(end_date, start_date, due_date)
where start_date is null or end_date is null;

alter table public.tf_tasks
  add constraint tf_tasks_valid_date_range
  check (end_date is null or start_date is null or end_date >= start_date)
  not valid;

alter table public.tf_tasks validate constraint tf_tasks_valid_date_range;
