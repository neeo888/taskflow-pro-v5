<?php
ini_set("display_errors", 1);
error_reporting(E_ALL);
// ============================================================
//  php/api.php  —  TaskFlow Pro REST API
// ============================================================
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__.'/db_config.php';
// cors();

$act = $_GET['action'] ?? '';
$m   = $_SERVER['REQUEST_METHOD'];

match(true) {
    $act==='me'             && $m==='GET'  => me(),
    $act==='logout'         && $m==='POST' => logout(),
    $act==='local_login'    && $m==='POST' => localLogin(),
    $act==='change_password'&& $m==='POST' => changePassword(),
    $act==='profile_update' && $m==='POST' => profileUpdate(),
    $act==='avatar_upload'  && $m==='POST' => avatarUpload(),
    $act==='avatar_remove'  && $m==='POST' => avatarRemove(),
    $act==='users'          && $m==='GET'  => getUsers(),
    $act==='user_save'      && $m==='POST' => userSave(),
    $act==='user_delete'    && $m==='POST' => userDelete(),
    $act==='tasks'          && $m==='GET'  => getTasks(),
    $act==='task_save'      && $m==='POST' => taskSave(),
    $act==='task_delete'    && $m==='POST' => taskDelete(),
    $act==='task_col'       && $m==='POST' => taskCol(),
    $act==='task_progress'  && $m==='POST' => taskProgress(),
    $act==='task_submit'    && $m==='POST' => taskSubmit(),
    $act==='task_verify'    && $m==='POST' => taskVerify(),
    $act==='step_toggle'    && $m==='POST' => stepToggle(),
    $act==='file_upload'    && $m==='POST' => fileUpload(),
    $act==='notifications'  && $m==='GET'  => getNotifs(),
    $act==='notif_read'     && $m==='POST' => notifRead(),
    $act==='notif_ack'      && $m==='POST' => notifAck(),
    $act==='notif_clear'    && $m==='POST' => notifClear(),
    $act==='obstacle_add'   && $m==='POST' => obstacleAdd(),
    $act==='obstacle_resolve'&&$m==='POST' => obstacleResolve(),
    $act==='comment_add'    && $m==='POST' => commentAdd(),
    $act==='tags'           && $m==='GET'  => getTags(),
    $act==='tag_save'       && $m==='POST' => tagSave(),
    $act==='tag_delete'     && $m==='POST' => tagDelete(),
    default => err("Unknown: $act", 404),
};

// ── AUTH ──────────────────────────────────────────────────────
function me(): void {
    $s=auth();
    $u=db()->prepare('SELECT id,wwcode,name,role,dept,dept_key,branch,branch_name,email,urole,color,avatar_url FROM tf_users WHERE id=?');
    $u->execute([$s['id']]); $user=$u->fetch();
    if (!$user) err('Not found',404);
    $uc=db()->prepare('SELECT COUNT(*) FROM tf_notifications WHERE for_user_id=? AND is_read=0');
    $uc->execute([$s['id']]); $user['unread']=(int)$uc->fetchColumn();
    ok(['user'=>$user]);
}
function logout(): void {
    $s=auth();
    db()->prepare('DELETE FROM tf_sessions WHERE token=?')->execute([$s['token']]);
    ok();
}
function localLogin(): void {
    $b=json_decode(file_get_contents('php://input'),true)??[];
    $user=trim($b['username']??''); $pass=$b['password']??'';
    if (!$user||!$pass) err('กรุณากรอก username และรหัสผ่าน');
    $db=db();
    $st=$db->prepare('SELECT * FROM tf_users WHERE wwcode=? OR email=? LIMIT 1');
    $st->execute([$user,$user]); $u=$st->fetch();
    if (!$u) err('ไม่พบ username นี้ในระบบ');
    if (empty($u['pass_hash'])) err('ยังไม่ได้ตั้งรหัสผ่าน — ติดต่อ Admin');
    if (!password_verify($pass,$u['pass_hash'])) err('รหัสผ่านไม่ถูกต้อง');
    $token=bin2hex(random_bytes(32));
    $db->prepare('INSERT INTO tf_sessions (token,user_id,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL ? HOUR))')->execute([$token,$u['id'],SESSION_H]);
    $db->prepare('UPDATE tf_users SET last_login=NOW() WHERE id=?')->execute([$u['id']]);
    ok(['token'=>$token,'user'=>['id'=>(int)$u['id'],'wwcode'=>$u['wwcode'],'name'=>$u['name'],'role'=>$u['role'],'dept'=>$u['dept'],'dept_key'=>$u['dept_key'],'branch'=>$u['branch'],'branch_name'=>$u['branch_name'],'email'=>$u['email'],'urole'=>$u['urole'],'color'=>(int)$u['color'],'avatar_url'=>$u['avatar_url']]]);
}
function changePassword(): void {
    $s=auth(); $b=json_decode(file_get_contents('php://input'),true)??[];
    $old=$b['old_password']??''; $new=$b['new_password']??'';
    if (!$old||!$new) err('กรุณากรอกรหัสผ่าน');
    if (strlen($new)<8) err('รหัสผ่านต้องมีอย่างน้อย 8 ตัว');
    $db=db(); $st=$db->prepare('SELECT pass_hash FROM tf_users WHERE id=?'); $st->execute([$s['id']]); $h=$st->fetchColumn();
    if (empty($h)||!password_verify($old,$h)) err('รหัสผ่านเดิมไม่ถูกต้อง');
    $db->prepare('UPDATE tf_users SET pass_hash=? WHERE id=?')->execute([password_hash($new,PASSWORD_BCRYPT),$s['id']]);
    ok(['msg'=>'เปลี่ยนรหัสผ่านสำเร็จ']);
}

// ── PROFILE ───────────────────────────────────────────────────
function profileUpdate(): void {
    $s=auth(); $b=json_decode(file_get_contents('php://input'),true)??[];
    $sets=[]; $vals=[];
    foreach(['name','role','dept','email','color'] as $f) if(isset($b[$f])){$sets[]="$f=?";$vals[]=trim((string)$b[$f]);}
    if (!$sets) err('Nothing');
    $vals[]=$s['id'];
    db()->prepare('UPDATE tf_users SET '.implode(',',$sets).' WHERE id=?')->execute($vals);
    ok(['msg'=>'Updated']);
}
function avatarUpload(): void {
    $s=auth();
    if (empty($_FILES['avatar'])) err('No file');
    $f=$_FILES['avatar'];
    if ($f['error']!==UPLOAD_ERR_OK) err('Upload error');
    if ($f['size']>MAX_IMG_MB*1024*1024) err('Too large');
    $mime=mime_content_type($f['tmp_name']);
    if (!in_array($mime,['image/jpeg','image/png','image/gif','image/webp'])) err('Invalid type');
    $uid=$s['id']; $name='av_'.$uid.'_'.time().'.webp'; $path=AVATAR_DIR.'/'.$name;
    if (!_resizeWebp($f['tmp_name'],$path,300,300)) {
        $ext=pathinfo($f['name'],PATHINFO_EXTENSION)?:'jpg'; $name='av_'.$uid.'_'.time().'.'.$ext; $path=AVATAR_DIR.'/'.$name;
        if (!move_uploaded_file($f['tmp_name'],$path)) err('Save failed');
    }
    $url=AVATAR_URL.$name;
    $old=db()->prepare('SELECT avatar_path FROM tf_users WHERE id=?'); $old->execute([$uid]); $op=$old->fetchColumn();
    if ($op&&file_exists(UPLOAD_DIR.'/'.$op)) @unlink(UPLOAD_DIR.'/'.$op);
    db()->prepare('UPDATE tf_users SET avatar_path=?,avatar_url=? WHERE id=?')->execute(['avatars/'.$name,$url,$uid]);
    ok(['avatar_url'=>$url]);
}
function avatarRemove(): void {
    $s=auth(); $r=db()->prepare('SELECT avatar_path FROM tf_users WHERE id=?'); $r->execute([$s['id']]); $p=$r->fetchColumn();
    if ($p) @unlink(UPLOAD_DIR.'/'.$p);
    db()->prepare('UPDATE tf_users SET avatar_path="",avatar_url="" WHERE id=?')->execute([$s['id']]);
    ok();
}
function _resizeWebp(string $src,string $dst,int $mw,int $mh): bool {
    if (!function_exists('imagecreatefromjpeg')) return false;
    $info=@getimagesize($src); if (!$info) return false;
    [$w,$h]=$info;
    $img=match($info[2]){IMAGETYPE_JPEG=>imagecreatefromjpeg($src),IMAGETYPE_PNG=>imagecreatefrompng($src),IMAGETYPE_WEBP=>imagecreatefromwebp($src),IMAGETYPE_GIF=>imagecreatefromgif($src),default=>null};
    if (!$img) return false;
    $ratio=min($mw/$w,$mh/$h,1.0); $nw=(int)round($w*$ratio); $nh=(int)round($h*$ratio);
    $out=imagecreatetruecolor($nw,$nh); imagealphablending($out,false); imagesavealpha($out,true);
    imagefill($out,0,0,imagecolorallocatealpha($out,255,255,255,0));
    imagecopyresampled($out,$img,0,0,0,0,$nw,$nh,$w,$h);
    $ok=function_exists('imagewebp')?imagewebp($out,$dst,82):imagejpeg($out,$dst,85);
    imagedestroy($img); imagedestroy($out); return $ok;
}

// ── USERS ─────────────────────────────────────────────────────
function getUsers(): void {
    $s=auth(); $isAdmin=$s['urole']==='admin';
    if ($isAdmin) $r=db()->query('SELECT id,wwcode,name,role,dept,dept_key,branch,branch_name,email,urole,color,avatar_url FROM tf_users ORDER BY id');
    else { $r=db()->prepare('SELECT id,wwcode,name,role,dept,dept_key,branch,branch_name,email,urole,color,avatar_url FROM tf_users WHERE branch=? ORDER BY id'); $r->execute([$s['branch']]); }
    ok(['users'=>$r->fetchAll()]);
}
function userSave(): void {
    $s=auth(); if (!in_array($s['urole'],['admin','manager'])) err('Forbidden',403);
    $b=json_decode(file_get_contents('php://input'),true)??[]; $id=(int)($b['id']??0);
    if ($id) { db()->prepare('UPDATE tf_users SET name=?,role=?,dept=?,email=?,urole=?,color=? WHERE id=?')->execute([$b['name'],$b['role']??'',$b['dept']??'',$b['email']??'',$b['urole']??'user',(int)($b['color']??0),$id]); ok(['msg'=>'Updated','id'=>$id]); }
    else { db()->prepare('INSERT INTO tf_users (wwcode,name,role,dept,email,urole,color,branch,branch_name) VALUES (?,?,?,?,?,?,?,?,?)')->execute([$b['wwcode']??'u'.time(),$b['name'],$b['role']??'',$b['dept']??'',$b['email']??'',$b['urole']??'user',(int)($b['color']??0),$s['branch']??'','']); ok(['msg'=>'Created','id'=>(int)db()->lastInsertId()],201); }
}
function userDelete(): void {
    $s=auth(); if ($s['urole']!=='admin') err('Forbidden',403);
    $b=json_decode(file_get_contents('php://input'),true)??[]; $id=(int)($b['id']??0);
    if (!$id||$id===$s['id']) err('Invalid');
    db()->prepare('DELETE FROM tf_users WHERE id=?')->execute([$id]); ok();
}

// ── TASKS ─────────────────────────────────────────────────────
function getTasks(): void {
    $s=auth(); $branch=$s['urole']==='admin'?null:($s['branch']??null);
    $where=$branch?'WHERE t.branch=?':''; $params=$branch?[$branch]:[];
    $st=db()->prepare("SELECT t.*,u.name AS creator_name,GROUP_CONCAT(DISTINCT ta.user_id ORDER BY ta.user_id) AS asgn_ids FROM tf_tasks t LEFT JOIN tf_users u ON u.id=t.created_by LEFT JOIN tf_task_assignees ta ON ta.task_id=t.id $where GROUP BY t.id ORDER BY t.created_at DESC");
    $st->execute($params); $tasks=$st->fetchAll();
    foreach ($tasks as &$t) {
        $t['id']=(int)$t['id']; $t['asgn']=$t['asgn_ids']?array_map('intval',explode(',',$t['asgn_ids'])):[];
        $t['tags']=json_decode($t['tags']??'[]',true)??[]; $t['ackBy']=json_decode($t['ack_by']??'[]',true)??[];
        $t['prog']=(int)$t['prog']; unset($t['asgn_ids'],$t['ack_by']); $tid=$t['id'];
        $s2=db()->prepare('SELECT id,label,sort_order FROM tf_task_steps WHERE task_id=? ORDER BY sort_order'); $s2->execute([$tid]); $t['steps']=$s2->fetchAll();
        $s3=db()->prepare('SELECT step_id,user_id,is_done,checked_at FROM tf_step_checks WHERE task_id=?'); $s3->execute([$tid]); $chk=[];
        foreach($s3->fetchAll() as $c) $chk[$c['user_id']][$c['step_id']]=['done'=>(bool)$c['is_done'],'at'=>$c['checked_at']];
        $t['stepChecks']=$chk;
        $s4=db()->prepare('SELECT id,file_name,file_size,file_type,file_url FROM tf_attachments WHERE task_id=? AND is_submitted=0'); $s4->execute([$tid]); $t['attachments']=$s4->fetchAll();
        $s5=db()->prepare('SELECT id,file_name,file_size,file_type,file_url FROM tf_attachments WHERE task_id=? AND is_submitted=1'); $s5->execute([$tid]); $t['submittedFiles']=$s5->fetchAll();
        $s6=db()->prepare('SELECT * FROM tf_obstacles WHERE task_id=? ORDER BY created_at'); $s6->execute([$tid]); $obs=$s6->fetchAll();
        foreach($obs as &$o){$s7=db()->prepare('SELECT id,author_id AS authorId,body AS text,created_at AS at FROM tf_comments WHERE obstacle_id=?');$s7->execute([$o['id']]);$o['comments']=$s7->fetchAll();}
        $t['obstacles']=$obs;
        $s8=db()->prepare('SELECT id,author_id AS authorId,body AS text,created_at AS at FROM tf_comments WHERE task_id=? AND obstacle_id IS NULL ORDER BY created_at'); $s8->execute([$tid]); $t['comments']=$s8->fetchAll();
    }
    ok(['tasks'=>$tasks]);
}
function taskSave(): void {
    $s=auth(); $b=json_decode(file_get_contents('php://input'),true)??[]; $db=db(); $id=(int)($b['id']??0);
    if ($id) $db->prepare('UPDATE tf_tasks SET title=?,description=?,col=?,priority=?,due_date=?,dept_key=?,tags=?,ack_by=? WHERE id=?')->execute([$b['title'],$b['desc']??'',$b['col']??'todo',$b['priority']??'normal',$b['date']??null,$b['dept_key']??'',json_encode($b['tags']??[]),json_encode($b['ackBy']??[]),$id]);
    else { $db->prepare('INSERT INTO tf_tasks (title,description,col,priority,due_date,branch,dept_key,tags,created_by,ack_by) VALUES (?,?,?,?,?,?,?,?,?,?)')->execute([$b['title'],$b['desc']??'',$b['col']??'todo',$b['priority']??'normal',$b['date']??null,$b['branch']??$s['branch'],$b['dept_key']??'',json_encode($b['tags']??[]),$s['id'],json_encode([])]); $id=(int)$db->lastInsertId();
      $stSt=$db->prepare('INSERT INTO tf_task_steps (task_id,label,sort_order) VALUES (?,?,?)');
      foreach(($b['steps']??[]) as $i=>$st2) $stSt->execute([$id,$st2['label']??$st2,$i]); }
    if (isset($b['asgn'])) {
        $db->prepare('DELETE FROM tf_task_assignees WHERE task_id=?')->execute([$id]);
        $sa=$db->prepare('INSERT IGNORE INTO tf_task_assignees (task_id,user_id) VALUES (?,?)');
        foreach($b['asgn'] as $uid) $sa->execute([$id,(int)$uid]);
        if (!($b['id']??0)) {
            $cn=$db->prepare('SELECT name FROM tf_users WHERE id=?'); $cn->execute([$s['id']]); $cname=$cn->fetchColumn();
            $sn=$db->prepare('INSERT INTO tf_notifications (type,title,body,task_id,for_user_id) VALUES (?,?,?,?,?)');
            foreach($b['asgn'] as $uid) { if ((int)$uid===$s['id']) continue; $sn->execute(['new_task','🔔 งานใหม่ถูกมอบหมาย','"'.$b['title'].'" โดย '.$cname,$id,(int)$uid]); }
        }
    }
    ok(['task_id'=>$id]);
}
function taskDelete(): void { $s=auth(); $b=json_decode(file_get_contents('php://input'),true)??[]; db()->prepare('DELETE FROM tf_tasks WHERE id=?')->execute([(int)($b['id']??0)]); ok(); }
function taskCol(): void { $s=auth(); $b=json_decode(file_get_contents('php://input'),true)??[]; db()->prepare('UPDATE tf_tasks SET col=? WHERE id=?')->execute([$b['col']??'todo',(int)($b['id']??0)]); ok(); }
function taskProgress(): void { $s=auth(); $b=json_decode(file_get_contents('php://input'),true)??[]; $id=(int)($b['task_id']??0); $p=max(0,min(100,(int)($b['prog']??0))); if(!$id)err('Missing id'); $db=db(); $db->prepare('UPDATE tf_tasks SET prog=? WHERE id=?')->execute([$p,$id]); $db->prepare('INSERT INTO tf_progress_log (task_id,user_id,prog,note) VALUES (?,?,?,?)')->execute([$id,$s['id'],$p,$b['note']??'']); ok(); }
function taskSubmit(): void { $s=auth(); $b=json_decode(file_get_contents('php://input'),true)??[]; $id=(int)($b['task_id']??0); if(!$id)err('Missing'); $db=db(); $db->prepare("UPDATE tf_tasks SET col='review',prog=100,submit_note=? WHERE id=?")->execute([$b['note']??'',$id]); $t=$db->prepare('SELECT title FROM tf_tasks WHERE id=?'); $t->execute([$id]); $title=$t->fetchColumn(); $mgrs=$db->query("SELECT id FROM tf_users WHERE urole IN ('admin','manager')")->fetchAll(); $sn=$db->prepare('INSERT INTO tf_notifications (type,title,body,task_id,for_user_id) VALUES (?,?,?,?,?)'); foreach($mgrs as $m) $sn->execute(['work_submitted','📤 มีการส่งงาน','"'.$title.'" ส่งโดย '.$s['name'],$id,$m['id']]); ok(); }
function taskVerify(): void { $s=auth(); if(!in_array($s['urole'],['admin','manager']))err('Forbidden',403); $b=json_decode(file_get_contents('php://input'),true)??[]; $id=(int)($b['task_id']??0); $act=$b['action']??'approve'; $db=db(); $db->prepare('UPDATE tf_tasks SET col=?,verified_by=? WHERE id=?')->execute([$act==='approve'?'verified':'doing',$act==='approve'?$s['id']:null,$id]); $t=$db->prepare('SELECT title FROM tf_tasks WHERE id=?'); $t->execute([$id]); $title=$t->fetchColumn(); $asgn=$db->prepare('SELECT user_id FROM tf_task_assignees WHERE task_id=?'); $asgn->execute([$id]); $sn=$db->prepare('INSERT INTO tf_notifications (type,title,body,task_id,for_user_id) VALUES (?,?,?,?,?)'); foreach($asgn->fetchAll() as $a){ if($act==='approve')$sn->execute(['verified','✅ ผ่านตรวจสอบ','"'.$title.'"',$id,$a['user_id']]); else $sn->execute(['return_task','↩️ ส่งกลับแก้ไข','"'.$title.'"',$id,$a['user_id']]); } ok(); }
function stepToggle(): void { $s=auth(); $b=json_decode(file_get_contents('php://input'),true)??[]; db()->prepare('INSERT INTO tf_step_checks (step_id,user_id,task_id,is_done,checked_at) VALUES (?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE is_done=?,checked_at=NOW()')->execute([(int)($b['step_id']??0),$s['id'],(int)($b['task_id']??0),(bool)($b['done']??false)?1:0,(bool)($b['done']??false)?1:0]); ok(); }

// ── FILE UPLOAD ───────────────────────────────────────────────
function fileUpload(): void {
    $s=auth(); if(empty($_FILES['file']))err('No file'); $f=$_FILES['file'];
    if($f['error']!==UPLOAD_ERR_OK)err('Upload error'); if($f['size']>MAX_FILE_MB*1024*1024)err('Too large');
    $tid=(int)($_POST['task_id']??0); $isSub=(int)($_POST['is_submitted']??0); if(!$tid)err('Missing task_id');
    $ext=pathinfo($f['name'],PATHINFO_EXTENSION)?:'bin'; $name='t'.$tid.'_'.time().'_'.bin2hex(random_bytes(3)).'.'.$ext;
    if(!move_uploaded_file($f['tmp_name'],TASK_DIR.'/'.$name))err('Save failed'); $url=TASK_URL.$name;
    $sz=_sz($f['size']); $db=db(); $db->prepare('INSERT INTO tf_attachments (task_id,is_submitted,file_name,file_size,file_type,file_path,file_url,uploaded_by) VALUES (?,?,?,?,?,?,?,?)')->execute([$tid,$isSub,$f['name'],$sz,$ext,'tasks/'.$name,$url,$s['id']]);
    ok(['file_id'=>(int)$db->lastInsertId(),'file_name'=>$f['name'],'file_url'=>$url,'file_size'=>$sz],201);
}
function _sz(int $b): string { if($b<1024)return $b.'B'; if($b<1048576)return round($b/1024).'KB'; return number_format($b/1048576,1).'MB'; }

// ── NOTIFICATIONS ─────────────────────────────────────────────
function getNotifs(): void {
    $s=auth(); $st=db()->prepare('SELECT n.*,t.title AS task_title FROM tf_notifications n LEFT JOIN tf_tasks t ON t.id=n.task_id WHERE n.for_user_id=? ORDER BY n.created_at DESC LIMIT 50'); $st->execute([$s['id']]); $notifs=$st->fetchAll();
    db()->prepare('UPDATE tf_notifications SET is_read=1 WHERE for_user_id=? AND is_read=0')->execute([$s['id']]);
    ok(['notifications'=>$notifs]);
}
function notifRead():  void { $s=auth(); db()->prepare('UPDATE tf_notifications SET is_read=1 WHERE for_user_id=?')->execute([$s['id']]); ok(); }
function notifAck():   void { $s=auth(); $b=json_decode(file_get_contents('php://input'),true)??[]; db()->prepare('UPDATE tf_notifications SET is_acked=1,is_read=1 WHERE id=? AND for_user_id=?')->execute([(int)($b['id']??0),$s['id']]); ok(); }
function notifClear(): void { $s=auth(); db()->prepare('DELETE FROM tf_notifications WHERE for_user_id=?')->execute([$s['id']]); ok(); }

// ── OBSTACLES + COMMENTS ──────────────────────────────────────
function obstacleAdd(): void { $s=auth(); $b=json_decode(file_get_contents('php://input'),true)??[]; if(empty($b['task_id'])||empty($b['title']))err('Missing'); $db=db(); $db->prepare('INSERT INTO tf_obstacles (task_id,title,description,level,author_id) VALUES (?,?,?,?,?)')->execute([(int)$b['task_id'],$b['title'],$b['desc']??'',$b['level']??'med',$s['id']]); ok(['id'=>(int)$db->lastInsertId()],201); }
function obstacleResolve(): void { $s=auth(); $b=json_decode(file_get_contents('php://input'),true)??[]; db()->prepare('UPDATE tf_obstacles SET resolved=1,resolved_at=NOW() WHERE id=?')->execute([(int)($b['id']??0)]); ok(); }
function commentAdd(): void { $s=auth(); $b=json_decode(file_get_contents('php://input'),true)??[]; if(empty($b['task_id'])||empty($b['text']))err('Missing'); $db=db(); $db->prepare('INSERT INTO tf_comments (task_id,obstacle_id,author_id,body) VALUES (?,?,?,?)')->execute([(int)$b['task_id'],$b['obstacle_id']??null,$s['id'],trim($b['text'])]); ok(['id'=>(int)$db->lastInsertId()],201); }

// ── TAGS ──────────────────────────────────────────────────────
function getTags(): void {
    auth(); // ต้อง login
    $st=db()->query('SELECT name FROM tf_tags ORDER BY id');
    ok(['tags'=>array_column($st->fetchAll(),'name')]);
}
function tagSave(): void {
    $s=auth();
    $b=json_decode(file_get_contents('php://input'),true)??[];
    $name=trim($b['name']??'');
    if(!$name) err('Missing name');
    db()->prepare('INSERT IGNORE INTO tf_tags (name) VALUES (?)')->execute([$name]);
    ok(['name'=>$name]);
}
function tagDelete(): void {
    $s=auth(); if(!in_array($s['urole'],['admin','manager'])) err('Forbidden',403);
    $b=json_decode(file_get_contents('php://input'),true)??[];
    $name=trim($b['name']??'');
    if(!$name) err('Missing name');
    db()->prepare('DELETE FROM tf_tags WHERE name=?')->execute([$name]);
    ok();
}
