// แต่งประโยคสรุปแบบพูด (ที่เดียวของ Alpha) จากข้อมูลดิบ (facts) ที่แต่ละแอปส่งมา
// ประโยคทั้งหมดอยู่ใน messages/th.json · ตารางว่า key ไหนคือสถานการณ์อะไร ดู messages/README.md
// - สุ่มด้วย seed จาก วันที่ + key → วันเดียวกันเปิดซ้ำได้ประโยคเดิม
// - จำ index ล่าสุดของแต่ละ key (ไม่เกิน 5 หรือน้อยกว่าถ้ามีประโยคไม่ถึง) ห้ามสุ่มซ้ำ · บันทึกวันละครั้ง
// - ตัวแปรไหนไม่มีค่า → ข้ามหัวข้อนั้น (ไม่อ่าน {xxx} หรือ undefined)

const HIST_KEY = 'hub.speech.v1';
const RECENT = 5;
let DATA = { heads: [''], tails: [''], messages: {} };

export async function loadMessages() {
  try {
    const r = await fetch(new URL('./messages/th.json', import.meta.url), { cache: 'no-cache' });
    if (r.ok) DATA = await r.json();
  } catch (err) { console.warn('[speech] load messages', err); }
}

const store = {
  get() { try { return JSON.parse(localStorage.getItem(HIST_KEY)) || {}; } catch { return {}; } },
  set(v) { try { localStorage.setItem(HIST_KEY, JSON.stringify(v)); } catch { /* ignore */ } },
};
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// สุ่มแบบมี seed (เลขเดิมทุกครั้งสำหรับ seed เดิม)
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function pickIndex(key, n) {
  if (n <= 1) return 0;
  const today = dayKey();
  const all = store.get();
  const h = all[key] || { recent: [] };
  if (h.day === today && h.idx < n) return h.idx;
  const avoid = new Set((h.recent || []).slice(-Math.min(RECENT, n - 1)));
  const choices = [...Array(n).keys()].filter((i) => !avoid.has(i));
  const idx = choices[Math.floor(seeded(`${today}|${key}`) * choices.length)];
  all[key] = { day: today, idx, recent: [...(h.recent || []), idx].slice(-RECENT) };
  store.set(all);
  return idx;
}

const fmt = (v) => (typeof v === 'number' ? Math.round(v).toLocaleString('th-TH') : String(v));
const missing = (v) => v == null || (typeof v === 'number' && !Number.isFinite(v)) || v === '';

// เลือกประโยคจาก messages[key] แล้วแทนค่า {ตัวแปร} · ขาดตัวแปร → null
export function render(key, vars = {}) {
  const list = DATA.messages?.[key];
  if (!list?.length) return null;
  const tpl = list[pickIndex(key, list.length)];
  let bad = false;
  const text = tpl.replace(/\{(\w+)\}/g, (_, k) => {
    if (missing(vars[k])) { bad = true; return ''; }
    return fmt(vars[k]);
  });
  return bad ? null : text;
}

/* ---------- เลือก key ---------- */
// เรื่องที่นับเป็นวัน: 0 = วันนี้ · 1 = พรุ่งนี้ · 2–14 = ปกติ · > 14 = ไม่พูด · < 0 = เลยกำหนด
function dayKeyOf(base, days, { late = true } = {}) {
  if (!Number.isFinite(days) || days > 14) return null;
  if (days < 0) return late ? { key: `${base}-late`, vars: { lateDays: -days }, late: true } : null;
  if (days === 0) return { key: `${base}-today`, vars: {} };
  if (days === 1) return { key: `${base}-tomorrow`, vars: {} };
  return { key: base, vars: { days } };
}

const RENEW_NAME = { tax: 'ต่อภาษี', insurance: 'ต่อประกัน', act: 'พอรอบอ' };

// ระดับค่ากิน: A ใช้ได้ต่อวัน ≥ tightPerDay · B ≥ lowPerDay · F ต่ำกว่านั้นแต่ยังไม่เกินงบ
// เกินงบ: C เบา · D ≥ overMid · E ≥ overHigh หรือรอบก่อนก็เกิน
export function foodLevel(f, s) {
  if (!f || !Number.isFinite(f.left)) return null;
  if (f.over > 0) return f.over >= s.overHigh || f.prevOver ? 'E' : f.over >= s.overMid ? 'D' : 'C';
  return f.perDay >= s.tightPerDay ? 'A' : f.perDay >= s.lowPerDay ? 'B' : 'F';
}

const EMOTION = { A: 'ok', B: 'advise', F: 'worry', C: 'no', D: 'no', E: 'sulk' };

/**
 * ประกอบสรุปทั้งวัน
 * @param {{ fin?: object, fuel?: object, settings: object, links?: object }} p
 * @returns {{ topics: {key, text, link, group}[], level: string|null, emotion: string, nothing: boolean }}
 * topics เรียงตาม: ค่ากิน (+วันเงินเดือนเข้า) → ค่างวด → รถ
 */
export function compose({ fin, fuel, settings, links = {} }) {
  const topics = [];
  let late = false;
  const add = (group, key, vars, link) => {
    const text = render(key, vars);
    if (text) topics.push({ group, key, text, link });
    return !!text;
  };

  // 1) ค่ากิน + วันเงินเดือนเข้า
  const level = foodLevel(fin, settings);
  if (level) {
    const over = ['C', 'D', 'E'].includes(level);
    if (fin.daysToPayday === 0) {
      // วันเงินเดือนเข้า: พูดถึงรอบที่เพิ่งจบ
      if (fin.prevLeft != null) add('food', fin.prevLeft < 0 ? 'food-payday-today-over' : 'food-payday-today-left',
        { left: fin.prevLeft, over: -fin.prevLeft }, links.food);
    } else if (fin.daysToPayday === 1) {
      add('food', over ? 'food-payday-tomorrow-over' : 'food-payday-tomorrow-left', { left: fin.left, over: fin.over }, links.food);
    } else {
      add('food', `food-${level}`, { left: fin.left, perDay: fin.perDay, daysToPayday: fin.daysToPayday, over: fin.over }, links.food);
    }
  }

  // 2) ค่างวด (งวดที่ใกล้สุด) + งวดสุดท้าย
  const inst = fin?.installments?.[0];
  if (inst) {
    const vars = { installCount: inst.count, installTotal: inst.total };
    if (inst.days === 0) add('install', 'install-today', vars, links.install);
    else if (inst.days === 1) add('install', 'install-tomorrow', vars, links.install);
    else if (inst.days >= 2 && inst.days <= 14) add('install', 'install-days', { ...vars, installDays: inst.days }, links.install);
  }
  for (const name of fin?.lastInstallments || []) add('install', 'install-last', { name }, links.install);

  // 3) รถ: น้ำมันใกล้หมด → เช็กระยะ → ต่อภาษี/ประกัน/พ.ร.บ. (เรียงตามวัน)
  if (fuel?.fuelLow) add('car', 'car-fuel-low', { kmPerL: fuel.kmPerL }, links.fuel);
  // เรียงตามวัน (เช็กระยะที่เลยกิโลแล้ว = เรื่องแรก)
  const when = (r) => (r.byKm && r.leftKm <= 0 ? -999 : r.days ?? 99);
  const rems = [...(fuel?.reminders || [])].sort((a, b) => when(a) - when(b));
  for (const r of rems) {
    if (r.type === 'service' && r.byKm) {
      if (r.leftKm <= 0) { if (add('car', 'car-service-km-late', { overKm: -r.leftKm }, links.care)) late = true; }
      else if (r.near) add('car', 'car-service-km-near', { leftKm: r.leftKm }, links.care);
      continue;
    }
    const base = r.type === 'service' ? 'car-service-days' : r.type === 'appt' ? 'car-service-appt' : RENEW_NAME[r.type] ? 'car-renew' : null;
    if (!base) continue;
    const k = dayKeyOf(base, r.days, { late: r.type !== 'appt' });
    if (!k) continue;
    if (add('car', k.key, { ...k.vars, name: RENEW_NAME[r.type] }, links.care) && k.late) late = true;
  }

  // ไม่มีเรื่องอะไรเลย และค่ากินระดับ A → ประโยคเดียว
  const nothing = level === 'A' && fin?.daysToPayday > 1 && topics.every((t) => t.group === 'food');
  if (nothing) {
    const text = render('nothing', {});
    if (text) topics.splice(0, topics.length, { group: 'nothing', key: 'nothing', text, link: links.food });
  }

  // วันเงินเดือนเข้า: อารมณ์ตามรอบที่เพิ่งจบ (เกินงบ = ไม่เห็นด้วย)
  const lv = fin?.daysToPayday === 0 && fin.prevLeft < 0 ? 'C' : level;
  // มีเรื่องครบกำหนดวันนี้ (ค่างวด / เช็กระยะ / นัดศูนย์ / ต่อภาษี ประกัน พ.ร.บ.) → ขอขัด
  const dueToday = topics.some((t) => t.key === 'install-today' || /^car-.*-today$/.test(t.key));
  const emotion = late ? 'worry' : dueToday ? 'interrupt' : nothing ? 'greet' : (lv && EMOTION[lv]) || 'greet';
  return { topics, level, emotion, nothing };
}

// หัว (ครั้งเดียวตอนต้น) + ท้าย (ครั้งเดียวตอนจบ) · ใช้ประโยคเต็มเท่านั้น
// ประโยคแรกขึ้นต้นด้วย "บอสคะ"/"สวัสดี" แล้ว → ไม่ใส่หัว · ประโยคสุดท้ายมี "สู้ๆ"/"วันที่ดี" แล้ว → ไม่ใส่ท้าย
export function wrap(texts) {
  if (!texts.length) return texts;
  const out = [...texts];
  if (!/^(บอส|สวัสดี)/.test(out[0])) {
    const head = DATA.heads?.length ? DATA.heads[pickIndex('_head', DATA.heads.length)] : '';
    out[0] = head + out[0];
  }
  const last = out.length - 1;
  if (!/สู้ๆ|วันที่ดี/.test(out[last])) {
    const tail = DATA.tails?.length ? DATA.tails[pickIndex('_tail', DATA.tails.length)] : '';
    if (tail) out[last] = `${out[last]} ${tail}`;
  }
  return out;
}
