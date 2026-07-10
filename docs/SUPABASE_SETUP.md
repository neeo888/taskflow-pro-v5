# TaskFlow Pro v5 + Supabase Setup

## สถานะสำคัญ
โปรเจกต์เดิมเป็น PHP + MySQL ส่วน Supabase ใช้ PostgreSQL + Storage + API ดังนั้นยังไม่ใช่การเปลี่ยน URL แล้วจบ ต้องเลือกแนวทาง deploy ก่อน:

1. ใช้ PHP backend เดิม + Supabase PostgreSQL ผ่าน `pdo_pgsql`
2. ย้าย frontend ให้เรียก Supabase REST/JS client โดยตรง
3. ใช้ Supabase เฉพาะ Database/Storage แล้วค่อย refactor API ทีละ endpoint

แนวทางที่ปลอดภัยสุดคือข้อ 3 เพราะไม่เปลี่ยน UI เดิมทันที

## ขั้นตอนสร้างฐานข้อมูล
1. เปิด Supabase project
2. ไปที่ SQL Editor
3. เปิดไฟล์ `supabase/schema.sql`
4. กด Run

ไฟล์นี้จะสร้างตาราง:
- `tf_users`
- `tf_sessions`
- `tf_tasks`
- `tf_task_assignees`
- `tf_task_steps`
- `tf_step_checks`
- `tf_attachments`
- `tf_obstacles`
- `tf_comments`
- `tf_progress_log`
- `tf_notifications`
- `tf_tags`

และสร้าง user demo รหัสผ่าน `Pwa@12345`

## ขั้นตอนสร้าง Storage
ไปที่ Storage > New bucket แล้วสร้าง:

- `task-attachments`
- `avatars`

ถ้าใช้ upload จาก backend ให้ bucket เป็น private ได้ แล้วให้ backend ออก signed URL
ถ้าใช้ upload จาก browser ตรง ๆ ต้องตั้ง policy ให้เหมาะสม ห้ามเปิด public write

## ค่า ENV ที่ต้องเก็บ
ดูตัวอย่างใน `supabase/.env.example`

ห้าม commit `SUPABASE_SERVICE_ROLE_KEY` ลง GitHub เด็ดขาด

## หมายเหตุเรื่อง GitHub Pages
GitHub Pages รัน PHP ไม่ได้ และไม่มี server-side secret จึงไม่ควรใส่ service role key ในเว็บ static

ถ้าจะใช้ GitHub Pages + Supabase ต้องเปลี่ยนระบบ auth/storage/API ให้ใช้ Supabase client ฝั่ง browser พร้อม RLS policy ที่ปลอดภัยก่อน
