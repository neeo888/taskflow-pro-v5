<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success'=>false,'message'=>'Method not allowed']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$username = trim($body['username'] ?? '');
$password = $body['password'] ?? '';

if (!$username || !$password) {
    echo json_encode(['success'=>false,'message'=>'กรุณากรอกรหัสพนักงานและรหัสผ่าน']);
    exit;
}

$url = "https://intranet.pwa.co.th/login/webservice_reg10.php"
     . "?username=" . urlencode($username)
     . "&password=" . urlencode($password);

$context = stream_context_create([
    'http' => ['timeout' => 15, 'ignore_errors' => true],
    'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false]
]);

$raw = @file_get_contents($url, false, $context);

if ($raw === false) {
    echo json_encode(['success'=>false,'message'=>'ไม่สามารถเชื่อมต่อระบบ PWA ได้ กรุณาลองใหม่']);
    exit;
}

// ── Parse JSONP: format คือ ({"key":"val"});
$cleaned = trim($raw);
// ลบ ( นำหน้า และ ); ต่อท้าย
$cleaned = preg_replace('/^\s*\(/', '', $cleaned);   // ลบ (
$cleaned = preg_replace('/\);\s*$/', '', $cleaned);  // ลบ );
// กรณีเป็น [{...}] array
if (substr($cleaned,0,1)==='[') $cleaned = substr($cleaned,1);
if (substr($cleaned,-1)===']') $cleaned = substr($cleaned,0,-1);

$json = json_decode($cleaned, true);

if (!$json) {
    echo json_encode(['success'=>false,'message'=>'รูปแบบข้อมูลจาก PWA ไม่ถูกต้อง: '.$cleaned]);
    exit;
}

// ── กรณี Error จาก PWA
if (isset($json['ErrMsg'])) {
    echo json_encode(['success'=>false,'message'=>'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง']);
    exit;
}

// ── ตรวจสอบ check field
if (!isset($json['check']) || $json['check'] !== 'Pass') {
    echo json_encode(['success'=>false,'message'=>'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง']);
    exit;
}

// ── Login สำเร็จ
echo json_encode([
    'success'       => true,
    'user'          => $json['user']       ?? '',
    'prefix_name'   => $json['Gender']     ?? '',
    'name'          => $json['Name']       ?? '',
    'surname'       => $json['Surname']    ?? '',
    'costcenter'    => $json['costcenter'] ?? '',
    'ba'            => $json['ba']         ?? '',
    'part'          => $json['part']       ?? '',
    'area'          => $json['area']       ?? '',
    'wwcode'        => $json['wwcode']     ?? '',
    'div_name'      => $json['div_name']   ?? '',
    'job_name'      => $json['Job_name']   ?? '',
    'dep_name'      => $json['dep_name']   ?? '',
    'org_name'      => $json['org_name']   ?? '',
    'position_name' => $json['Position']   ?? '',
    'level'         => $json['MyLevel']    ?? '',
]);
