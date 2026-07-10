-- TaskFlow Pro v5 — Supabase/PostgreSQL schema
-- ใช้ใน Supabase Dashboard > SQL Editor > New query > Run

create extension if not exists pgcrypto;

create table if not exists public.tf_users (
  id bigserial primary key,
  wwcode varchar(20) not null unique,
  name varchar(120) not null,
  role varchar(100) default '',
  dept varchar(100) default '',
  dept_key varchar(20) default '',
  branch varchar(20) default '',
  branch_name varchar(60) default '',
  email varchar(120) default '',
  urole varchar(20) default 'user' check (urole in ('admin','manager','assistant','user')),
  color smallint default 0,
  avatar_path varchar(255) default '',
  avatar_url varchar(255) default '',
  pass_hash varchar(255) default '',
  last_login timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tf_sessions (
  token varchar(64) primary key,
  user_id bigint not null references public.tf_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create table if not exists public.tf_tasks (
  id bigserial primary key,
  title varchar(200) not null,
  description text default '',
  col varchar(20) default 'todo',
  priority varchar(10) default 'normal',
  prog smallint default 0,
  due_date date,
  branch varchar(20) default '',
  dept_key varchar(20) default '',
  tags jsonb default '[]'::jsonb,
  created_by bigint not null references public.tf_users(id),
  submit_note text default '',
  verified_by bigint references public.tf_users(id),
  ack_by jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tf_task_assignees (
  task_id bigint not null references public.tf_tasks(id) on delete cascade,
  user_id bigint not null references public.tf_users(id) on delete cascade,
  primary key (task_id, user_id)
);

create table if not exists public.tf_task_steps (
  id bigserial primary key,
  task_id bigint not null references public.tf_tasks(id) on delete cascade,
  label varchar(200) not null,
  sort_order smallint default 0
);

create table if not exists public.tf_step_checks (
  step_id bigint not null references public.tf_task_steps(id) on delete cascade,
  user_id bigint not null references public.tf_users(id) on delete cascade,
  task_id bigint not null references public.tf_tasks(id) on delete cascade,
  is_done boolean default false,
  checked_at timestamptz,
  primary key (step_id, user_id)
);

create table if not exists public.tf_attachments (
  id bigserial primary key,
  task_id bigint not null references public.tf_tasks(id) on delete cascade,
  is_submitted boolean default false,
  file_name varchar(255) not null,
  file_size varchar(20) default '',
  file_type varchar(20) default '',
  file_path varchar(255) not null,
  file_url varchar(500) default '',
  uploaded_by bigint not null references public.tf_users(id),
  uploaded_at timestamptz default now()
);

create table if not exists public.tf_obstacles (
  id bigserial primary key,
  task_id bigint not null references public.tf_tasks(id) on delete cascade,
  title varchar(200) not null,
  description text default '',
  level varchar(10) default 'med',
  author_id bigint not null references public.tf_users(id),
  resolved boolean default false,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.tf_comments (
  id bigserial primary key,
  task_id bigint not null references public.tf_tasks(id) on delete cascade,
  obstacle_id bigint references public.tf_obstacles(id) on delete set null,
  author_id bigint not null references public.tf_users(id),
  body text not null,
  created_at timestamptz default now()
);

create table if not exists public.tf_progress_log (
  id bigserial primary key,
  task_id bigint not null references public.tf_tasks(id) on delete cascade,
  user_id bigint not null references public.tf_users(id),
  prog smallint not null,
  note text default '',
  logged_at timestamptz default now()
);

create table if not exists public.tf_notifications (
  id bigserial primary key,
  type varchar(30) not null,
  title varchar(200) not null,
  body text default '',
  task_id bigint references public.tf_tasks(id) on delete set null,
  for_user_id bigint not null references public.tf_users(id) on delete cascade,
  is_read boolean default false,
  is_acked boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_notif_user on public.tf_notifications(for_user_id, is_read);
create index if not exists idx_tasks_branch on public.tf_tasks(branch);
create index if not exists idx_tasks_col on public.tf_tasks(col);

create table if not exists public.tf_tags (
  id bigserial primary key,
  name varchar(60) not null unique,
  created_at timestamptz default now()
);

insert into public.tf_tags (name) values
  ('ออกแบบ'),('พัฒนา'),('ด่วน'),('การตลาด'),('ข้อมูล'),('วิจัย'),('QA'),('DevOps')
on conflict (name) do nothing;

-- Local demo accounts. Password: Pwa@12345
insert into public.tf_users (wwcode,name,role,dept,dept_key,branch,branch_name,email,urole,color,pass_hash)
values
  ('admin',  'ผู้ดูแลระบบ',      'System Admin',    'ฝ่ายเทคโนโลยี','บริการ',   '5512027','หน่วยงาน','admin@pwa.local',  'admin',     0, crypt('Pwa@12345', gen_salt('bf'))),
  ('manager','ผู้จัดการสาขา',    'ผู้จัดการ',        'สำนักงาน',     'อำนวยการ', '5512027','หน่วยงาน','manager@pwa.local','manager',   1, crypt('Pwa@12345', gen_salt('bf'))),
  ('assist', 'ผู้ช่วยผู้จัดการ',  'ผู้ช่วยผู้จัดการ', 'สำนักงาน',     'อำนวยการ', '5512027','หน่วยงาน','assist@pwa.local', 'assistant', 2, crypt('Pwa@12345', gen_salt('bf'))),
  ('user1',  'ช่างเทคนิค 1',     'ช่างเทคนิค',       'งานบริการ',    'บริการ',   '5512027','หน่วยงาน','user1@pwa.local',  'user',      3, crypt('Pwa@12345', gen_salt('bf'))),
  ('user2',  'ช่างเทคนิค 2',     'ช่างเทคนิค',       'งานบริการ',    'บริการ',   '5512027','หน่วยงาน','user2@pwa.local',  'user',      4, crypt('Pwa@12345', gen_salt('bf'))),
  ('user3',  'นักบัญชี',          'นักบัญชี',         'งานการเงิน',   'จัดเก็บ',  '5512027','หน่วยงาน','user3@pwa.local',  'user',      5, crypt('Pwa@12345', gen_salt('bf')))
on conflict (wwcode) do update set pass_hash = excluded.pass_hash;

-- Storage bucket names ที่แนะนำให้สร้างใน Supabase Storage:
-- 1) task-attachments (แนะนำ public สำหรับเวอร์ชันนี้ เพื่อ download ผ่าน file_url)
-- 2) avatars

-- Verify local login for Vercel/Supabase API
create or replace function public.tf_verify_login(p_username text, p_password text)
returns table (
  id bigint,
  wwcode varchar,
  name varchar,
  role varchar,
  dept varchar,
  dept_key varchar,
  branch varchar,
  branch_name varchar,
  email varchar,
  urole varchar,
  color smallint,
  avatar_url varchar
)
language sql
security definer
set search_path = public
as $$
  select u.id,u.wwcode,u.name,u.role,u.dept,u.dept_key,u.branch,u.branch_name,u.email,u.urole,u.color,u.avatar_url
  from public.tf_users u
  where (u.wwcode = p_username or u.email = p_username)
    and u.pass_hash = crypt(p_password, u.pass_hash)
  limit 1;
$$;
