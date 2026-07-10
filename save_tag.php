<?php
// save_tag.php — redirect tag saves ไปยัง api.php logic
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__.'/php/db_config.php';

$token = $_SERVER['HTTP_X_TOKEN'] ?? ($_COOKIE['tf_tok'] ?? '');
if (!$token) { echo json_encode(['status'=>'error','message'=>'Unauthorized']); exit; }

$st = db()->prepare('SELECT s.user_id FROM tf_sessions s WHERE s.token=? AND s.expires_at>NOW() LIMIT 1');
$st->execute([$token]);
$sess = $st->fetch();
if (!$sess) { echo json_encode(['status'=>'error','message'=>'Session expired']); exit; }

$name = trim($_POST['tag_name'] ?? (json_decode(file_get_contents('php://input'),true)['name'] ?? ''));
if (!$name) { echo json_encode(['status'=>'error','message'=>'Missing tag name']); exit; }

try {
    db()->prepare('INSERT IGNORE INTO tf_tags (name) VALUES (?)')->execute([$name]);
    echo json_encode(['status'=>'success','name'=>$name]);
} catch (PDOException $e) {
    echo json_encode(['status'=>'error','message'=>$e->getMessage()]);
}
