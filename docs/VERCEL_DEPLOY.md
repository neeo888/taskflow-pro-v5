# Deploy TaskFlow Pro v5 on Vercel + Supabase

## สรุปสถานะ
ชุด Vercel อยู่ในโฟลเดอร์ `vercel-static` และมี Vercel Edge API ที่ route เดิมของหน้าเว็บเรียกได้:

- `/php/api.php?action=...` → `/api/taskflow`
- `/save_tag.php` → `/api/taskflow?action=tag_save`

ดังนั้น UI เดิมยังเรียก endpoint ชื่อเดิมได้ โดย Vercel จะ rewrite ไปที่ API ที่ต่อ Supabase

## 1) ตั้ง Supabase ก่อน

1. เปิด Supabase Project
2. ไปที่ SQL Editor
3. วาง SQL จากไฟล์:

```text
supabase/schema.sql
```

4. กด Run
5. ไปที่ Storage แล้วสร้าง bucket:

```text
avatars
task-attachments
```

สำหรับเวอร์ชันนี้ให้ตั้ง `task-attachments` เป็น public เพื่อให้ download จาก `file_url` ได้ง่ายก่อน

## 2) ตั้ง Environment Variables ใน Vercel

ใน Vercel > Project > Settings > Environment Variables เพิ่ม:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SESSION_HOURS=720
```

ห้ามใส่ `SUPABASE_SERVICE_ROLE_KEY` ใน frontend หรือ GitHub แบบ public text

## 3) Import GitHub Repository

1. เปิด https://vercel.com/new
2. เลือก repo `taskflow-pro-v5`
3. กด Import
4. ตั้งค่า:

```text
Framework Preset: Other
Root Directory: vercel-static
Build Command: เว้นว่าง
Output Directory: เว้นว่าง
Install Command: เว้นว่าง
```

5. กด Deploy

## 4) Login ทดสอบ

หลัง deploy ใช้ local account:

```text
admin / Pwa@12345
manager / Pwa@12345
assist / Pwa@12345
user1 / Pwa@12345
user2 / Pwa@12345
user3 / Pwa@12345
```

## 5) สิ่งที่ทำงานผ่าน Supabase API แล้ว

- local login
- โหลด users
- โหลด tasks
- สร้าง/แก้ไข/ลบ task
- เปลี่ยน column/status
- progress log
- checklist
- submit work
- verify/return task
- obstacles
- comments
- notifications
- tags
- file upload ไป Supabase Storage bucket `task-attachments`

## 6) ข้อควรระวัง

ระบบนี้ใช้ Service Role Key ใน Vercel Edge Function เท่านั้น อย่านำ key ไปใส่ใน `index.html` หรือไฟล์ JS ฝั่ง browser

ถ้าแก้ Supabase schema แล้วต้อง Redeploy Vercel ใหม่เฉพาะกรณีเปลี่ยน API code ไม่ใช่ทุกครั้งที่เปลี่ยน data
