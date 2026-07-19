/**
 * js/sync.js — TaskFlow Pro v5 · API Connector Layer
 * ─────────────────────────────────────────────────────────────
 * โหลดหลัง index_PRODUCTION_FINAL.php (script tag ท้ายสุด)
 * ทำหน้าที่:
 *   1. เพิ่ม helper สำหรับเรียก PHP API พร้อม token
 *   2. Override functions สำคัญให้บันทึกข้อมูลผ่าน API จริง
 *   3. โหลดข้อมูล tasks/users/tags/notifications จาก server หลัง login
 *   4. Poll notifications ทุก 30 วินาที
 *
 * ⚠ ไม่แตะ UI เดิม — เปลี่ยนเฉพาะ "ตอนบันทึก" ให้เรียก API
 */

// ══════════════════════════════════════════════════════════════
// 1. API HELPERS
// ══════════════════════════════════════════════════════════════

/** เก็บ session token หลัง login */
window._apiToken = null;

/** true ถ้ารันบน PHP server จริง (ไม่ใช่ file:// หรือ Live Server) */
const _isPhpSrv = () =>
  window.location.protocol !== 'file:' &&
  !window.location.port.match(/^5[0-9]{3}$|^3000$|^8080$|^4200$/);

/**
 * เรียก PHP API
 * @param {string} action  - ชื่อ action ใน api.php
 * @param {object|FormData} body - ข้อมูลที่ส่ง (POST) หรือ {} (GET)
 * @param {string} method  - 'GET' | 'POST'
 */
async function _api(action, body = {}, method = 'POST') {
  if (!_isPhpSrv()) return { ok: false, _offline: true };
  const tok = window._apiToken || (() => {
    try { return localStorage.getItem('tf_tok') || ''; } catch (_) { return ''; }
  })();
  const opts = { method, headers: { 'X-Token': tok } };
  if (method !== 'GET') {
    if (body instanceof FormData) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  try {
    const r = await fetch(`php/api.php?action=${action}`, opts);
    return await r.json().catch(() => ({ ok: false }));
  } catch (e) {
    return { ok: false, _err: String(e) };
  }
}

// ══════════════════════════════════════════════════════════════
// 2. DATA NORMALISATION — แปลง DB row เป็น JS object format เดิม
// ══════════════════════════════════════════════════════════════
function _normTask(t) {
  let asgn = t.asgn || [];
  if (typeof asgn === 'string') asgn = asgn ? asgn.split(',').map(Number) : [];
  let tags = t.tags || [];
  if (typeof tags === 'string') { try { tags = JSON.parse(tags) || []; } catch (_) { tags = []; } }
  let ackBy = t.ackBy || t.ack_by || [];
  if (typeof ackBy === 'string') { try { ackBy = JSON.parse(ackBy) || []; } catch (_) { ackBy = []; } }
  // stepChecks จาก API มาเป็น {userId: {stepId: {done,at}}}
  const sc = t.stepChecks || {};
  // แปลง key จาก string → number
  const stepChecks = {};
  for (const [uid, steps] of Object.entries(sc)) {
    stepChecks[+uid] = {};
    for (const [sid, v] of Object.entries(steps)) {
      stepChecks[+uid][+sid] = { done: !!v.done, at: v.at || null };
    }
  }
  return {
    id: +t.id,
    title: t.title || '',
    desc: t.description || t.desc || '',
    col: t.col || 'todo',
    tags,
    asgn,
    date: t.due_date || t.date || '',
    prog: +(t.prog || 0),
    priority: t.priority || 'normal',
    branch: t.branch || '',
    dept_key: t.dept_key || '',
    steps: (t.steps || []).map(s => ({ id: +s.id, label: s.label || '' })),
    stepChecks,
    attachments: (t.attachments || []).map(f => ({
      name: f.file_name || f.name || '',
      size: f.file_size || f.size || '',
      type: f.file_type || f.type || '',
      url: f.file_url || f.url || null,
      data: null
    })),
    submittedFiles: (t.submittedFiles || []).map(f => ({
      name: f.file_name || f.name || '',
      size: f.file_size || f.size || '',
      type: f.file_type || f.type || '',
      url: f.file_url || f.url || null,
      data: null
    })),
    submitNote: t.submit_note || t.submitNote || '',
    obstacles: (t.obstacles || []).map(o => ({
      id: +o.id, title: o.title || '', desc: o.description || o.desc || '',
      level: o.level || 'med', authorId: +(o.author_id || o.authorId || 0),
      resolved: !!o.resolved, at: o.created_at || o.at || '',
      comments: (o.comments || []).map(c => ({
        id: +c.id, authorId: +(c.authorId || c.author_id || 0),
        text: c.text || c.body || '', at: c.at || c.created_at || ''
      }))
    })),
    comments: (t.comments || []).map(c => ({
      id: +c.id, authorId: +(c.authorId || c.author_id || 0),
      text: c.text || c.body || '', at: c.at || c.created_at || ''
    })),
    progressLog: t.progressLog || [],
    createdBy: +(t.created_by || t.createdBy || 0),
    ackBy,
    verifiedBy: t.verified_by ? +t.verified_by : (t.verifiedBy || null),
  };
}

// ══════════════════════════════════════════════════════════════
// 3. LOAD FROM SERVER — โหลด tasks, users, tags หลัง login
// ══════════════════════════════════════════════════════════════
async function _loadFromServer(silent = false) {
  if (!_isPhpSrv()) return;
  try {
    const [uRes, tRes, tagRes] = await Promise.all([
      _api('users', {}, 'GET'),
      _api('tasks', {}, 'GET'),
      _api('tags', {}, 'GET'),
    ]);
    if (uRes.ok && Array.isArray(uRes.users)) {
      window.users = uRes.users.map(u => ({
        ...u,
        id: +u.id,
        color: +(u.color || 0),
        avatar: u.avatar_url || '',
        telegram_chat_id: u.telegram_chat_id || '',
        line_id: u.line_id || u.lineId || u.idline || '',
        pass: '',
      }));
    }
    if (tRes.ok && Array.isArray(tRes.tasks)) {
      window.tasks = tRes.tasks.map(_normTask);
    }
    if (tagRes.ok && Array.isArray(tagRes.tags)) {
      window.allTags = tagRes.tags;
    }
    if (!silent) { renderAll(); renderBell(); }
  } catch (e) {
    console.warn('[sync] _loadFromServer error:', e);
  }
}

// ══════════════════════════════════════════════════════════════
// 4. NOTIFICATIONS — โหลดและ poll
// ══════════════════════════════════════════════════════════════
async function _loadNotifs() {
  if (!_isPhpSrv() || !window.currentUser) return;
  try {
    const r = await _api('notifications', {}, 'GET');
    if (!r.ok || !Array.isArray(r.notifications)) return;
    window.notifications = r.notifications.map(n => ({
      id: +n.id,
      type: n.type,
      title: n.title || '',
      body: n.body || '',
      taskId: n.task_id ? +n.task_id : null,
      forUserIds: [+(n.for_user_id || 0)],
      read: !!n.is_read,
      ackBy: n.is_acked ? [window.currentUser.id] : [],
    }));
    renderBell();
    if (typeof renderNotifDrop === 'function') renderNotifDrop();
    if (typeof renderHomeNotifs === 'function') renderHomeNotifs();
  } catch (e) { /* silent */ }
}

// ══════════════════════════════════════════════════════════════
// 5. PATCH _afterLogin — โหลดข้อมูลจาก server หลัง login
// ══════════════════════════════════════════════════════════════
const _orig_afterLogin = window._afterLogin;
window._afterLogin = function () {
  _orig_afterLogin.call(this);
  if (_isPhpSrv()) {
    _loadFromServer(false).then(() => {
      renderAll(); renderBell();
    });
    _loadNotifs();
    // Poll notification ทุก 30 วินาที
    if (window._notifTimer) clearInterval(window._notifTimer);
    window._notifTimer = setInterval(() => {
      if (window.currentUser) _loadNotifs();
    }, 30000);
  }
};

// ══════════════════════════════════════════════════════════════
// 6. PATCH doLocalLogin — เก็บ token จาก API
// ══════════════════════════════════════════════════════════════
const _orig_doLocalLogin = window.doLocalLogin;
window.doLocalLogin = async function () {
  if (!_isPhpSrv()) { _orig_doLocalLogin.call(this); return; }
  const input = gi('l-local-user').value.trim();
  const pass = gi('l-local-pass').value;
  gi('lerr').style.display = 'none';
  if (!input || !pass) { showLoginErr('กรุณากรอก username และรหัสผ่าน'); return; }

  gi('login-form').style.display = 'none';
  gi('login-loading').style.display = 'block';
  gi('login-loading-txt').textContent = 'กำลังตรวจสอบ...';

  // ลอง API ก่อน
  try {
    const apiRes = await fetch('php/api.php?action=local_login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: input, password: pass }),
      signal: AbortSignal.timeout(5000),
    });
    if (apiRes.ok) {
      const apiData = await apiRes.json().catch(() => null);
      if (apiData?.ok && apiData.token) {
        // บันทึก token
        window._apiToken = apiData.token;
        try { localStorage.setItem('tf_tok', apiData.token); } catch (_) {}

        // sync user object เข้า users array
        const ad = apiData.user;
        let u = window.users.find(x => x.wwcode === ad.wwcode || +x.id === +ad.id);
        if (!u) {
          u = {
            id: +ad.id, wwcode: ad.wwcode, name: ad.name, role: ad.role || '',
            dept: ad.dept || '', dept_key: ad.dept_key || '',
            branch: ad.branch || '', branch_name: ad.branch_name || '',
            email: ad.email || '', urole: ad.urole || 'user',
            color: +(ad.color || 0), avatar: ad.avatar_url || '', telegram_chat_id: ad.telegram_chat_id || '', line_id: ad.line_id || '', pass: '',
          };
          window.users.push(u);
        } else {
          Object.assign(u, {
            id: +ad.id, name: ad.name, urole: ad.urole || u.urole,
            avatar: ad.avatar_url || u.avatar,
            telegram_chat_id: ad.telegram_chat_id || u.telegram_chat_id || '',
            line_id: ad.line_id || u.line_id || '',
            branch: ad.branch || u.branch, branch_name: ad.branch_name || u.branch_name,
            dept: ad.dept || u.dept, dept_key: ad.dept_key || u.dept_key,
          });
        }

        gi('login-loading').style.display = 'none';
        gi('login-form').style.display = 'block';
        if (typeof _loadAvatarFromLS === 'function') _loadAvatarFromLS(u);
        window.currentUser = u;
        _afterLogin();
        toast('ยินดีต้อนรับ ' + u.name + ' 👋');
        return;
      } else if (apiData && !apiData.ok) {
        // API ตอบ error ชัดเจน (เช่น รหัสผ่านผิด)
        gi('login-loading').style.display = 'none';
        gi('login-form').style.display = 'block';
        showLoginErr(apiData.error || 'รหัสผ่านไม่ถูกต้อง');
        return;
      }
    }
  } catch (_) {
    // timeout / network error → fallback ไป local
  }

  // Fallback: local JS auth (ไม่มี PHP / รหัสยังไม่ได้ตั้ง)
  gi('login-loading').style.display = 'none';
  gi('login-form').style.display = 'block';
  _orig_doLocalLogin.call(this);
};

// ══════════════════════════════════════════════════════════════
// 7. PATCH doLogout — เรียก API logout + clear timer
// ══════════════════════════════════════════════════════════════
const _orig_doLogout = window.doLogout;
window.doLogout = function () {
  if (_isPhpSrv() && window._apiToken) {
    _api('logout').catch(() => {});
  }
  window._apiToken = null;
  try { localStorage.removeItem('tf_tok'); } catch (_) {}
  if (window._notifTimer) { clearInterval(window._notifTimer); window._notifTimer = null; }
  _orig_doLogout.call(this);
};

// ══════════════════════════════════════════════════════════════
// 8. PATCH submitTask — บันทึกงานผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_submitTask = window.submitTask;
window.submitTask = function () {
  const title = gi('t-title').value.trim();
  if (!title) { toast('กรุณาระบุชื่องาน'); return; }
  if (!window.selAsgn || !window.selAsgn.length) { toast('กรุณาเลือกผู้รับมอบหมายอย่างน้อย 1 คน'); return; }
  const idVal = gi('t-id').value;
  const isEdit = !!idVal;
  const pendingFiles = (window.taskPendingFiles || []).filter(f => f && f.data && !f.url);

  // เรียก original ก่อน (อัปเดต local state + UI)
  _orig_submitTask.call(this);

  const taskTags = [...new Set((window.selTags || []).map(t => String(t || '').trim()).filter(Boolean))];
  if (Array.isArray(window.allTags)) {
    let addedTag = false;
    taskTags.forEach(tag => {
      if (!window.allTags.includes(tag)) { window.allTags.push(tag); addedTag = true; }
    });
    if (addedTag && typeof renderTagsPage === 'function') renderTagsPage();
  }

  if (!_isPhpSrv()) return;

  // เก็บข้อมูลที่ต้องส่งก่อน original เคลียร์ form
  const payload = {
    id: isEdit ? +idVal : 0,
    title,
    desc: gi('t-desc') ? gi('t-desc').value : '',
    col: window._defaultCol || 'todo',
    date: gi('t-date') ? gi('t-date').value : '',
    priority: gi('t-priority') ? gi('t-priority').value : 'normal',
    tags: taskTags,
    asgn: window.selAsgn ? [...window.selAsgn] : [],
    branch: (gi('t-branch') ? gi('t-branch').value : '') || window.currentUser?.branch || '',
    dept_key: gi('t-dept') ? gi('t-dept').value : '',
    steps: (window.pendingStepsList || []).map((label, i) => ({ label, sort_order: i })),
  };
  if (!payload.title) return;

  Promise.all(taskTags.map(name => _saveTagToServer(name).catch(() => null)))
    .then(() => _api('task_save', payload))
    .then(async r => {
    if (!r.ok) {
      if (typeof toast === 'function') toast(r.error || 'บันทึกงานขึ้น Supabase ไม่สำเร็จ');
      _loadFromServer(true).then(() => {
        if (typeof renderAll === 'function') renderAll();
      });
      return;
    }
    const savedId = Number(r.task_id || payload.id || idVal || 0);
    if (r.ok && savedId && !isEdit) {
      // อัปเดต ID ท้องถิ่นให้ตรงกับ server
      const t = window.tasks[window.tasks.length - 1];
      if (t && (!t.id || t.id >= 400)) t.id = savedId;
    }
    if (r.ok && savedId && pendingFiles.length) {
      await _uploadPendingFiles(savedId, pendingFiles, 0);
    }
    // reload เพื่อให้ steps/attachments ถูกต้อง และให้ URL ดาวน์โหลดจาก Supabase กลับมาแสดง
    _loadFromServer(true).then(() => renderAll());
  });
};

// ══════════════════════════════════════════════════════════════
// 9. PATCH delTask — ลบผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_delTask = window.delTask;
window.delTask = function (id) {
  if (!confirm('ลบงาน?')) return;
  window.tasks = window.tasks.filter(t => t.id !== id);
  closeDP(); renderAll(); toast('ลบงานแล้ว');
  if (_isPhpSrv()) _api('task_delete', { id });
};

// ══════════════════════════════════════════════════════════════
// 10. PATCH handleBoardAction — ย้าย column ผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_handleBoardAction = window.handleBoardAction;
window.handleBoardAction = function (id, val) {
  _orig_handleBoardAction.call(this, id, val);
  if (!_isPhpSrv() || !val || val === '__edit' || val === '__del') return;
  // ส่ง task_verify สำหรับ review→done/verified, task_col สำหรับที่เหลือ
  const t = window.tasks.find(t => t.id === id);
  if (!t) return;
  if ((val === 'done' || val === 'verified') && isAM && isAM()) {
    _api('task_verify', { task_id: id, action: val === 'verified' ? 'approve' : 'approve' });
  }
  _api('task_col', { id, col: val });
};

// ══════════════════════════════════════════════════════════════
// 11. PATCH submitProg — บันทึก progress ผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_submitProg = window.submitProg;
window.submitProg = async function () {
  const tid = parseInt(gi('prog-task-id').value);
  const prog = parseInt(gi('prog-slider').value);
  const note = gi('prog-note') ? gi('prog-note').value.trim() : '';
  const progressFiles = gi('prog-files') ? Array.from(gi('prog-files').files || []) : [];
  _orig_submitProg.call(this);
  if (!_isPhpSrv()) return;
  const progressIsFinal = prog >= 100;
  await _api('task_progress', { task_id: tid, prog, note });

  // แนบรูป/ไฟล์ประกอบการอัปเดตความคืบหน้า เก็บใน Supabase Storage + tf_attachments
  // ถ้าความคืบหน้าเป็น 100% ให้ถือเป็นหลักฐานส่งงานด้วย
  for (const file of progressFiles) {
    try {
      const fd = new FormData();
      fd.append('task_id', tid);
      fd.append('is_submitted', progressIsFinal ? '1' : '0');
      fd.append('file', file, file.name || 'progress-file');
      await _api('file_upload', fd);
    } catch (e) {
      console.warn('[sync.js] progress file upload failed', e);
      if (typeof toast === 'function') toast('อัปโหลดไฟล์บางรายการไม่สำเร็จ');
    }
  }
  await _loadFromServer(true);
  if (typeof renderAll === 'function') renderAll();
  setTimeout(() => { if (typeof showDP === 'function') showDP(tid); }, 120);
  if (progressFiles.length && typeof toast === 'function') toast(`อัปโหลดไฟล์แนบ ${progressFiles.length} รายการแล้ว`);
};

// ══════════════════════════════════════════════════════════════
// 12. PATCH submitWork — ส่งงานผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_submitWork = window.submitWork;
window.submitWork = async function () {
  const tid = parseInt(gi('sw-task-id').value);
  const note = gi('sw-note') ? gi('sw-note').value.trim() : '';
  const files = window.swPendingFiles || [];

  if (!files.length && !note) { toast('กรุณาแนบไฟล์หรือเขียนหมายเหตุก่อนส่ง'); return; }

  _orig_submitWork.call(this);

  if (!_isPhpSrv()) return;

  // ส่ง task_submit
  await _api('task_submit', { task_id: tid, note });

  // อัปโหลดไฟล์แนบ (ถ้ามีไฟล์ที่มี data จริง)
  for (const f of files) {
    if (!f.data) continue; // ไฟล์เดิมจาก server ข้ามไป
    const fd = new FormData();
    fd.append('task_id', tid);
    fd.append('is_submitted', '1');
    // แปลง base64 → Blob
    const blob = await fetch(f.data).then(r => r.blob()).catch(() => null);
    if (blob) fd.append('file', blob, f.name || 'file');
    await _api('file_upload', fd);
  }
  _loadFromServer(true).then(() => {
    if (typeof renderAll === 'function') renderAll();
    setTimeout(() => { if (typeof showDP === 'function') showDP(tid); }, 120);
  });
};

// ══════════════════════════════════════════════════════════════
// 13. PATCH toggleStep — tick checklist ผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_toggleStep = window.toggleStep;
window.toggleStep = function (tid, uid, stepId) {
  _orig_toggleStep.call(this, tid, uid, stepId);
  if (!_isPhpSrv()) return;
  const t = window.tasks.find(t => t.id === tid);
  const done = !!(t?.stepChecks?.[uid]?.[stepId]?.done);
  _api('step_toggle', { task_id: tid, step_id: stepId, done });
  // sync progress กลับ DB ด้วย
  if (t && uid === window.currentUser?.id) {
    _api('task_progress', { task_id: tid, prog: t.prog, note: 'อัปเดตจาก checklist' });
    if (t.col === 'review' || t.col === 'todo' || t.col === 'doing') {
      _api('task_col', { id: tid, col: t.col });
    }
  }
};

// ══════════════════════════════════════════════════════════════
// 14. PATCH submitObs — เพิ่มอุปสรรคผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_submitObs = window.submitObs;
window.submitObs = function () {
  const tid = parseInt(gi('obs-task-id').value);
  const title = gi('obs-title').value.trim();
  const desc = gi('obs-desc') ? gi('obs-desc').value : '';
  const level = gi('obs-level') ? gi('obs-level').value : 'med';
  _orig_submitObs.call(this);
  if (_isPhpSrv() && title) {
    _api('obstacle_add', { task_id: tid, title, desc, level }).then(r => {
      if (r.ok) _loadFromServer(true).then(() => renderAll());
    });
  }
};

// ══════════════════════════════════════════════════════════════
// 15. PATCH resolveObs — ปิดอุปสรรคผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_resolveObs = window.resolveObs;
window.resolveObs = function (tid, oid) {
  _orig_resolveObs.call(this, tid, oid);
  if (_isPhpSrv()) _api('obstacle_resolve', { id: oid });
};

// ══════════════════════════════════════════════════════════════
// 16. PATCH addComment — เพิ่มคอมเมนต์ผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_addComment = window.addComment;
window.addComment = function (tid) {
  const inp = gi('ci-' + tid);
  const text = inp ? inp.value.trim() : '';
  _orig_addComment.call(this, tid);
  if (_isPhpSrv() && text) _api('comment_add', { task_id: tid, text });
};

// ══════════════════════════════════════════════════════════════
// 17. PATCH addObsComment — เพิ่มคอมเมนต์ใต้อุปสรรคผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_addObsComment = window.addObsComment;
window.addObsComment = function (tid, oid) {
  const inp = gi('oci-' + oid);
  const text = inp ? inp.value.trim() : '';
  _orig_addObsComment.call(this, tid, oid);
  if (_isPhpSrv() && text) _api('comment_add', { task_id: tid, obstacle_id: oid, text });
};

// ══════════════════════════════════════════════════════════════
// 17.5 PATCH profile/avatar — บันทึกโปรไฟล์และรูป avatar ลง Supabase จริง
// ══════════════════════════════════════════════════════════════
const _orig_saveProfile = window.saveProfile;
window.saveProfile = async function () {
  const name = gi('p-name') ? gi('p-name').value.trim() : (window.currentUser?.name || '');
  const email = gi('p-email') ? gi('p-email').value.trim() : (window.currentUser?.email || '');
  const telegramChatId = gi('p-telegram') ? gi('p-telegram').value.trim() : (window.currentUser?.telegram_chat_id || '');
  const lineId = gi('p-line') ? gi('p-line').value.trim() : (window.currentUser?.line_id || '');
  _orig_saveProfile.call(this);
  const avatarBeforeSave = window.currentUser?.avatar || '';
  if (!_isPhpSrv() || !window.currentUser) return;

  const saved = await _api('profile_save', { name, email, telegram_chat_id: telegramChatId, line_id: lineId });
  if (!saved.ok) {
    if (typeof toast === 'function') toast('บันทึกชื่อ/อีเมลขึ้น Supabase ไม่สำเร็จ');
    return;
  }

  // ถ้าเลือก/ถ่ายรูปใหม่ ระบบเดิมเก็บเป็น data URL; แปลงเป็น Blob แล้วส่งเข้า bucket avatars
  if (avatarBeforeSave && String(avatarBeforeSave).startsWith('data:')) {
    try {
      const blob = await fetch(avatarBeforeSave).then(r => r.blob());
      const fd = new FormData();
      fd.append('file', blob, `avatar_${window.currentUser.id}.jpg`);
      const up = await _api('avatar_upload', fd);
      if (up.ok && up.avatar_url) {
        window.currentUser.avatar = up.avatar_url;
        const u = window.users.find(x => x.id === window.currentUser.id);
        if (u) u.avatar = up.avatar_url;
        if (typeof updateTopbar === 'function') updateTopbar();
        if (typeof refreshProfilePreview === 'function') refreshProfilePreview();
        if (typeof toast === 'function') toast('✅ บันทึกรูปโปรไฟล์ลง Supabase แล้ว');
      } else if (typeof toast === 'function') {
        toast('อัปโหลดรูปโปรไฟล์ขึ้น Supabase ไม่สำเร็จ');
      }
    } catch (e) {
      console.warn('[sync.js] avatar upload failed', e);
      if (typeof toast === 'function') toast('อัปโหลดรูปโปรไฟล์ขึ้น Supabase ไม่สำเร็จ');
    }
  } else {
    await _loadFromServer(true).catch(() => {});
  }
};

const _orig_removeAvatar = window.removeAvatar;
window.removeAvatar = function () {
  _orig_removeAvatar.call(this);
  if (_isPhpSrv()) _api('avatar_remove', {}).catch(() => {});
};

// ══════════════════════════════════════════════════════════════
// 18. PATCH submitMember — บันทึกสมาชิกผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_submitMember = window.submitMember;
window.submitMember = function () {
  const id = gi('m-id').value;
  const name = gi('m-name').value.trim();
  const email = gi('m-email').value.trim();
  const role = gi('m-role-txt') ? gi('m-role-txt').value : '';
  const dept = gi('m-dept') ? gi('m-dept').value : '';
  const urole = gi('m-urole') ? gi('m-urole').value : 'user';
  const pass = gi('m-pass') ? gi('m-pass').value : '';
  const telegramChatId = gi('m-telegram') ? gi('m-telegram').value.trim() : '';
  const lineId = gi('m-line') ? gi('m-line').value.trim() : '';
  _orig_submitMember.call(this);
  if (_isPhpSrv() && name && email) {
    const payload = { id: id ? +id : 0, name, email, role, dept, urole, telegram_chat_id: telegramChatId, line_id: lineId };
    if (pass) payload.new_password = pass;
    _api('member_save', payload).then(r => {
      if (r.ok) _loadFromServer(true).then(() => { renderAll(); if (typeof renderMembers === 'function') renderMembers(); });
    });
  }
};

// ══════════════════════════════════════════════════════════════
// 19. PATCH delMember — ลบสมาชิกผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_delMember = window.delMember;
window.delMember = function (id) {
  _orig_delMember.call(this, id);
  // original จะเรียก openTransferModal ถ้ามีงาน → ไม่ต้องทำอะไรเพิ่ม
  // การลบจริงเกิดหลัง transfer เสร็จ ซึ่ง sync.js จะ intercept ผ่าน submitMember ไม่ได้
  // → ยิง API delete ตรงๆ ถ้าไม่มีงาน (original จะ confirm แล้ว)
};

// override ฟังก์ชัน delete จริงๆ ที่เรียกหลัง confirm
const _orig_users_filter_del = (uid) => {
  window.users = window.users.filter(x => x.id !== uid);
};
// wrap โดยตรวจจาก delMember flow ไม่ได้ → ยิง API หลัง local delete
// (Original delMember เรียก users.filter แล้ว renderMembers)
// เราเพิ่ม MutationObserver-free approach: patch confirm
const _origConfirm = window.confirm;
window.confirm = function (msg) {
  const result = _origConfirm.call(this, msg);
  if (result && msg && msg.includes('ลบ') && msg.includes('ออกจากระบบ')) {
    // หาว่า user ไหนกำลังถูกลบจาก delMember call stack → ยาก
    // ใช้วิธีง่ายกว่า: ดูจาก users array ว่าใครหายไปหลัง confirm
    setTimeout(() => {
      const currentIds = new Set(window.users.map(u => u.id));
      if (window._preDeleteUsers) {
        for (const uid of window._preDeleteUsers) {
          if (!currentIds.has(uid) && _isPhpSrv()) {
            _api('member_delete', { id: uid });
          }
        }
      }
    }, 100);
  }
  return result;
};

// snapshot before delMember
const __orig_delMember2 = window.delMember;
window.delMember = function (id) {
  window._preDeleteUsers = window.users.map(u => u.id);
  __orig_delMember2.call(this, id);
};

// ══════════════════════════════════════════════════════════════
// 20. PATCH ackNotif — รับทราบการแจ้งเตือนผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_ackNotif = window.ackNotif;
window.ackNotif = function (nid2) {
  _orig_ackNotif.call(this, nid2);
  if (_isPhpSrv()) _api('notif_ack', { id: nid2 });
};

// ══════════════════════════════════════════════════════════════
// 21. PATCH clearAllNotifs — ล้างการแจ้งเตือนผ่าน API
// ══════════════════════════════════════════════════════════════
const _orig_clearAllNotifs = window.clearAllNotifs;
window.clearAllNotifs = function () {
  _orig_clearAllNotifs.call(this);
  if (_isPhpSrv()) _api('notif_clear');
};

// ══════════════════════════════════════════════════════════════
// 22. PATCH addGlobalTag — เพิ่ม tag ผ่าน API (แทน save_tag.php เดิม)
// ══════════════════════════════════════════════════════════════
function _saveTagToServer(name) {
  if (!_isPhpSrv()) return Promise.resolve({ ok: true, _offline: true });
  return _api('tag_save', { name });
}

function _applyTagToUi(name, inputEl, selectInTask = false) {
  if (!window.allTags.includes(name)) window.allTags.push(name);
  if (selectInTask && window.selTags && !window.selTags.includes(name)) window.selTags.push(name);
  if (inputEl) inputEl.value = '';
  if (typeof buildTagPicker === 'function') buildTagPicker();
  if (typeof renderTagsPage === 'function') renderTagsPage();
}

const _orig_addGlobalTag = window.addGlobalTag;
window.addGlobalTag = function () {
  const inp = document.getElementById('new-tag-global') || document.getElementById('ntag');
  const v = inp ? inp.value.trim() : '';
  if (!v) return;
  if (window.allTags.includes(v)) {
    if (inp && inp.id === 'ntag' && window.selTags && !window.selTags.includes(v)) {
      window.selTags.push(v);
      inp.value = '';
      if (typeof buildTagPicker === 'function') buildTagPicker();
    } else {
      toast('มีประเภทงานนี้อยู่แล้ว');
    }
    return;
  }

  const isTaskModal = inp && inp.id === 'ntag';
  _saveTagToServer(v).then(r => {
    if (r.ok) {
      _applyTagToUi(v, inp, isTaskModal);
      toast('✅ เพิ่มประเภทงาน "' + v + '" แล้ว');
    } else {
      toast('บันทึกไม่สำเร็จ: ' + (r.error || ''));
    }
  });
};

const _orig_addCustomTag = window.addCustomTag;
window.addCustomTag = function () {
  const inp = document.getElementById('ntag');
  const v = inp ? inp.value.trim() : '';
  if (!v) return;
  if (window.allTags.includes(v)) {
    if (window.selTags && !window.selTags.includes(v)) window.selTags.push(v);
    if (inp) inp.value = '';
    if (typeof buildTagPicker === 'function') buildTagPicker();
    toast('เลือกประเภทงาน "' + v + '" แล้ว');
    return;
  }

  _saveTagToServer(v).then(r => {
    if (r.ok) {
      _applyTagToUi(v, inp, true);
      toast('✅ เพิ่มและเลือกประเภทงาน "' + v + '" แล้ว');
    } else {
      // fallback เฉพาะ local/offline
      if (r._offline && typeof _orig_addCustomTag === 'function') _orig_addCustomTag.call(this);
      else toast('บันทึกประเภทงานไม่สำเร็จ: ' + (r.error || ''));
    }
  });
};

// ══════════════════════════════════════════════════════════════
// 23. PATCH tag edit/delete — จัดการประเภทงานผ่าน Supabase จริง
// ══════════════════════════════════════════════════════════════
function _cleanTagName(name) {
  return String(name || '').trim();
}

function _refreshTagScreens() {
  if (typeof buildTagPicker === 'function') buildTagPicker();
  if (typeof renderTagsPage === 'function') renderTagsPage();
  if (typeof renderAll === 'function') renderAll();
}

function _removeTagEverywhere(tag) {
  window.allTags = (window.allTags || []).filter(t => t !== tag);
  window.selTags = (window.selTags || []).filter(t => t !== tag);
  (window.tasks || []).forEach(task => {
    task.tags = (task.tags || []).filter(t => t !== tag);
  });
}

function _renameTagEverywhere(oldName, newName) {
  window.allTags = (window.allTags || []).map(t => t === oldName ? newName : t);
  window.allTags = [...new Set(window.allTags)];
  window.selTags = (window.selTags || []).map(t => t === oldName ? newName : t);
  window.selTags = [...new Set(window.selTags)];
  (window.tasks || []).forEach(task => {
    task.tags = [...new Set((task.tags || []).map(t => t === oldName ? newName : t))];
  });
}

async function _deleteTagPersist(tag) {
  if (!_isPhpSrv()) return { ok: true, _offline: true };
  return _api('tag_delete', { name: tag });
}

async function _deleteAllTagsPersist() {
  if (!_isPhpSrv()) return { ok: true, _offline: true };
  return _api('tag_delete_all', {});
}

async function _renameTagPersist(oldName, newName) {
  if (!_isPhpSrv()) return { ok: true, _offline: true };
  return _api('tag_rename', { old_name: oldName, new_name: newName });
}

function _resolveTagArg(tagOrIdx) {
  if (typeof tagOrIdx === 'number') return (window.allTags || [])[tagOrIdx] || '';
  return String(tagOrIdx || '').trim();
}

const _orig_deleteGlobalTagFromPage = window.deleteGlobalTagFromPage;
window.deleteGlobalTagFromPage = async function (tagOrIdx, rowEl) {
  const tag = _cleanTagName(_resolveTagArg(tagOrIdx));
  if (!tag) return;
  if (!confirm('ลบประเภทงาน "' + tag + '"?\n\nระบบจะลบประเภทงานนี้ออกจากงานทุกงานที่ใช้อยู่ด้วย')) return;

  if (rowEl) {
    rowEl.style.opacity = '0.45';
    rowEl.style.pointerEvents = 'none';
  }

  const r = await _deleteTagPersist(tag);
  if (!r.ok) {
    if (rowEl) {
      rowEl.style.opacity = '';
      rowEl.style.pointerEvents = '';
    }
    toast('ลบประเภทงานไม่สำเร็จ: ' + (r.error || ''));
    return;
  }

  _removeTagEverywhere(tag);
  if (rowEl && rowEl.parentNode) rowEl.remove();
  _refreshTagScreens();
  if (_isPhpSrv() && typeof _loadFromServer === 'function') {
    try { await _loadFromServer(); _refreshTagScreens(); } catch (_) {}
  }
  toast('✅ ลบประเภทงาน "' + tag + '" แล้ว' + (r.updated_tasks ? ' และอัปเดตงาน ' + r.updated_tasks + ' งาน' : ''));
};

window.deleteAllGlobalTagsFromPage = async function () {
  const count = (window.allTags || []).length;
  if (!count) {
    toast('ไม่มีประเภทงานให้ลบ');
    return;
  }
  if (!confirm('ลบประเภทงานทั้งหมด ' + count + ' รายการ?\n\nระบบจะลบประเภทงานออกจากงานทุกงานที่ใช้อยู่ด้วย แต่จะไม่ลบตัวงาน')) return;

  const r = await _deleteAllTagsPersist();
  if (!r.ok) {
    toast('ลบประเภทงานทั้งหมดไม่สำเร็จ: ' + (r.error || ''));
    return;
  }

  window.allTags = [];
  window.selTags = [];
  (window.tasks || []).forEach(task => { task.tags = []; });
  _refreshTagScreens();
  if (_isPhpSrv() && typeof _loadFromServer === 'function') {
    try { await _loadFromServer(); _refreshTagScreens(); } catch (_) {}
  }
  toast('✅ ลบประเภทงานทั้งหมดแล้ว' + (r.updated_tasks ? ' และอัปเดตงาน ' + r.updated_tasks + ' งาน' : ''));
};

const _orig_deleteGlobalTag = window.deleteGlobalTag;
window.deleteGlobalTag = async function (tagOrIdx) {
  const rawTag = (typeof tagOrIdx === 'number') ? (window.allTags || [])[tagOrIdx] : tagOrIdx;
  const tag = _cleanTagName(rawTag);
  if (!tag) return;
  if (!confirm('ลบประเภทงาน "' + tag + '"?\n\nระบบจะลบประเภทงานนี้ออกจากงานทุกงานที่ใช้อยู่ด้วย')) return;

  const r = await _deleteTagPersist(tag);
  if (!r.ok) {
    toast('ลบประเภทงานไม่สำเร็จ: ' + (r.error || ''));
    return;
  }

  _removeTagEverywhere(tag);
  _refreshTagScreens();
  toast('✅ ลบประเภทงาน "' + tag + '" แล้ว' + (r.updated_tasks ? ' และอัปเดตงาน ' + r.updated_tasks + ' งาน' : ''));
};

const _orig_startEditTag = window.startEditTag;
window.startEditTag = async function (tagOrIdx) {
  const oldName = _cleanTagName(_resolveTagArg(tagOrIdx));
  if (!oldName) return;
  const newName = _cleanTagName(prompt('แก้ไขชื่อประเภทงาน:', oldName));
  if (!newName || newName === oldName) return;
  if ((window.allTags || []).includes(newName)) {
    toast('มีชื่อนี้อยู่แล้ว');
    return;
  }

  const r = await _renameTagPersist(oldName, newName);
  if (!r.ok) {
    toast('แก้ไขประเภทงานไม่สำเร็จ: ' + (r.error || ''));
    return;
  }

  _renameTagEverywhere(oldName, newName);
  _refreshTagScreens();
  toast('✅ เปลี่ยนชื่อประเภทงานเป็น "' + newName + '" แล้ว' + (r.updated_tasks ? ' และอัปเดตงาน ' + r.updated_tasks + ' งาน' : ''));
};

// ══════════════════════════════════════════════════════════════
// 24. FILE UPLOAD helper สำหรับ task attachments
// ══════════════════════════════════════════════════════════════
async function _uploadPendingFiles(taskId, files, isSubmitted = 0) {
  if (!_isPhpSrv() || !files || !files.length) return;
  for (const f of files) {
    if (!f.data) continue; // ไฟล์เดิมจาก server ไม่มี base64
    try {
      const blob = await fetch(f.data).then(r => r.blob()).catch(() => null);
      if (!blob) continue;
      const fd = new FormData();
      fd.append('task_id', taskId);
      fd.append('is_submitted', String(isSubmitted));
      fd.append('file', blob, f.name || 'upload');
      await _api('file_upload', fd);
    } catch (_) {}
  }
}

// ══════════════════════════════════════════════════════════════
// 25. ackTask — sync ack กับ server
// ══════════════════════════════════════════════════════════════
const _orig_ackTask = window.ackTask;
window.ackTask = function (tid) {
  // หา notification ที่เกี่ยวข้องก่อนเรียกของเดิม เพราะของเดิมจะ mark ack ใน memory ทันที
  const pendingNotif = (_isPhpSrv() && window.currentUser)
    ? window.notifications.find(n => n.taskId === tid &&
      n.forUserIds.includes(window.currentUser.id) && !n.ackBy.includes(window.currentUser.id))
    : null;

  _orig_ackTask.call(this, tid);

  if (pendingNotif) _api('notif_ack', { id: pendingNotif.id });
};

console.log('[sync.js] TaskFlow API connector loaded ✓');
