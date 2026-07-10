-- สร้าง Local Accounts (รหัสผ่าน: Pwa@12345)
USE taskflow;
-- bcrypt hash ของ "Pwa@12345"
SET @h = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

INSERT INTO tf_users (wwcode,name,role,dept,dept_key,branch,branch_name,email,urole,color,pass_hash)
VALUES
  ('admin',  'ผู้ดูแลระบบ',      'System Admin',    'ฝ่ายเทคโนโลยี','บริการ',   '5512027','หน่วยงาน','admin@pwa.local',  'admin',     0,@h),
  ('manager','ผู้จัดการสาขา',    'ผู้จัดการ',        'สำนักงาน',     'อำนวยการ', '5512027','หน่วยงาน','manager@pwa.local','manager',   1,@h),
  ('assist', 'ผู้ช่วยผู้จัดการ',  'ผู้ช่วยผู้จัดการ', 'สำนักงาน',     'อำนวยการ', '5512027','หน่วยงาน','assist@pwa.local', 'assistant', 2,@h),
  ('user1',  'ช่างเทคนิค 1',     'ช่างเทคนิค',       'งานบริการ',    'บริการ',   '5512027','หน่วยงาน','user1@pwa.local',  'user',      3,@h),
  ('user2',  'ช่างเทคนิค 2',     'ช่างเทคนิค',       'งานบริการ',    'บริการ',   '5512027','หน่วยงาน','user2@pwa.local',  'user',      4,@h),
  ('user3',  'นักบัญชี',          'นักบัญชี',         'งานการเงิน',   'จัดเก็บ',  '5512027','หน่วยงาน','user3@pwa.local',  'user',      5,@h)
ON DUPLICATE KEY UPDATE pass_hash=@h;

SELECT wwcode AS username, name, urole AS role, 'Pwa@12345' AS default_password FROM tf_users;
