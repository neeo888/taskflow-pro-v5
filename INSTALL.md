# TaskFlow Pro — ติดตั้ง

## วิธี Login (3 แบบ)

| แบบ | วิธีใช้ | เหมาะกับ |
|-----|---------|---------|
| 🏢 **กปภ. SSO** | รหัสพนักงาน + รหัสผ่าน intranet.pwa.co.th | พนักงาน กปภ. ปกติ |
| 🔑 **Local Account** | username + รหัสผ่านที่ Admin ตั้งให้ | ทดสอบ / ไม่มีเน็ต กปภ. |
| ⚡ **Offline** | กด Escape บนหน้า login | dev/test เท่านั้น |

## ขั้นตอน Deploy

```bash
# 1. สร้าง Database
mysql -u root -p < sql/schema.sql

# 2. สร้าง Local Accounts (รหัสผ่านเริ่มต้น: Pwa@12345)
mysql -u root -p taskflow < sql/seed_local_accounts.sql

# 3. แก้ php/config.php
DB_PASS = "รหัสผ่าน MySQL ของคุณ"
AVATAR_URL = "/taskflow/uploads/avatars/"

# 4. Upload ทั้งโฟลเดอร์ไป public_html/taskflow/
chmod 755 uploads/ uploads/avatars/ uploads/tasks/

# 5. ตรวจสอบ
https://yourdomain.com/taskflow/install_check.php
```

## Local Accounts เริ่มต้น

| Username | รหัสผ่าน | บทบาท |
|----------|---------|------|
| admin    | Pwa@12345 | Admin |
| manager  | Pwa@12345 | Manager |
| assist   | Pwa@12345 | Assistant |
| user1    | Pwa@12345 | User |
| user2    | Pwa@12345 | User |

> ⚠️ เปลี่ยนรหัสผ่านทันทีหลังเข้าระบบครั้งแรก
