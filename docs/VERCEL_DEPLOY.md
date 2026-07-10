# Deploy TaskFlow Pro v5 on Vercel

## สำคัญก่อน deploy
Vercel ไม่รัน PHP + MySQL ของโปรเจกต์เดิมโดยตรง ดังนั้นการ deploy บน Vercel ตอนนี้ใช้สำหรับหน้า static preview/frontend เท่านั้น

ถ้าต้องการระบบใช้งานจริงแบบหลายเครื่อง/ข้อมูลไม่หาย ต้องใช้ Supabase เป็น backend แล้ว refactor API/Frontend ให้เรียก Supabase หรือใช้ PHP hosting แยกสำหรับ backend

## วิธี deploy preview บน Vercel

1. Push repo ขึ้น GitHub ก่อน
2. เปิด https://vercel.com/new
3. เลือก repo `taskflow-pro-v5`
4. กด Import
5. ในหน้า Configure Project ให้ตั้งค่า:

- Framework Preset: `Other`
- Root Directory: `vercel-static`
- Build Command: เว้นว่าง
- Output Directory: เว้นว่าง
- Install Command: เว้นว่าง

6. กด Deploy

## ถ้าต้องการ deploy ระบบจริง
เลือกหนึ่งทาง:

### ทาง A: PHP hosting + Supabase/PostgreSQL หรือ MySQL
เหมาะกับโค้ดปัจจุบันที่สุด เพราะมี `php/api.php` อยู่แล้ว

### ทาง B: Vercel + Supabase เต็มรูปแบบ
ต้อง refactor:
- ย้าย PHP API เป็น Vercel Serverless Functions หรือ Supabase Edge Functions
- เปลี่ยน frontend ให้เรียก Supabase/Auth/Storage
- ตั้ง RLS policy ใน Supabase

## Root Directory ที่ต้องเลือกบน Vercel
เลือก:

```text
vercel-static
```

ห้ามเลือก root หลักถ้าต้องการ preview เพราะ root หลักเป็น PHP project
