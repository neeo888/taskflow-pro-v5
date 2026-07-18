export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 720);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-token,authorization',
  },
});
const ok = (data = {}, status = 200) => json({ ok: true, ...data }, status);
const err = (message, status = 400) => json({ ok: false, error: message }, status);

function needEnv() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
async function sb(path, opts = {}) {
  needEnv();
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === 'string' ? data : (data?.message || JSON.stringify(data)));
  return data;
}
async function bodyJson(req) { try { return await req.json(); } catch { return {}; } }
async function sendTelegramMessages(chatIds, text) {
  const token = String(TELEGRAM_BOT_TOKEN || '').trim();
  const ids = [...new Set((chatIds || []).map(v => String(v || '').trim()).filter(Boolean))];
  if (!token || !ids.length || !text) return { sent: 0, skipped: true };
  let sent = 0;
  for (const chatId of ids) {
    try {
      const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      const data = await tg.json().catch(() => null);
      if (tg.ok && data?.ok) sent += 1;
    } catch (_) {
      // ห้ามทำให้การบันทึกงานล้มเหลวเพราะ Telegram ส่งไม่ผ่าน
    }
  }
  return { sent, skipped: false };
}
function token64() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
function getToken(req) {
  const xt = req.headers.get('x-token');
  if (xt) return xt;
  const ah = req.headers.get('authorization') || '';
  const m = ah.match(/Bearer\s+(.+)/i);
  if (m) return m[1].trim();
  const ck = req.headers.get('cookie') || '';
  const cm = ck.match(/(?:^|;\s*)tf_tok=([^;]+)/);
  return cm ? decodeURIComponent(cm[1]) : '';
}
async function auth(req) {
  const token = getToken(req);
  if (!token) throw Object.assign(new Error('Unauthorized — กรุณาเข้าสู่ระบบ'), { status: 401 });
  const rows = await sb(`/rest/v1/tf_sessions?token=eq.${encodeURIComponent(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token,user:tf_users(id,name,urole,branch,dept_key)`, { method: 'GET' });
  const row = rows?.[0];
  if (!row?.user) throw Object.assign(new Error('Session หมดอายุ — กรุณา login ใหม่'), { status: 401 });
  return { token, id: Number(row.user.id), name: row.user.name, urole: row.user.urole, branch: row.user.branch, dept_key: row.user.dept_key };
}
async function localLogin(req) {
  const b = await bodyJson(req);
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  if (!username || !password) return err('กรุณากรอก username และรหัสผ่าน');
  const rows = await sb('/rest/v1/rpc/tf_verify_login', { method: 'POST', body: JSON.stringify({ p_username: username, p_password: password }) });
  const u = rows?.[0];
  if (!u) return err('รหัสผ่านไม่ถูกต้อง หรือไม่พบผู้ใช้', 401);
  const token = token64();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  await sb('/rest/v1/tf_sessions', { method: 'POST', body: JSON.stringify({ token, user_id: u.id, expires_at: expires }) });
  await sb(`/rest/v1/tf_users?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ last_login: new Date().toISOString() }) });
  return ok({ token, user: { id: Number(u.id), wwcode: u.wwcode, name: u.name, role: u.role, dept: u.dept, dept_key: u.dept_key, branch: u.branch, branch_name: u.branch_name, email: u.email, urole: u.urole, color: Number(u.color || 0), avatar_url: u.avatar_url || '', telegram_chat_id: u.telegram_chat_id || '' } });
}

async function registerUser(req) {
  const b = await bodyJson(req);
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const usernameRaw = String(b.username || b.wwcode || '').trim().toLowerCase();
  const password = String(b.password || b.new_password || '');
  const telegramChatId = String(b.telegram_chat_id || b.telegramChatId || '').trim();

  if (!name) return err('กรุณากรอกชื่อ-สกุล');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return err('กรุณากรอกอีเมลให้ถูกต้อง');
  if (!password || password.length < 6) return err('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');

  const wwcode = (usernameRaw || makeWwcode(email, name)).replace(/[^a-z0-9._-]/g, '').slice(0, 20) || makeWwcode(email, name);

  const byEmail = await sb(`/rest/v1/tf_users?email=eq.${encodeURIComponent(email)}&select=id,email,wwcode&limit=1`, { method: 'GET' });
  if (byEmail?.length) return err('อีเมลนี้ถูกใช้สมัครแล้ว', 409);
  const byCode = await sb(`/rest/v1/tf_users?wwcode=eq.${encodeURIComponent(wwcode)}&select=id,email,wwcode&limit=1`, { method: 'GET' });
  if (byCode?.length) return err('Username นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น', 409);

  const payload = {
    p_id: null,
    p_wwcode: wwcode,
    p_name: name,
    p_role: 'ผู้ใช้',
    p_dept: String(b.dept || 'บริการ'),
    p_dept_key: String(b.dept_key || 'บริการ'),
    p_branch: String(b.branch || '5512027'),
    p_branch_name: String(b.branch_name || 'พิษณุโลก'),
    p_email: email,
    p_urole: 'user',
    p_color: 0,
    p_telegram_chat_id: telegramChatId,
    p_new_password: password,
  };

  let user = null;
  try {
    const rows = await sb('/rest/v1/rpc/tf_member_save', { method: 'POST', body: JSON.stringify(payload) });
    user = rows?.[0] || null;
  } catch (e) {
    return err('สมัครสมาชิกไม่สำเร็จ: กรุณารัน supabase/schema.sql ล่าสุดก่อน (' + e.message + ')', 500);
  }
  if (!user?.id) return err('สมัครสมาชิกไม่สำเร็จ: ไม่ได้รับข้อมูลผู้ใช้จาก Supabase', 500);

  const token = token64();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  await sb('/rest/v1/tf_sessions', { method: 'POST', body: JSON.stringify({ token, user_id: user.id, expires_at: expires }) });
  return ok({
    token,
    user: {
      id: Number(user.id), wwcode: user.wwcode || wwcode, name: user.name || name,
      role: user.role || 'ผู้ใช้', dept: user.dept || payload.p_dept, dept_key: user.dept_key || payload.p_dept_key,
      branch: user.branch || payload.p_branch, branch_name: user.branch_name || payload.p_branch_name,
      email: user.email || email, urole: user.urole || 'user', color: Number(user.color || 0),
      avatar_url: user.avatar_url || '', telegram_chat_id: user.telegram_chat_id || telegramChatId,
    },
  }, 201);
}

async function getUsers(req) {
  const s = await auth(req);
  const q = s.urole === 'admin' ? '' : `&branch=eq.${encodeURIComponent(s.branch || '')}`;
  try {
    const rows = await sb(`/rest/v1/tf_users?select=id,wwcode,name,role,dept,dept_key,branch,branch_name,email,urole,color,avatar_url,telegram_chat_id${q}&order=id.asc`, { method: 'GET' });
    return ok({ users: rows });
  } catch (e) {
    const rows = await sb(`/rest/v1/tf_users?select=id,wwcode,name,role,dept,dept_key,branch,branch_name,email,urole,color,avatar_url${q}&order=id.asc`, { method: 'GET' });
    return ok({ users: rows.map(u => ({ ...u, telegram_chat_id: '' })), warning: 'telegram_chat_id column missing; run latest supabase/schema.sql' });
  }
}

async function profileSave(req) {
  const s = await auth(req);
  const b = await bodyJson(req);
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim();
  if (!name) return err('Missing name');
  const telegramChatId = String(b.telegram_chat_id || b.telegramChatId || '').trim();
  const payload = { name, email, telegram_chat_id: telegramChatId, updated_at: new Date().toISOString() };
  try {
    const rows = await sb(`/rest/v1/tf_users?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    let user = rows?.[0] || null;
    if (user?.id) {
      try {
        const patched = await sb(`/rest/v1/tf_users?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ telegram_chat_id: telegramChatId, updated_at: new Date().toISOString() }) });
        user = patched?.[0] || user;
      } catch (_) { user.telegram_chat_id = telegramChatId; }
    }
    return ok({ user });
  } catch (e) {
    const rows = await sb(`/rest/v1/tf_users?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ name, email, updated_at: new Date().toISOString() }) });
    return ok({ user: rows?.[0] || null, warning: 'telegram_chat_id column missing; run latest supabase/schema.sql' });
  }
}

async function avatarUpload(req) {
  const s = await auth(req);
  const fd = await req.formData();
  const file = fd.get('file');
  if (!file) return err('No avatar file');
  const mime = String(file.type || 'application/octet-stream');
  if (!mime.startsWith('image/')) return err('Avatar must be an image');
  const rawExt = (file.name || '').split('.').pop() || mime.split('/').pop() || 'jpg';
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'jpg';
  const path = `u${s.id}/avatar_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
  const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': mime, 'x-upsert': 'true' },
    body: file,
  });
  if (!upload.ok) throw new Error(await upload.text());
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
  const rows = await sb(`/rest/v1/tf_users?id=eq.${s.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ avatar_path: path, avatar_url: publicUrl, updated_at: new Date().toISOString() }),
  });
  return ok({ avatar_path: path, avatar_url: publicUrl, user: rows?.[0] || null }, 201);
}

async function avatarRemove(req) {
  const s = await auth(req);
  const rows = await sb(`/rest/v1/tf_users?id=eq.${s.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ avatar_path: '', avatar_url: '', updated_at: new Date().toISOString() }),
  });
  return ok({ user: rows?.[0] || null });
}

function makeWwcode(email = '', name = '') {
  const base = String(email || name || 'user')
    .split('@')[0]
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 14)
    .toLowerCase();
  return base || `u${Date.now().toString().slice(-8)}`;
}

async function memberSave(req) {
  const s = await auth(req);
  if (!['admin', 'manager'].includes(s.urole)) return err('Forbidden', 403);
  const b = await bodyJson(req);
  const id = Number(b.id || 0);
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim();
  if (!name || !email) return err('Missing name or email');
  const branch = s.urole === 'admin' ? String(b.branch || s.branch || '').trim() : String(s.branch || '').trim();
  const branchName = String(b.branch_name || '').trim();
  const deptKey = String(b.dept_key || b.dept || '').trim();
  const role = String(b.role || '').trim();
  const dept = String(b.dept || '').trim();
  const urole = ['admin', 'manager', 'assistant', 'user'].includes(b.urole) ? b.urole : 'user';
  const color = Number.isFinite(Number(b.color)) ? Number(b.color) : 0;
  const newPassword = String(b.new_password || b.password || '').trim();
  const telegramChatId = String(b.telegram_chat_id || b.telegramChatId || '').trim();
  const wwcode = String(b.wwcode || makeWwcode(email, name)).trim();

  // Preferred path: use SQL function so password is hashed by pgcrypto in Supabase.
  try {
    const rows = await sb('/rest/v1/rpc/tf_member_save', {
      method: 'POST',
      body: JSON.stringify({
        p_id: id || null,
        p_wwcode: wwcode,
        p_name: name,
        p_role: role,
        p_dept: dept,
        p_dept_key: deptKey,
        p_branch: branch,
        p_branch_name: branchName,
        p_email: email,
        p_urole: urole,
        p_color: color,
        p_telegram_chat_id: telegramChatId,
        p_new_password: newPassword || null,
      }),
    });
    const user = rows?.[0] || null;
    if (user && !('telegram_chat_id' in user)) user.telegram_chat_id = telegramChatId;
    return ok({ user });
  } catch (e) {
    // Fallback keeps non-password profile fields working if schema has not been updated yet.
    const payload = { name, email, role, dept, dept_key: deptKey, branch, branch_name: branchName, urole, color, telegram_chat_id: telegramChatId, updated_at: new Date().toISOString() };
    if (id) {
      const rows = await sb(`/rest/v1/tf_users?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      return ok({ user: rows?.[0] || null, warning: 'tf_member_save RPC missing; password was not changed' });
    }
    const rows = await sb('/rest/v1/tf_users', { method: 'POST', body: JSON.stringify({ ...payload, wwcode, pass_hash: '' }) });
    return ok({ user: rows?.[0] || null, warning: 'tf_member_save RPC missing; default password was not hashed' }, 201);
  }
}

async function memberDelete(req) {
  const s = await auth(req);
  if (!['admin', 'manager'].includes(s.urole)) return err('Forbidden', 403);
  const b = await bodyJson(req);
  const id = Number(b.id || b.user_id || 0);
  if (!id) return err('Missing id');
  if (id === s.id) return err('Cannot delete current user');

  // Re-home audit rows to the current admin/manager so FK constraints do not break.
  await Promise.all([
    sb(`/rest/v1/tf_sessions?user_id=eq.${id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } }),
    sb(`/rest/v1/tf_task_assignees?user_id=eq.${id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } }),
    sb(`/rest/v1/tf_step_checks?user_id=eq.${id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } }),
    sb(`/rest/v1/tf_notifications?for_user_id=eq.${id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } }),
    sb(`/rest/v1/tf_tasks?created_by=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ created_by: s.id }) }),
    sb(`/rest/v1/tf_tasks?verified_by=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ verified_by: null }) }),
    sb(`/rest/v1/tf_attachments?uploaded_by=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ uploaded_by: s.id }) }),
    sb(`/rest/v1/tf_obstacles?author_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ author_id: s.id }) }),
    sb(`/rest/v1/tf_comments?author_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ author_id: s.id }) }),
    sb(`/rest/v1/tf_progress_log?user_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ user_id: s.id }) }),
  ]);
  await sb(`/rest/v1/tf_users?id=eq.${id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
  return ok();
}
async function getTags(req) {
  await auth(req);
  const rows = await sb('/rest/v1/tf_tags?select=name&order=id.asc', { method: 'GET' });
  return ok({ tags: rows.map(r => r.name) });
}
async function getTasks(req) {
  const s = await auth(req);
  const branchFilter = s.urole === 'admin' ? '' : `&branch=eq.${encodeURIComponent(s.branch || '')}`;
  const tasks = await sb(`/rest/v1/tf_tasks?select=*&order=created_at.desc${branchFilter}`, { method: 'GET' });
  const ids = tasks.map(t => t.id);
  if (!ids.length) return ok({ tasks: [] });
  const inIds = `in.(${ids.join(',')})`;
  const [assignees, steps, checks, attachments, obstacles, comments] = await Promise.all([
    sb(`/rest/v1/tf_task_assignees?task_id=${inIds}&select=task_id,user_id`, { method: 'GET' }),
    sb(`/rest/v1/tf_task_steps?task_id=${inIds}&select=id,task_id,label,sort_order&order=sort_order.asc`, { method: 'GET' }),
    sb(`/rest/v1/tf_step_checks?task_id=${inIds}&select=step_id,user_id,task_id,is_done,checked_at`, { method: 'GET' }),
    sb(`/rest/v1/tf_attachments?task_id=${inIds}&select=id,task_id,is_submitted,file_name,file_size,file_type,file_url`, { method: 'GET' }),
    sb(`/rest/v1/tf_obstacles?task_id=${inIds}&select=*&order=created_at.asc`, { method: 'GET' }),
    sb(`/rest/v1/tf_comments?task_id=${inIds}&select=*&order=created_at.asc`, { method: 'GET' }),
  ]);
  const out = tasks.map(t => {
    const tid = t.id;
    const stepChecks = {};
    checks.filter(c => c.task_id === tid).forEach(c => {
      if (!stepChecks[c.user_id]) stepChecks[c.user_id] = {};
      stepChecks[c.user_id][c.step_id] = { done: !!c.is_done, at: c.checked_at };
    });
    return {
      ...t,
      asgn: assignees.filter(a => a.task_id === tid).map(a => Number(a.user_id)),
      steps: steps.filter(st => st.task_id === tid),
      stepChecks,
      attachments: attachments.filter(f => f.task_id === tid && !f.is_submitted),
      submittedFiles: attachments.filter(f => f.task_id === tid && f.is_submitted),
      obstacles: obstacles.filter(o => o.task_id === tid).map(o => ({ ...o, comments: comments.filter(c => c.obstacle_id === o.id).map(c => ({ id: c.id, authorId: c.author_id, text: c.body, at: c.created_at })) })),
      comments: comments.filter(c => c.task_id === tid && !c.obstacle_id).map(c => ({ id: c.id, authorId: c.author_id, text: c.body, at: c.created_at })),
      ackBy: t.ack_by || [],
    };
  });
  const visible = s.urole === 'user' ? out.filter(t => (t.asgn || []).includes(Number(s.id))) : out;
  return ok({ tasks: visible });
}
async function taskSave(req) {
  const s = await auth(req);
  if (!['admin', 'manager', 'assistant'].includes(s.urole)) return err('Forbidden', 403);
  const b = await bodyJson(req);
  if (!b.title) return err('Missing title');
  const assignedIds = [...new Set((Array.isArray(b.asgn) ? b.asgn : []).map(uid => Number(uid)).filter(Boolean))];
  if (!assignedIds.length) return err('กรุณาเลือกผู้รับมอบหมายอย่างน้อย 1 คน');

  let id = Number(b.id || 0);
  let previousAssignedIds = [];
  if (id) {
    const prev = await sb(`/rest/v1/tf_task_assignees?task_id=eq.${id}&select=user_id`, { method: 'GET' });
    previousAssignedIds = prev.map(x => Number(x.user_id));
  }

  if (s.urole !== 'admin') {
    const inUsers = `in.(${assignedIds.join(',')})`;
    const targetUsers = await sb(`/rest/v1/tf_users?id=${inUsers}&select=id,branch`, { method: 'GET' });
    const outsideBranch = targetUsers.some(u => String(u.branch || '') !== String(s.branch || ''));
    if (outsideBranch) return err('มอบหมายได้เฉพาะสมาชิกในสาขาของคุณ', 403);
  }

  const payload = { title: b.title, description: b.desc || '', col: b.col || 'todo', priority: b.priority || 'normal', due_date: b.date || null, branch: b.branch || s.branch || '', dept_key: b.dept_key || '', tags: b.tags || [], ack_by: b.ackBy || [] };
  if (id) {
    await sb(`/rest/v1/tf_tasks?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    await sb(`/rest/v1/tf_task_assignees?task_id=eq.${id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
    await sb(`/rest/v1/tf_task_steps?task_id=eq.${id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
  } else {
    const rows = await sb('/rest/v1/tf_tasks', { method: 'POST', body: JSON.stringify({ ...payload, created_by: s.id }) });
    id = Number(rows[0].id);
  }

  await sb('/rest/v1/tf_task_assignees', { method: 'POST', body: JSON.stringify(assignedIds.map(uid => ({ task_id: id, user_id: uid }))) });

  const newlyAssignedIds = assignedIds.filter(uid => !previousAssignedIds.includes(uid));
  const notifyIds = newlyAssignedIds.filter(uid => Number(uid) !== Number(s.id));
  let assignmentEmails = [];
  let telegramSent = 0;
  if (notifyIds.length) {
    const inNotify = `in.(${notifyIds.join(',')})`;
    const recipients = await sb(`/rest/v1/tf_users?id=${inNotify}&select=id,name,email,telegram_chat_id`, { method: 'GET' });
    assignmentEmails = recipients.map(u => u.email).filter(Boolean);
    const notifs = notifyIds.map(uid => ({ type: 'new_task', title: '🔔 งานใหม่ถูกมอบหมาย', body: `"${b.title}" โดย ${s.name}`, task_id: id, for_user_id: Number(uid) }));
    if (notifs.length) await sb('/rest/v1/tf_notifications', { method: 'POST', body: JSON.stringify(notifs) });
    const tgText = `🔔 TaskFlow Pro v5\nคุณได้รับมอบหมายงาน: ${b.title}\nโดย: ${s.name}${b.date ? `\nกำหนดส่ง: ${b.date}` : ''}\nกรุณาเข้าสู่ระบบเพื่อตรวจสอบรายละเอียด`;
    const tg = await sendTelegramMessages(recipients.map(u => u.telegram_chat_id), tgText);
    telegramSent = tg.sent || 0;
  }

  if (Array.isArray(b.steps) && b.steps.length) await sb('/rest/v1/tf_task_steps', { method: 'POST', body: JSON.stringify(b.steps.map((st, i) => ({ task_id: id, label: st.label || st, sort_order: i }))) });
  return ok({ task_id: id, assignment_emails: assignmentEmails, telegram_sent: telegramSent });
}
async function simplePatch(req, table, idField, payloadFn) {
  await auth(req);
  const b = await bodyJson(req);
  const id = Number(b.id || b.task_id || 0);
  if (!id) return err('Missing id');
  await sb(`/rest/v1/${table}?${idField}=eq.${id}`, { method: 'PATCH', body: JSON.stringify(payloadFn(b)) });
  return ok();
}
async function taskDelete(req) {
  await auth(req);
  const b = await bodyJson(req);
  await sb(`/rest/v1/tf_tasks?id=eq.${Number(b.id || 0)}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
  return ok();
}
async function taskProgress(req) {
  const s = await auth(req);
  const b = await bodyJson(req);
  const id = Number(b.task_id || 0);
  const prog = Math.max(0, Math.min(100, Number(b.prog || 0)));
  await sb(`/rest/v1/tf_tasks?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ prog }) });
  await sb('/rest/v1/tf_progress_log', { method: 'POST', body: JSON.stringify({ task_id: id, user_id: s.id, prog, note: b.note || '' }) });
  return ok();
}
async function taskSubmit(req) {
  const s = await auth(req);
  const b = await bodyJson(req);
  const id = Number(b.task_id || 0);
  await sb(`/rest/v1/tf_tasks?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ col: 'review', prog: 100, submit_note: b.note || '' }) });
  const task = (await sb(`/rest/v1/tf_tasks?id=eq.${id}&select=title`, { method: 'GET' }))[0];
  const mgrs = await sb('/rest/v1/tf_users?urole=in.(admin,manager)&select=id', { method: 'GET' });
  if (mgrs.length) await sb('/rest/v1/tf_notifications', { method: 'POST', body: JSON.stringify(mgrs.map(m => ({ type: 'work_submitted', title: '📤 มีการส่งงาน', body: `"${task?.title || ''}" ส่งโดย ${s.name}`, task_id: id, for_user_id: m.id }))) });
  return ok();
}
async function taskVerify(req) {
  const s = await auth(req);
  if (!['admin', 'manager'].includes(s.urole)) return err('Forbidden', 403);
  const b = await bodyJson(req);
  const id = Number(b.task_id || 0);
  const approve = (b.action || 'approve') === 'approve';
  await sb(`/rest/v1/tf_tasks?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ col: approve ? 'verified' : 'doing', verified_by: approve ? s.id : null }) });
  const task = (await sb(`/rest/v1/tf_tasks?id=eq.${id}&select=title`, { method: 'GET' }))[0];
  const asgn = await sb(`/rest/v1/tf_task_assignees?task_id=eq.${id}&select=user_id`, { method: 'GET' });
  if (asgn.length) await sb('/rest/v1/tf_notifications', { method: 'POST', body: JSON.stringify(asgn.map(a => ({ type: approve ? 'verified' : 'return_task', title: approve ? '✅ ผ่านตรวจสอบ' : '↩️ ส่งกลับแก้ไข', body: `"${task?.title || ''}"`, task_id: id, for_user_id: a.user_id }))) });
  return ok();
}
async function stepToggle(req) {
  const s = await auth(req);
  const b = await bodyJson(req);
  const row = { step_id: Number(b.step_id), user_id: s.id, task_id: Number(b.task_id), is_done: !!b.done, checked_at: new Date().toISOString() };
  await sb('/rest/v1/tf_step_checks?on_conflict=step_id,user_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  return ok();
}
async function obstacleAdd(req) {
  const s = await auth(req);
  const b = await bodyJson(req);
  const rows = await sb('/rest/v1/tf_obstacles', { method: 'POST', body: JSON.stringify({ task_id: Number(b.task_id), title: b.title, description: b.desc || '', level: b.level || 'med', author_id: s.id }) });
  return ok({ id: Number(rows[0].id) }, 201);
}
async function commentAdd(req) {
  const s = await auth(req);
  const b = await bodyJson(req);
  const rows = await sb('/rest/v1/tf_comments', { method: 'POST', body: JSON.stringify({ task_id: Number(b.task_id), obstacle_id: b.obstacle_id || null, author_id: s.id, body: String(b.text || '').trim() }) });
  return ok({ id: Number(rows[0].id) }, 201);
}
async function notifications(req) {
  const s = await auth(req);
  const rows = await sb(`/rest/v1/tf_notifications?for_user_id=eq.${s.id}&select=*&order=created_at.desc&limit=50`, { method: 'GET' });
  return ok({ notifications: rows });
}
async function telegramSend(req) {
  await auth(req);
  const b = await bodyJson(req);
  const chatIds = [...new Set([...(Array.isArray(b.chat_ids) ? b.chat_ids : []), b.chat_id].map(v => String(v || '').trim()).filter(Boolean))];
  const text = String(b.text || '').trim();
  const token = String(TELEGRAM_BOT_TOKEN || b.bot_token || '').trim();
  if (!chatIds.length) return err('Missing Telegram chat_id');
  if (!text) return err('Missing Telegram message');
  if (!token) return err('Missing TELEGRAM_BOT_TOKEN or bot_token');
  const sent = [];
  for (const chatId of chatIds) {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const data = await tg.json().catch(() => null);
    if (!tg.ok || !data?.ok) return err(data?.description || `Telegram send failed: ${chatId}`, 502);
    sent.push(data.result);
  }
  return ok({ telegram: sent, sent: sent.length });
}

async function tagSave(req) {
  await auth(req);
  let name = '';
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('form')) {
    const fd = await req.formData();
    name = String(fd.get('tag_name') || fd.get('name') || '').trim();
  } else {
    const b = await bodyJson(req);
    name = String(b.name || '').trim();
  }
  if (!name) return err('Missing name');
  await sb('/rest/v1/tf_tags?on_conflict=name', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ name }) });
  return ok({ name });
}
async function _rewriteTaskTags(mapper) {
  const rows = await sb('/rest/v1/tf_tasks?select=id,tags', { method: 'GET' });
  let updated = 0;
  for (const row of rows || []) {
    const before = Array.isArray(row.tags) ? row.tags : [];
    const after = [...new Set((mapper(before) || []).map(v => String(v || '').trim()).filter(Boolean))];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await sb(`/rest/v1/tf_tasks?id=eq.${Number(row.id)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ tags: after }) });
      updated += 1;
    }
  }
  return updated;
}
async function tagDelete(req) {
  const s = await auth(req);
  if (!['admin', 'manager'].includes(s.urole)) return err('Forbidden', 403);
  const b = await bodyJson(req);
  const name = String(b.name || '').trim();
  if (!name) return err('Missing name');
  const updated_tasks = await _rewriteTaskTags(tags => tags.filter(t => t !== name));
  await sb(`/rest/v1/tf_tags?name=eq.${encodeURIComponent(name)}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
  return ok({ name, updated_tasks });
}
async function tagDeleteAll(req) {
  const s = await auth(req);
  if (!['admin', 'manager'].includes(s.urole)) return err('Forbidden', 403);
  const updated_tasks = await _rewriteTaskTags(() => []);
  await sb('/rest/v1/tf_tags?id=gte.0', { method: 'DELETE', headers: { prefer: 'return=minimal' } });
  return ok({ deleted_all: true, updated_tasks });
}
async function tagRename(req) {
  const s = await auth(req);
  if (!['admin', 'manager'].includes(s.urole)) return err('Forbidden', 403);
  const b = await bodyJson(req);
  const oldName = String(b.old_name || b.oldName || '').trim();
  const newName = String(b.new_name || b.newName || '').trim();
  if (!oldName || !newName) return err('Missing name');
  if (oldName === newName) return ok({ old_name: oldName, new_name: newName, updated_tasks: 0 });
  const dup = await sb(`/rest/v1/tf_tags?name=eq.${encodeURIComponent(newName)}&select=name`, { method: 'GET' });
  if (dup?.length) return err('มีประเภทงานชื่อนี้อยู่แล้ว');
  await sb(`/rest/v1/tf_tags?name=eq.${encodeURIComponent(oldName)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ name: newName }) });
  const updated_tasks = await _rewriteTaskTags(tags => tags.map(t => t === oldName ? newName : t));
  return ok({ old_name: oldName, new_name: newName, updated_tasks });
}
async function fileUpload(req) {
  const s = await auth(req);
  const fd = await req.formData();
  const file = fd.get('file');
  const taskId = Number(fd.get('task_id') || 0);
  const isSubmitted = String(fd.get('is_submitted') || '0') === '1';
  if (!file || !taskId) return err('No file or task_id');
  const ext = (file.name || 'file').split('.').pop() || 'bin';
  const path = `tasks/t${taskId}_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
  const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/task-attachments/${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
    body: file,
  });
  if (!upload.ok) throw new Error(await upload.text());
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/task-attachments/${path}`;
  const rows = await sb('/rest/v1/tf_attachments', { method: 'POST', body: JSON.stringify({ task_id: taskId, is_submitted: isSubmitted, file_name: file.name || 'file', file_size: `${Math.round((file.size || 0) / 1024)}KB`, file_type: ext, file_path: path, file_url: publicUrl, uploaded_by: s.id }) });
  return ok({ file_id: Number(rows[0].id), file_name: file.name || 'file', file_url: publicUrl }, 201);
}
export default async function handler(req) {
  if (req.method === 'OPTIONS') return json({}, 204);
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  try {
    if (action === 'local_login' && req.method === 'POST') return localLogin(req);
    if ((action === 'register' || action === 'signup') && req.method === 'POST') return registerUser(req);
    if (action === 'logout' && req.method === 'POST') return ok();
    if (action === 'users' && req.method === 'GET') return getUsers(req);
    if (action === 'profile_save' && req.method === 'POST') return profileSave(req);
    if (action === 'avatar_upload' && req.method === 'POST') return avatarUpload(req);
    if (action === 'avatar_remove' && req.method === 'POST') return avatarRemove(req);
    if ((action === 'member_save' || action === 'user_save') && req.method === 'POST') return memberSave(req);
    if ((action === 'member_delete' || action === 'user_delete') && req.method === 'POST') return memberDelete(req);
    if (action === 'tasks' && req.method === 'GET') return getTasks(req);
    if (action === 'tags' && req.method === 'GET') return getTags(req);
    if (action === 'task_save' && req.method === 'POST') return taskSave(req);
    if (action === 'task_delete' && req.method === 'POST') return taskDelete(req);
    if (action === 'task_col' && req.method === 'POST') return simplePatch(req, 'tf_tasks', 'id', b => ({ col: b.col || 'todo', prog: (b.col === 'done' || b.col === 'verified') ? 100 : undefined }));
    if (action === 'task_progress' && req.method === 'POST') return taskProgress(req);
    if (action === 'task_submit' && req.method === 'POST') return taskSubmit(req);
    if (action === 'task_verify' && req.method === 'POST') return taskVerify(req);
    if (action === 'step_toggle' && req.method === 'POST') return stepToggle(req);
    if (action === 'file_upload' && req.method === 'POST') return fileUpload(req);
    if (action === 'notifications' && req.method === 'GET') return notifications(req);
    if (action === 'notif_ack' && req.method === 'POST') return simplePatch(req, 'tf_notifications', 'id', () => ({ is_acked: true, is_read: true }));
    if (action === 'notif_read' && req.method === 'POST') return ok();
    if (action === 'notif_clear' && req.method === 'POST') { const s = await auth(req); await sb(`/rest/v1/tf_notifications?for_user_id=eq.${s.id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } }); return ok(); }
    if (action === 'obstacle_add' && req.method === 'POST') return obstacleAdd(req);
    if (action === 'obstacle_resolve' && req.method === 'POST') return simplePatch(req, 'tf_obstacles', 'id', () => ({ resolved: true, resolved_at: new Date().toISOString() }));
    if (action === 'comment_add' && req.method === 'POST') return commentAdd(req);
    if (action === 'telegram_send' && req.method === 'POST') return telegramSend(req);
    if (action === 'tag_save' && req.method === 'POST') return tagSave(req);
    if (action === 'tag_delete' && req.method === 'POST') return tagDelete(req);
    if (action === 'tag_delete_all' && req.method === 'POST') return tagDeleteAll(req);
    if (action === 'tag_rename' && req.method === 'POST') return tagRename(req);
    return err(`Unknown: ${action}`, 404);
  } catch (e) {
    return err(e.message || 'Server error', e.status || 500);
  }
}
