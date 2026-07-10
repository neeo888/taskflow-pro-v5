<?php
// ============================================================
// install_check.php — ตรวจสอบระบบผ่าน Browser
// เปิด: https://yourdomain.com/taskflow/install_check.php
// ⚠️ ลบไฟล์นี้หลังติดตั้งเสร็จ!
// ============================================================
?><!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TaskFlow — Install Checker</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Sarabun',sans-serif;background:#0B1E3D;color:#fff;padding:24px;min-height:100vh;}
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
.wrap{max-width:700px;margin:0 auto;}
.card{background:#132847;border-radius:16px;padding:24px;margin-bottom:16px;}
h1{font-size:20px;font-weight:700;color:#00D4AA;margin-bottom:4px;}
h2{font-size:14px;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:14px;}
.sub{font-size:12px;color:rgba(255,255,255,.35);margin-bottom:20px;}
.row{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:9px;margin-bottom:6px;}
.row.ok{background:rgba(16,185,129,.12);}
.row.fail{background:rgba(255,77,109,.12);}
.row.warn{background:rgba(255,179,64,.1);}
.icon{font-size:16px;flex-shrink:0;}
.label{flex:1;font-size:13px;}
.note{font-size:11px;opacity:.5;}
.btn{display:inline-block;background:#00D4AA;border:none;border-radius:9px;padding:11px 22px;font-size:13px;font-weight:700;color:#0B1E3D;cursor:pointer;text-decoration:none;margin-top:4px;}
.btn.danger{background:#FF4D6D;color:#fff;}
.btn.sec{background:rgba(255,255,255,.1);color:#fff;}
.section-title{font-size:11px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.06em;margin:16px 0 8px;}
.code{background:rgba(0,0,0,.3);border-radius:7px;padding:10px 13px;font-family:monospace;font-size:12px;color:#00D4AA;margin:8px 0;}
.divider{border:none;border-top:.5px solid rgba(255,255,255,.08);margin:16px 0;}
.summary{font-size:24px;font-weight:700;text-align:center;padding:16px;}
.summary.all-ok{color:#10B981;}
.summary.has-fail{color:#FF4D6D;}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>🔧 TaskFlow Pro — Install Checker</h1>
    <div class="sub">การประปาส่วนภูมิภาค สาขาพิษณุโลก | ตรวจสอบความพร้อมของระบบ</div>

<?php
$ok_count = 0;
$fail_count = 0;

function check($label, $ok, $note='', $type='') {
    global $ok_count, $fail_count;
    $cls = $ok ? 'ok' : ($type==='warn' ? 'warn' : 'fail');
    $icon = $ok ? '✅' : ($type==='warn' ? '⚠️' : '❌');
    if($ok) $ok_count++; else $fail_count++;
    echo "<div class='row $cls'><span class='icon'>$icon</span><span class='label'>$label</span><span class='note'>".htmlspecialchars($note)."</span></div>";
}

// ── PHP ──────────────────────────────────────────────────────
echo "<div class='section-title'>PHP</div>";
check('PHP Version ('.PHP_VERSION.')', version_compare(PHP_VERSION,'7.4','>='),
    version_compare(PHP_VERSION,'7.4','>=') ? 'ผ่าน' : 'ต้องการ PHP 7.4+');

foreach(['pdo','pdo_mysql','json','mbstring','curl','openssl'] as $ext){
    check("Extension: $ext", extension_loaded($ext),
        extension_loaded($ext) ? 'โหลดแล้ว' : 'ไม่พบ — ติดต่อ hosting');
}

// ── Database ─────────────────────────────────────────────────
echo "<div class='section-title'>MySQL / MariaDB</div>";

// Try to connect
$db_host = 'localhost';
$db_name = 'taskflow';
$db_user = 'taskflow_user';
$db_pass = '';  // ← ใส่ password จริงเพื่อทดสอบ

$db_ok = false;
$db = null;

// Read from config if exists
if(file_exists(__DIR__.'/php/config.php')){
    include_once __DIR__.'/php/config.php';
    try {
        $db = getDB();
        $db_ok = true;
    } catch(Exception $e){
        $db_err = $e->getMessage();
    }
} else {
    // Try direct connection
    try {
        $dsn = "mysql:host=$db_host;dbname=$db_name;charset=utf8mb4";
        $db = new PDO($dsn, $db_user, $db_pass, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
        $db_ok = true;
    } catch(Exception $e){
        $db_err = $e->getMessage();
    }
}

check('config.php', file_exists(__DIR__.'/php/config.php'),
    file_exists(__DIR__.'/php/config.php') ? 'พบไฟล์' : '❗ ไม่พบ — สร้างจาก template');
check('Database Connection', $db_ok,
    $db_ok ? "เชื่อมต่อ $db_name สำเร็จ" : ($db_err??'ไม่สามารถเชื่อมต่อ'));

// ── Tables ───────────────────────────────────────────────────
if($db_ok && $db){
    echo "<div class='section-title'>ตาราง Database</div>";
    $tables = ['users','tasks','task_assignees','tags','task_steps','step_checks',
               'attachments','obstacles','task_comments','progress_log','notifications','sessions'];
    $missing = [];
    foreach($tables as $t){
        try{
            $db->query("SELECT 1 FROM `$t` LIMIT 1");
            check("Table: $t", true, 'พบตาราง');
        } catch(Exception $e){
            check("Table: $t", false, 'ไม่พบ');
            $missing[] = $t;
        }
    }

    // Seed data
    echo "<div class='section-title'>ข้อมูลเริ่มต้น</div>";
    try {
        $cnt = (int)$db->query("SELECT COUNT(*) FROM users")->fetchColumn();
        check("Users ($cnt คน)", $cnt > 0, $cnt > 0 ? 'มีข้อมูลแล้ว' : 'ยังว่าง — รัน schema');
        $tcnt = (int)$db->query("SELECT COUNT(*) FROM tasks")->fetchColumn();
        check("Tasks ($tcnt งาน)", true, "$tcnt งานในระบบ");
    } catch(Exception $e){}

    // Auto-create tables
    if(!empty($missing) && isset($_POST['create_tables'])){
        $schema_file = __DIR__.'/sql/taskflow_schema.sql';
        if(file_exists($schema_file)){
            $sql = file_get_contents($schema_file);
            $stmts = array_filter(array_map('trim', explode(';',$sql)));
            $ran = 0; $errors = [];
            foreach($stmts as $stmt){
                if(empty($stmt) || strpos(ltrim($stmt),'--')===0) continue;
                try{ $db->exec($stmt); $ran++; }
                catch(Exception $e){ $errors[]=$e->getMessage(); }
            }
            echo "<div class='row ok'><span class='icon'>🔧</span><span class='label'>สร้างตาราง $ran statements</span><span class='note'>".($errors?implode(', ',array_slice($errors,0,2)):'สำเร็จ')."</span></div>";
        }
    }
}

// ── Files ────────────────────────────────────────────────────
echo "<div class='section-title'>ไฟล์ระบบ</div>";
$files = [
    'index.html' => 'หน้าแอปหลัก',
    'pwa_login.php' => 'PHP proxy สำหรับ login กปภ.',
    'php/api.php' => 'REST API',
    'php/config.php' => 'Database config',
    '.htaccess' => 'Apache config',
];
foreach($files as $file => $desc){
    check("$file ($desc)", file_exists(__DIR__.'/'.$file),
        file_exists(__DIR__.'/'.$file) ? 'พบไฟล์' : 'ไม่พบ — ต้อง upload');
}

// ── PWA API Test ─────────────────────────────────────────────
echo "<div class='section-title'>ทดสอบการเชื่อมต่อ PWA Intranet</div>";
$pwa_url = "https://intranet.pwa.co.th/login/webservice_reg10.php?username=test&password=test";
$ctx = stream_context_create(['http'=>['timeout'=>8],'ssl'=>['verify_peer'=>false,'verify_peer_name'=>false]]);
$pwa_ok = @file_get_contents($pwa_url, false, $ctx) !== false;
check('เชื่อมต่อ intranet.pwa.co.th', $pwa_ok,
    $pwa_ok ? 'เข้าถึงได้' : 'ไม่สามารถเข้าถึง — ตรวจสอบ firewall หรือ allow_url_fopen');

// Check allow_url_fopen
check('allow_url_fopen', ini_get('allow_url_fopen') == '1',
    ini_get('allow_url_fopen') == '1' ? 'เปิดอยู่' : 'ปิดอยู่ — ต้องเปิดใน php.ini');
?>

    <hr class="divider">
    <?php
    $all_ok = $fail_count === 0;
    echo "<div class='summary ".($all_ok?'all-ok':'has-fail')."'>";
    echo $all_ok ? "✅ ระบบพร้อมใช้งาน!" : "❌ พบปัญหา $fail_count รายการ";
    echo "</div>";
    ?>

    <?php if($db_ok && !empty($missing)): ?>
    <hr class="divider">
    <h2>📋 สร้างตาราง Database</h2>
    <form method="POST">
        <button class="btn" name="create_tables" value="1">▶ สร้างตารางทั้งหมดอัตโนมัติ</button>
    </form>
    <?php endif; ?>

    <?php if(!$db_ok): ?>
    <hr class="divider">
    <h2>📝 ขั้นตอนแก้ไข</h2>

    <b style="font-size:13px;">1. สร้าง Database ใน cPanel → MySQL Databases:</b>
    <div class="code">
        Database: taskflow<br>
        Username: taskflow_user<br>
        Password: [กำหนดเอง]
    </div>

    <b style="font-size:13px;">2. แก้ไขไฟล์ php/config.php:</b>
    <div class="code">
        define('DB_HOST', 'localhost');<br>
        define('DB_NAME', 'taskflow');<br>
        define('DB_USER', 'taskflow_user');<br>
        define('DB_PASS', 'password_ของคุณ');
    </div>

    <b style="font-size:13px;">3. Upload ไฟล์ sql/taskflow_schema.sql แล้วกลับมากดสร้างตาราง</b>
    <?php endif; ?>

    <?php if($db_ok): ?>
    <hr class="divider">
    <form method="POST" style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn" onclick="window.location='index.html';return false;">🚀 เปิดแอป</button>
        <button class="btn sec" name="gen_hash" value="1">🔐 สร้าง password hash</button>
    </form>
    <?php
    if(isset($_POST['gen_hash'])){
        $accounts = ['admin','manager','asst123','user123'];
        foreach($accounts as $p){
            echo "<div class='code'>".htmlspecialchars($p)." → ".password_hash($p, PASSWORD_BCRYPT)."</div>";
        }
    }
    ?>
    <?php endif; ?>

    <hr class="divider">
    <div style="background:rgba(255,77,109,.1);border-radius:9px;padding:12px;font-size:12px;color:#FF9CAA;margin-top:8px;">
        ⚠️ <b>ลบไฟล์ install_check.php ออกจาก server</b> หลังติดตั้งเสร็จ เพื่อความปลอดภัย
    </div>

  </div>
</div>
</body>
</html>
