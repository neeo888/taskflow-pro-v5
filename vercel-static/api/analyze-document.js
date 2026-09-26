import { Buffer } from 'node:buffer';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function requireSession(req) {
  const token = req.headers.get('x-token') || '';
  if (!token || !SUPABASE_URL || !SERVICE_KEY) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const url = `${SUPABASE_URL}/rest/v1/tf_sessions?token=eq.${encodeURIComponent(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token&limit=1`;
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } });
  if (!res.ok || !(await res.json()).length) throw Object.assign(new Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่'), { status: 401 });
}
function outputText(response) {
  if (response?.output_text) return response.output_text;
  for (const item of response?.output || []) for (const part of item?.content || []) if (part?.type === 'output_text' && part?.text) return part.text;
  return '';
}
function validate(input) {
  const x = input && typeof input === 'object' ? input : {};
  const kinds = new Set(['งานทั่วไป', 'ประชุม', 'อบรม', 'ประชุม/อบรม', 'เข้าร่วมพิธี', 'ลงพื้นที่', 'ตรวจสอบ']);
  const date = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
  const time = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : '';
  const text = (v, max) => String(v || '').trim().slice(0, max);
  const start = date(x.start_date), rawEnd = date(x.end_date), end = rawEnd && (!start || rawEnd >= start) ? rawEnd : start;
  const warnings = Array.isArray(x.warnings) ? x.warnings.map(v => text(v, 300)).filter(Boolean).slice(0, 8) : [];
  if (!text(x.title, 200)) warnings.unshift('ไม่พบชื่องานที่ชัดเจน กรุณาระบุเอง');
  if (!start) warnings.unshift('ไม่พบวันเริ่มต้น กรุณาตรวจสอบเอกสาร');
  if (rawEnd && start && rawEnd < start) warnings.unshift('วันสิ้นสุดก่อนวันเริ่มต้น ระบบใช้วันเริ่มต้นแทน');
  return { title: text(x.title, 200), task_type: kinds.has(x.task_type) ? x.task_type : 'งานทั่วไป', topic: text(x.topic, 300), start_date: start, end_date: end, start_time: time(x.start_time), end_time: time(x.end_time), location: text(x.location, 300), dress_code: text(x.dress_code, 200), details: text(x.details, 4000), confidence: Math.max(0, Math.min(100, Number(x.confidence) || 0)), warnings };
}

export default async function handler(req) {
  try {
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    await requireSession(req);
    if (!OPENAI_API_KEY) return json({ ok: false, error: 'ยังไม่ได้ตั้งค่า OPENAI_API_KEY ใน Vercel' }, 503);
    const form = await req.formData(), file = form.get('file');
    const type = String(file?.type || '').toLowerCase();
    if (!file || !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(type)) return json({ ok: false, error: 'รองรับเฉพาะ PDF, JPG, PNG และ WebP' }, 400);
    if (!file.size || file.size > 4 * 1024 * 1024) return json({ ok: false, error: 'ไฟล์สำหรับวิเคราะห์ต้องมีขนาดไม่เกิน 4 MB' }, 400);
    const dataUrl = `data:${type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;
    const fileInput = type === 'application/pdf' ? { type: 'input_file', filename: file.name || 'document.pdf', file_data: dataUrl, detail: 'high' } : { type: 'input_image', image_url: dataUrl, detail: 'high' };
    const schema = { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, task_type: { type: 'string', enum: ['งานทั่วไป', 'ประชุม', 'อบรม', 'ประชุม/อบรม', 'เข้าร่วมพิธี', 'ลงพื้นที่', 'ตรวจสอบ'] }, topic: { type: 'string' }, start_date: { type: 'string' }, end_date: { type: 'string' }, start_time: { type: 'string' }, end_time: { type: 'string' }, location: { type: 'string' }, dress_code: { type: 'string' }, details: { type: 'string' }, confidence: { type: 'number' }, warnings: { type: 'array', items: { type: 'string' } } }, required: ['title', 'task_type', 'topic', 'start_date', 'end_date', 'start_time', 'end_time', 'location', 'dress_code', 'details', 'confidence', 'warnings'] };
    const prompt = 'อ่านข้อความจากเอกสารภาษาไทยนี้เพื่อสร้างงานในระบบ. ดึงเฉพาะข้อมูลที่ปรากฏชัดเจน ห้ามเดาหรือสร้างวันเวลา/สถานที่/การแต่งกาย. หากไม่พบให้ส่งสตริงว่าง. จัดประเภทเป็น งานทั่วไป, ประชุม, อบรม, ประชุม/อบรม, เข้าร่วมพิธี, ลงพื้นที่, หรือ ตรวจสอบ. warnings ระบุสิ่งที่ต้องตรวจทาน. ส่ง JSON ตาม schema เท่านั้น.';
    const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { authorization: `Bearer ${OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4.1-mini', store: false, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, fileInput] }], text: { format: { type: 'json_schema', name: 'task_document_extraction', strict: true, schema } } }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) return json({ ok: false, error: data?.error?.message || 'เรียก OpenAI API ไม่สำเร็จ' }, 502);
    return json({ ok: true, extraction: validate(JSON.parse(outputText(data))) });
  } catch (e) { return json({ ok: false, error: e?.message || 'วิเคราะห์เอกสารไม่สำเร็จ' }, e?.status || 500); }
}
