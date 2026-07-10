<?php
// search_api.php — ค้นหางานผ่าน token auth (ใช้ db_config.php เดียวกับ api.php)
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__.'/db_config.php';

$token = $_SERVER['HTTP_X_TOKEN'] ?? ($_COOKIE['tf_tok'] ?? '');
if (!$token) { echo json_encode([]); exit; }

$st = db()->prepare('SELECT s.user_id, u.urole, u.branch FROM tf_sessions s JOIN tf_users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>NOW() LIMIT 1');
$st->execute([$token]);
$sess = $st->fetch();
if (!$sess) { echo json_encode([]); exit; }

$keyword = '%'.trim($_GET['keyword'] ?? '').'%';
$isAdmin = $sess['urole'] === 'admin';

try {
    if ($isAdmin) {
        $sql = "SELECT t.id, t.title, t.col AS status, t.priority, t.due_date FROM tf_tasks t WHERE t.title LIKE ? ORDER BY t.created_at DESC LIMIT 30";
        $r = db()->prepare($sql); $r->execute([$keyword]);
    } else {
        $sql = "SELECT t.id, t.title, t.col AS status, t.priority, t.due_date
                FROM tf_tasks t LEFT JOIN tf_task_assignees ta ON ta.task_id=t.id
                WHERE (ta.user_id=? OR t.created_by=?) AND t.title LIKE ?
                GROUP BY t.id ORDER BY t.created_at DESC LIMIT 30";
        $r = db()->prepare($sql); $r->execute([(int)$sess['user_id'],(int)$sess['user_id'],$keyword]);
    }
    echo json_encode($r->fetchAll());
} catch (PDOException $e) {
    echo json_encode(['error' => 'ระบบฐานข้อมูลขัดข้อง']);
}
