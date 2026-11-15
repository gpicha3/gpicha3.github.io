// ส่งรายการจดไป Apps Script ของเว็บการเงิน (doPost) + คิวตอนเน็ตหลุด + ประวัติสำหรับเลิกทำ
// localStorage: alpha.logWrite { url, token } · alpha.logQueue [{ batchId, entries, at }] · alpha.logHistory [{ batchId, entries, rows, at }]

const KEY = { write: 'alpha.logWrite', queue: 'alpha.logQueue', history: 'alpha.logHistory' };
const TIMEOUT = 10000;
const HISTORY_MAX = 5;

const get = (k, fb) => { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } };
const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// URL ใช้ deployment เดียวกับที่เว็บการเงินอ่าน (fa.setup) ถ้ายังไม่ได้ตั้งแยก
export function writeConfig() {
  const w = get(KEY.write, {}) || {};
  const fa = get('fa.setup', null);
  return { url: w.url || fa?.url || '', token: w.token || '' };
}
export function saveWriteConfig({ url, token }) { set(KEY.write, { url: String(url || '').trim(), token: String(token || '').trim() }); }
export const queue = () => get(KEY.queue, []);
export const history = () => get(KEY.history, []);
export const pendingCount = () => queue().reduce((n, b) => n + b.entries.length, 0);

// ผล: { ok, data } · { ok: false, error: 'auth' | 'config' | 'network' | <ข้อความจากสคริปต์> , retry }
async function post(body) {
  const { url, token } = writeConfig();
  if (!url || !token) return { ok: false, error: 'config', retry: false };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    // ห้ามใส่ Content-Type (ให้เป็น text/plain จะได้ไม่มี CORS preflight ที่ Apps Script รับไม่ได้)
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ ...body, token }), signal: ctl.signal });
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'auth', retry: false };
    if (res.status >= 500) return { ok: false, error: 'network', retry: true };
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || 'failed', retry: false, data };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'network', retry: true };
  } finally {
    clearTimeout(timer);
  }
}

function remember(batch, data) {
  const h = history().filter((b) => b.batchId !== batch.batchId);
  h.unshift({ batchId: batch.batchId, entries: batch.entries, rows: data.rows || [], at: Date.now() });
  set(KEY.history, h.slice(0, HISTORY_MAX));
}

/**
 * จดชุดใหม่ · ส่งคิวที่ค้างก่อน (ตามลำดับเดิม)
 * @returns {{ status: 'saved' | 'queued' | 'auth' | 'config' | 'failed', batch, data?, error? }}
 */
export async function addBatch(entries) {
  const batch = { batchId: uuid(), entries: entries.map((e) => ({ id: uuid(), ...e })), at: Date.now() };
  await flushQueue();
  const r = await post({ action: 'add', entries: batch.entries });
  if (r.ok) { remember(batch, r.data); return { status: 'saved', batch, data: r.data }; }
  if (r.retry) { set(KEY.queue, [...queue(), batch]); return { status: 'queued', batch }; }
  return { status: r.error === 'auth' || r.error === 'config' ? r.error : 'failed', batch, error: r.error };
}

// ส่งคิวที่ค้าง ตามลำดับเดิม หยุดเมื่อเน็ตยังไม่มา · id เดิม → สคริปต์กันจดซ้ำให้
export async function flushQueue() {
  let q = queue();
  let sent = 0;
  while (q.length) {
    const r = await post({ action: 'add', entries: q[0].entries });
    if (!r.ok && r.retry) break;
    if (r.ok) { remember(q[0], r.data); sent += q[0].entries.length; }
    q = q.slice(1); // ส่งได้ หรือสคริปต์ปฏิเสธถาวร (ไม่ส่งซ้ำวนไป)
    set(KEY.queue, q);
    if (!r.ok) return { sent, error: r.error, failedBatch: true };
  }
  return { sent, error: null };
}
export function dropQueued(batchId) { set(KEY.queue, queue().filter((b) => b.batchId !== batchId)); }
export async function sendQueued(batchId) {
  const b = queue().find((x) => x.batchId === batchId);
  if (!b) return { ok: false };
  const r = await post({ action: 'add', entries: b.entries });
  if (r.ok) { remember(b, r.data); dropQueued(batchId); }
  return r;
}
// รายการในคิวที่ค้างเกิน 3 วัน
export const staleQueued = () => queue().filter((b) => Date.now() - b.at > 3 * 864e5);

// ลบชุดที่จดไป (ทั้งชุด) · สคริปต์ลบได้เฉพาะแถวท้ายสุดที่ยังไม่ถูกแก้
export async function undoBatch(batchId) {
  const b = history().find((x) => x.batchId === batchId);
  if (!b) return { ok: false, error: 'none' };
  const r = await post({ action: 'undo', ids: b.entries.map((e) => e.id) });
  if (r.ok) set(KEY.history, history().filter((x) => x.batchId !== batchId));
  return r;
}
