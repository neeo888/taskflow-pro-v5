<?php
// ============================================================
//  php/db_config.php — TaskFlow Pro Database Config & Helpers
// ============================================================

// ── Constants ────────────────────────────────────────────────
define('DB_HOST',    'localhost');
define('DB_USER',    'root');
define('DB_PASS',    '');
define('DB_NAME',    'taskflow');
define('SESSION_H',  720);   // session lifetime (hours) — 30 days
define('MAX_IMG_MB', 5);
define('MAX_FILE_MB',20);

// Upload paths (adjust if your server root differs)
define('UPLOAD_DIR', dirname(__DIR__).'/uploads');
define('AVATAR_DIR', UPLOAD_DIR.'/avatars');
define('TASK_DIR',   UPLOAD_DIR.'/tasks');

// Public URLs — แก้ให้ตรงกับ URL ของเซิร์ฟเวอร์จริง
// e.g. '/taskflow/uploads/avatars/' หากติดตั้งใน subfolder
define('SITE_BASE',  '');
define('AVATAR_URL', SITE_BASE.'/uploads/avatars/');
define('TASK_URL',   SITE_BASE.'/uploads/tasks/');

// ── PDO Singleton ─────────────────────────────────────────────
$_pdo = null;
function db(): PDO {
    global $_pdo;
    if ($_pdo) return $_pdo;
    try {
        $_pdo = new PDO(
            'mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4',
            DB_USER, DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'DB connection failed: '.$e->getMessage()]);
        exit;
    }
    return $_pdo;
}

// ── JSON response helpers ─────────────────────────────────────
function ok(array $data=[], int $code=200): void {
    http_response_code($code);
    echo json_encode(['ok'=>true]+$data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}

function err(string $msg, int $code=400): void {
    http_response_code($code);
    echo json_encode(['ok'=>false,'error'=>$msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── Auth helper ───────────────────────────────────────────────
// อ่าน token จาก: X-Token header, Authorization: Bearer, หรือ Cookie tf_tok
function auth(): array {
    $token = '';

    // 1. X-Token header (ส่งจาก JS fetch)
    $xt = $_SERVER['HTTP_X_TOKEN'] ?? '';
    if ($xt) $token = $xt;

    // 2. Authorization: Bearer <token>
    if (!$token) {
        $ah = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $ah, $m)) $token = trim($m[1]);
    }

    // 3. Cookie (fallback)
    if (!$token) $token = $_COOKIE['tf_tok'] ?? '';

    if (!$token) err('Unauthorized — กรุณาเข้าสู่ระบบ', 401);

    $st = db()->prepare(
        'SELECT s.token, u.id AS uid, u.name, u.urole, u.branch, u.dept_key
         FROM tf_sessions s
         JOIN tf_users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > NOW()
         LIMIT 1'
    );
    $st->execute([$token]);
    $row = $st->fetch();
    if (!$row) err('Session หมดอายุ — กรุณา login ใหม่', 401);

    return [
        'id'       => (int)$row['uid'],
        'name'     => $row['name'],
        'urole'    => $row['urole'],
        'branch'   => $row['branch'],
        'dept_key' => $row['dept_key'],
        'token'    => $row['token'],
    ];
}
