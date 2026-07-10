<?php
// ตัวอย่าง config สำหรับเชื่อม Supabase PostgreSQL ผ่าน PDO
// ต้องติดตั้ง/เปิด extension pdo_pgsql บน hosting ก่อน
// คัดลอกไฟล์นี้เป็น php/db_config.php เฉพาะเมื่อย้าย API ให้รองรับ PostgreSQL แล้วเท่านั้น

$host = getenv('SUPABASE_DB_HOST') ?: 'db.YOUR_PROJECT_REF.supabase.co';
$port = getenv('SUPABASE_DB_PORT') ?: '5432';
$db   = getenv('SUPABASE_DB_NAME') ?: 'postgres';
$user = getenv('SUPABASE_DB_USER') ?: 'postgres';
$pass = getenv('SUPABASE_DB_PASS') ?: 'YOUR_DATABASE_PASSWORD';

function db(): PDO {
    static $pdo = null;
    global $host, $port, $db, $user, $pass;
    if ($pdo) return $pdo;
    $pdo = new PDO("pgsql:host=$host;port=$port;dbname=$db;sslmode=require", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}
