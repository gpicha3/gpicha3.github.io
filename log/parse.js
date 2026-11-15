// แกะข้อความจดรายรับรายจ่าย (ไม่ใช้ AI ไม่แตะ DOM ใช้ได้ทั้งใน browser และ node --test)
// parseLog(text) → { intent, entries, date, dateText, dateGuess, lateNight, dateError, note, fuelAmount, logish }
//   intent: 'undo' | 'cancel' | 'card' | 'fuel' | 'question' | 'entries' | 'none'
//   - 'undo' = ยกเลิก/ลบอันล่าสุด (hub: ถ้าการ์ดเปิดอยู่ คำว่า "ยกเลิก" = ปิดการ์ดแทน)
//   - 'none' = ไม่มีจำนวนเงิน (hub ส่งต่อให้ตัวจับคำสั่งเดิม · logish = ดูเหมือนตั้งใจจด → ถามกลับ)
//   entries: [{ item, amount, type: 'รายจ่าย' | 'รายรับ' }] (หมวดเลือกที่ categories.js)

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const MAX_BACK_DAYS = 35;

const CLASSIFIERS = /^(แก้ว|ชิ้น|อัน|ห่อ|ขวด|จาน|ที่|คน)$/;
const SHOP = /^(7-11|711)$/;
const AMOUNT = /^(\d[\d,]*(?:\.\d+)?)(k)?(บาท|บ\.?)?$/i;
const BAHT = /^(บาท|บ\.?)$/;
const INCOME = /รายรับ|เงินเข้า|โอนเข้า|คืนเงิน|ได้คืน|ได้เงิน|โบนัส|เงินเดือน|ขาย|ได้\s*\d|(^|\s)รับ(\s|\d|$)/;
const LOGISH = /^(จด|จ่าย|ซื้อ|รายรับ|รายจ่าย|ได้เงิน|\+)/;
const QUESTION = /เหลือ|เท่าไหร่|เท่าไร|กี่|ไหม|\?/;
const OPEN = /^(เปิด|ไป|open)/i;
const UNDO = /^(ยกเลิก|ลบอันล่าสุด|ลบล่าสุด|undo|เลิกทำ)$/i;
const CANCEL = /^(ยกเลิก|ไม่เอา|ไม่)$/;
const CARD = /บัตรเครดิต|รูดบัตร|บัตร|เครดิต/;
const FUEL = /น้ำมัน|เติม(?!เกม|เงิน)|e20|e85|แก๊สโซฮอล์|ดีเซล/i;

const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);

// "วันนี้" / "เมื่อวาน" / "12 พ.ย."
export function dateText(d, now = new Date()) {
  const back = daysBetween(d, now);
  return back === 0 ? 'วันนี้' : back === 1 ? 'เมื่อวาน' : `${d.getDate()} ${TH_MONTHS[d.getMonth()]}`;
}

/* ---------- เสียง → ข้อความ ---------- */
const NUM_WORD = /(?:ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น|แสน)+/g;
const DIGIT = { ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9 };
const UNIT = { สิบ: 10, ร้อย: 100, พัน: 1000, หมื่น: 10000, แสน: 100000 };
// "หกสิบ" → 60 · "ร้อยยี่สิบ" → 120 · "พันสอง" → 1200 (ภาษาพูด: ตัวเลขท้ายหน่วยใหญ่ = หลักถัดลงมา)
export function thaiWordsToNumber(run) {
  const parts = run.match(/ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น|แสน/g) || [];
  let total = 0, digit = null, lastUnit = 0;
  for (const p of parts) {
    if (p in DIGIT) { digit = DIGIT[p]; continue; }
    const u = UNIT[p];
    total += (digit ?? 1) * u;
    digit = null;
    lastUnit = u;
  }
  if (digit != null) total += lastUnit >= 100 ? digit * (lastUnit / 10) : digit;
  return total;
}
export function normalizeSpoken(text) {
  return String(text || '')
    .replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50))
    .replace(NUM_WORD, (run) => ` ${thaiWordsToNumber(run)} `)
    .replace(/บาท/g, ' ')
    .replace(/แกร็บ/g, 'grab').replace(/บีทีเอส/g, 'bts').replace(/เอ็มอาร์ที/g, 'mrt')
    .replace(/\s+/g, ' ').trim();
}

/* ---------- วันที่ ---------- */
function pickDate(s, now, cutoff) {
  const today = dayOnly(now);
  const found = []; // [{ d, rank }] rank สูง = เจาะจงกว่า
  let rest = s;
  const take = (re, fn) => { rest = rest.replace(re, (...m) => { const d = fn(m); if (d) found.push(d); return ' '; }); };
  take(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g, (m) => {
    let y = m[3] ? +m[3] : today.getFullYear();
    if (m[3] && m[3].length === 2) y += 2000;
    if (y > 2400) y -= 543;
    return { d: new Date(y, +m[2] - 1, +m[1]), rank: 3 };
  });
  take(/วันที่\s*(\d{1,2})(?!\d)/g, (m) => ({ d: dayOfMonth(+m[1], today), rank: 2 }));
  take(/เมื่อวานซืน/g, () => ({ d: addDays(today, -2), rank: 1 }));
  take(/เมื่อวาน/g, () => ({ d: addDays(today, -1), rank: 1 }));
  take(/วันนี้/g, () => ({ d: today, rank: 1 }));
  return { rest, found };
}
// "วันที่ 12" = วันที่ 12 ของเดือนนี้ ถ้ายังไม่ถึงใช้เดือนก่อน
function dayOfMonth(n, today) {
  const d = new Date(today.getFullYear(), today.getMonth(), n);
  return d > today ? new Date(today.getFullYear(), today.getMonth() - 1, n) : d;
}

/* ---------- แกะ ---------- */
export function parseLog(text, { now = new Date(), cutoff = 5, spoken = false } = {}) {
  let s = String(text || '').replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50)).trim();
  if (spoken) s = normalizeSpoken(s);
  const out = { intent: 'none', entries: [], date: null, dateText: '', dateGuess: false, lateNight: false, dateError: null, note: '', fuelAmount: null, logish: LOGISH.test(s) };
  if (!s) return out;
  if (UNDO.test(s)) return { ...out, intent: 'undo', cancel: CANCEL.test(s) };
  if (CANCEL.test(s)) return { ...out, intent: 'cancel' };
  const hash = s.indexOf('#');
  if (hash >= 0) { out.note = s.slice(hash + 1).trim(); s = s.slice(0, hash).trim(); }

  const nums = s.match(/\d[\d,]*(?:\.\d+)?k?/gi) || [];
  if (CARD.test(s)) return { ...out, intent: 'card' };
  const gradeWord = /(^|\s)(91|95)(\s|$)/.test(s) && nums.length >= 2;
  if ((FUEL.test(s) || gradeWord) && nums.length) {
    // ราคาที่เติม = เลขตัวท้ายที่ไม่ใช่เกรดน้ำมัน (91/95/e20/e85)
    const clean = s.replace(/e(20|85)/gi, ' ').replace(/(^|\s)(91|95)(?=\s|$)/g, ' ');
    const money = (clean.match(/\d[\d,]*(?:\.\d+)?k?/gi) || []).map(toAmount).filter((n) => n > 0);
    return { ...out, intent: 'fuel', fuelAmount: money.length ? money[money.length - 1] : null };
  }
  if (OPEN.test(s) || QUESTION.test(s)) return { ...out, intent: 'question' };

  // วันที่ (คำบอกวันอยู่ตรงไหนก็ได้ ใช้กับทุกรายการ) · ขัดกันให้ใช้ตัวที่เจาะจงกว่าแล้วไฮไลต์
  const today = dayOnly(now);
  const picked = pickDate(s, now, cutoff);
  s = picked.rest;

  // รายรับ/รายจ่าย
  const income = /^\s*\+/.test(s) || INCOME.test(s);
  const type = income ? 'รายรับ' : 'รายจ่าย';
  s = s.replace(/^\s*[+-]\s*/, ' ').replace(/รายรับ|รายจ่าย/g, ' ').replace(/(^|\s)จด(?=\s|$)/g, ' ');

  // แยกคำ: เว้นวรรคระหว่างตัวเลขกับตัวอักษรไทย ("ข้าว60" → "ข้าว 60") ยกเว้นชื่อร้านที่มีเลข
  s = s.replace(/(\d)([ก-๙])/g, '$1 $2').replace(/([ก-๙])(\d)/g, '$1 $2');
  // จุลภาคคั่นรายการได้ ยกเว้นจุลภาคหลักพัน (1,200)
  let tokens = s.split(/\s+|,(?!\d{3}(?!\d))/).filter(Boolean);
  // วันที่แบบเลขเดี่ยวนำหน้า: "12 ส้มตำ 70" (เลข 1–31 ตามด้วยคำ แล้วมีจำนวนเงินทีหลัง)
  if (tokens.length >= 3 && /^\d{1,2}$/.test(tokens[0]) && +tokens[0] >= 1 && +tokens[0] <= 31
    && !AMOUNT.test(tokens[1]) && !CLASSIFIERS.test(tokens[1]) && tokens.slice(2).some((t) => AMOUNT.test(t) && !SHOP.test(t))) {
    picked.found.push({ d: dayOfMonth(+tokens[0], today), rank: 2 });
    tokens = tokens.slice(1);
  }

  // จับคู่ "คำ + เลข" · เลขหน้าลักษณนาม = ส่วนของชื่อ · คำท้ายสุดที่ไม่มีเลขตาม = ต่อท้ายรายการล่าสุด
  const entries = [];
  let words = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (BAHT.test(t)) continue;
    const isAmount = AMOUNT.test(t) && !SHOP.test(t) && !CLASSIFIERS.test(tokens[i + 1] || '');
    if (!isAmount) { words.push(t); continue; }
    const last = entries[entries.length - 1];
    if (!words.length && last && !last.item) continue; // เลขซ้ำติดกัน ใช้ตัวแรก
    entries.push({ item: cleanName(words), amount: toAmount(t), type });
    words = [];
  }
  if (words.length) {
    const last = entries[entries.length - 1];
    if (last) last.item = [last.item, cleanName(words)].filter(Boolean).join(' ');
  }
  if (!entries.length) return out;

  // สรุปวันที่
  if (picked.found.length) {
    picked.found.sort((a, b) => b.rank - a.rank);
    out.date = picked.found[0].d;
    out.dateGuess = new Set(picked.found.map((f) => iso(f.d))).size > 1;
  } else if (now.getHours() < cutoff) {
    // หลังเที่ยงคืนก่อนตี 5 (ค่าเริ่มต้น) ไม่ได้ระบุวัน = ของเมื่อวาน
    out.date = addDays(today, -1);
    out.dateGuess = true;
    out.lateNight = true;
  } else {
    out.date = today;
  }
  const back = daysBetween(out.date, today);
  if (back < 0) out.dateError = 'future';
  else if (back > MAX_BACK_DAYS) out.dateError = 'old';
  out.dateText = dateText(out.date, now);
  return { ...out, intent: 'entries', entries };
}

function toAmount(t) {
  const m = AMOUNT.exec(t) || /^(\d[\d,]*(?:\.\d+)?)(k)?$/i.exec(t);
  if (!m) return NaN;
  let n = Number(m[1].replace(/,/g, ''));
  if (m[2]) n *= 1000;
  return Math.round(n * 100) / 100;
}

// ตัดคำนำหน้า "จ่าย" / "ซื้อ" (เก็บ "ค่า" ไว้ในชื่อ เช่น ค่าจอดรถ)
function cleanName(words) {
  const w = words.filter((x) => x !== '-' && x !== 'ได้');
  if (w.length) w[0] = w[0].replace(/^(จ่าย|ซื้อ)/, '');
  return w.filter(Boolean).join(' ').trim();
}
