-- TaskFlow Pro v5 — Supabase/PostgreSQL schema
-- ใช้ใน Supabase Dashboard > SQL Editor > New query > Run

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

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
  telegram_chat_id varchar(80) default '',
  pass_hash varchar(255) default '',
  last_login timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tf_users add column if not exists telegram_chat_id varchar(80) default '';

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
  ('admin',  'ผู้ดูแลระบบ',      'System Admin',    'ฝ่ายเทคโนโลยี','บริการ',   '5512027','หน่วยงาน','admin@pwa.local',  'admin',     0, extensions.crypt('Pwa@12345', extensions.gen_salt('bf'))),
  ('manager','ผู้จัดการสาขา',    'ผู้จัดการ',        'สำนักงาน',     'อำนวยการ', '5512027','หน่วยงาน','manager@pwa.local','manager',   1, extensions.crypt('Pwa@12345', extensions.gen_salt('bf'))),
  ('assist', 'ผู้ช่วยผู้จัดการ',  'ผู้ช่วยผู้จัดการ', 'สำนักงาน',     'อำนวยการ', '5512027','หน่วยงาน','assist@pwa.local', 'assistant', 2, extensions.crypt('Pwa@12345', extensions.gen_salt('bf'))),
  ('user1',  'ช่างเทคนิค 1',     'ช่างเทคนิค',       'งานบริการ',    'บริการ',   '5512027','หน่วยงาน','user1@pwa.local',  'user',      3, extensions.crypt('Pwa@12345', extensions.gen_salt('bf'))),
  ('user2',  'ช่างเทคนิค 2',     'ช่างเทคนิค',       'งานบริการ',    'บริการ',   '5512027','หน่วยงาน','user2@pwa.local',  'user',      4, extensions.crypt('Pwa@12345', extensions.gen_salt('bf'))),
  ('user3',  'นักบัญชี',          'นักบัญชี',         'งานการเงิน',   'จัดเก็บ',  '5512027','หน่วยงาน','user3@pwa.local',  'user',      5, extensions.crypt('Pwa@12345', extensions.gen_salt('bf')))
on conflict (wwcode) do update set pass_hash = excluded.pass_hash;

-- Storage buckets สำหรับไฟล์แนบ / รูปอัปเดต / รูปโปรไฟล์
-- Vercel API ใช้ service_role upload เข้า bucket เหล่านี้ และใช้ public URL สำหรับ download/view
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('task-attachments', 'task-attachments', true, 15728640, array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]),
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Verify local login for Vercel/Supabase API
-- ต้อง drop ก่อน เพราะ PostgreSQL ไม่อนุญาตให้ CREATE OR REPLACE เปลี่ยน return table type
drop function if exists public.tf_verify_login(text, text);
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
  avatar_url varchar,
  telegram_chat_id varchar
)
language sql
security definer
set search_path = public
as $$
  select u.id,u.wwcode,u.name,u.role,u.dept,u.dept_key,u.branch,u.branch_name,u.email,u.urole,u.color,u.avatar_url,u.telegram_chat_id
  from public.tf_users u
  where (u.wwcode = p_username or u.email = p_username)
    and u.pass_hash::text = extensions.crypt(p_password::text, u.pass_hash::text)
  limit 1;
$$;

-- Save member with password hashing for Vercel/Supabase API
-- drop ทั้ง signature เก่าและใหม่ เพื่อให้รัน schema ซ้ำได้ปลอดภัย
drop function if exists public.tf_member_save(bigint, text, text, text, text, text, text, text, text, text, smallint, text);
drop function if exists public.tf_member_save(bigint, text, text, text, text, text, text, text, text, text, smallint, text, text);
create or replace function public.tf_member_save(
  p_id bigint default null,
  p_wwcode text default null,
  p_name text default null,
  p_role text default '',
  p_dept text default '',
  p_dept_key text default '',
  p_branch text default '',
  p_branch_name text default '',
  p_email text default '',
  p_urole text default 'user',
  p_color smallint default 0,
  p_telegram_chat_id text default '',
  p_new_password text default null
)
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
  avatar_url varchar,
  telegram_chat_id varchar
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_wwcode text;
  v_base text;
  v_suffix int := 0;
begin
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Missing name';
  end if;

  v_wwcode := nullif(trim(coalesce(p_wwcode, '')), '');
  if v_wwcode is null then
    v_base := lower(regexp_replace(split_part(coalesce(p_email, 'user'), '@', 1), '[^a-zA-Z0-9]', '', 'g'));
    if v_base is null or v_base = '' then
      v_base := 'u' || substr(md5(random()::text), 1, 8);
    end if;
    v_wwcode := left(v_base, 14);
  end if;

  if coalesce(p_id, 0) = 0 then
    while exists (select 1 from public.tf_users u where u.wwcode = v_wwcode) loop
      v_suffix := v_suffix + 1;
      v_wwcode := left(v_wwcode, 14) || v_suffix::text;
    end loop;

    insert into public.tf_users (
      wwcode, name, role, dept, dept_key, branch, branch_name, email, urole, color, pass_hash, telegram_chat_id
    ) values (
      v_wwcode,
      trim(p_name),
      coalesce(p_role, ''),
      coalesce(p_dept, ''),
      coalesce(p_dept_key, ''),
      coalesce(p_branch, ''),
      coalesce(p_branch_name, ''),
      coalesce(p_email, ''),
      case when p_urole in ('admin','manager','assistant','user') then p_urole else 'user' end,
      coalesce(p_color, 0),
      extensions.crypt(coalesce(nullif(p_new_password, ''), 'user123'), extensions.gen_salt('bf')),
      coalesce(p_telegram_chat_id, '')
    ) returning tf_users.id into v_id;
  else
    v_id := p_id;
    update public.tf_users u set
      name = trim(p_name),
      role = coalesce(p_role, ''),
      dept = coalesce(p_dept, ''),
      dept_key = coalesce(p_dept_key, ''),
      branch = coalesce(p_branch, u.branch),
      branch_name = coalesce(p_branch_name, u.branch_name),
      email = coalesce(p_email, ''),
      urole = case when p_urole in ('admin','manager','assistant','user') then p_urole else u.urole end,
      color = coalesce(p_color, u.color),
      telegram_chat_id = coalesce(p_telegram_chat_id, u.telegram_chat_id),
      pass_hash = case
        when nullif(p_new_password, '') is not null then extensions.crypt(p_new_password, extensions.gen_salt('bf'))
        else u.pass_hash
      end,
      updated_at = now()
    where u.id = p_id;
  end if;

  return query
  select u.id,u.wwcode,u.name,u.role,u.dept,u.dept_key,u.branch,u.branch_name,u.email,u.urole,u.color,u.avatar_url,u.telegram_chat_id
  from public.tf_users u
  where u.id = v_id;
end;
$$;
