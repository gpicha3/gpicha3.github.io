// ตัวละครของน้องอัล: ลูกบอลไล่สี + ตาสีขาว · 1 ห้องแชต = 1 ตัว (general / money / projects)
// ตั้งค่าได้ที่หน้าตั้งค่าของ Alpha (สี · ดวงตา · ลอย · กะพริบ)
// เก็บที่ localStorage "alpha.character" (เครื่องนี้) และส่งไปเก็บบน PC (repo alpha → data/character.json)
// ผ่าน /api/character ให้หน้าแชตใช้ค่าเดียวกัน · PC ปิดอยู่ก็ยังใช้ค่าบนเครื่องได้
// หน้าแชต (repo alpha → app/bot.js) มีตารางสี/ตาชุดเดียวกัน ถ้าแก้ตรงนี้ให้แก้ที่นั่นด้วย

export const KEY = 'alpha.character';
export const ROOMS = [
  { id: 'general', name: 'ทั่วไป', desc: 'คุยทุกเรื่อง' },
  { id: 'money', name: 'การเงิน', desc: 'งบ · ผ่อน · จด' },
  { id: 'projects', name: 'โปรเจกต์', desc: 'โค้ด · ไอเดีย' },
];
// [ชื่อ, ไฮไลต์, สีหลัก, สีรอง, สีล่าง]
export const PALETTES = [
  ['ชมพูม่วง', '#F9A8D4', '#C026D3', '#8B5CF6', '#FB923C'],
  ['มรกต', '#A7F3D0', '#059669', '#14B8A6', '#FACC15'],
  ['ฟ้าคราม', '#BAE6FD', '#4F46E5', '#22D3EE', '#A78BFA'],
  ['พีช', '#FED7AA', '#F97316', '#F43F5E', '#FDE047'],
  ['ลาเวนเดอร์', '#E9D5FF', '#7C3AED', '#C084FC', '#60A5FA'],
  ['มินต์', '#CCFBF1', '#0EA5E9', '#2DD4BF', '#818CF8'],
];
export const EYES = {
  round: { name: 'กลม', svg: '<circle cx="35" cy="47" r="10.5"/><circle cx="65" cy="47" r="10.5"/>' },
  oval: { name: 'รี', svg: '<ellipse cx="35" cy="47" rx="8" ry="13"/><ellipse cx="65" cy="47" rx="8" ry="13"/>' },
  smile: { name: 'ยิ้ม', svg: '<path d="M24 52q11-16 22 0M54 52q11-16 22 0" style="fill:none;stroke:#fff;stroke-width:7.5;stroke-linecap:round"/>' },
};
export const DEFAULTS = {
  general: { p: 0, e: 'round' },
  money: { p: 1, e: 'round' },
  projects: { p: 2, e: 'round' },
  float: true,
  blink: true,
};

const clean = (c) => {
  const out = { float: c?.float !== false, blink: c?.blink !== false, at: Number(c?.at) || 0 };
  for (const r of ROOMS) {
    const v = c?.[r.id] || {};
    out[r.id] = {
      p: Number.isInteger(v.p) && PALETTES[v.p] ? v.p : DEFAULTS[r.id].p,
      e: EYES[v.e] ? v.e : DEFAULTS[r.id].e,
    };
  }
  return out;
};

export function load() {
  try { return clean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return clean(null); }
}
export function save(cfg, { touch = true } = {}) {
  const c = clean(cfg);
  if (touch) c.at = Date.now(); // เวลาแก้ล่าสุด: ใช้ตัดสินว่าค่าบนเครื่องหรือบน PC ใหม่กว่า
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage unavailable */ }
  return c;
}

// HTML ของตัวละคร 1 ตัว · cls เพิ่มคลาสขนาด/ตำแหน่ง เช่น "me-bot float"
export function bot(room, cfg = load(), cls = '') {
  const c = cfg[room] || DEFAULTS[room] || DEFAULTS.general;
  const p = PALETTES[c.p];
  return `<span class="bot ${cls}" data-room="${room}" style="--b1:${p[1]};--b2:${p[2]};--b3:${p[3]};--b4:${p[4]}" aria-hidden="true"><svg class="eyes" viewBox="0 0 100 100">${EYES[c.e].svg}</svg></span>`;
}
// ลอย/กะพริบ ปิดได้ทั้งแอป (คลาสบน <html>)
export function applyMotion(cfg = load()) {
  document.documentElement.classList.toggle('no-float', !cfg.float);
  document.documentElement.classList.toggle('no-blink', !cfg.blink);
}
// เปลี่ยนตัวละครที่แสดงอยู่ในหน้าแล้วทั้งหมด (หลังแก้ค่าที่หน้าตั้งค่า)
export function refreshAll(cfg = load()) {
  document.querySelectorAll('.bot[data-room]').forEach((el) => {
    const tmp = document.createElement('span');
    tmp.innerHTML = bot(el.dataset.room, cfg, [...el.classList].filter((k) => k !== 'bot').join(' '));
    el.replaceWith(tmp.firstElementChild);
  });
  applyMotion(cfg);
}

// ---------- เก็บบน PC (repo alpha) ----------
// ที่อยู่ PC มาจากหน้าแชต (localStorage "chat.url" เช่น https://pc.xxx.ts.net/app/) → /api/character
export function pcApi(path) {
  let u = '';
  try { u = localStorage.getItem('chat.url') || ''; } catch { /* ignore */ }
  if (!u) return null;
  try { return new URL(`/api/${path}`, u).href; } catch { return null; }
}
// ส่งค่าไปเก็บบน PC (text/plain = ไม่ต้องมี preflight) · PC ปิด = เก็บแค่บนเครื่องไปก่อน
export async function pushToPc(cfg) {
  const url = pcApi('character');
  if (!url) return false;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(clean(cfg)) });
    return r.ok;
  } catch { return false; }
}
// ซิงก์กับ PC: ค่าไหนแก้ทีหลังใช้ค่านั้น (PC ใหม่กว่า = จำไว้บนเครื่อง · เครื่องใหม่กว่า = ส่งขึ้น PC) · คืนค่าที่ใช้ตอนนี้
export async function syncWithPc() {
  const url = pcApi('character');
  if (!url) return null;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const remote = clean(await r.json());
    const local = load();
    if (remote.at > local.at) return save(remote, { touch: false });
    if (local.at > remote.at) pushToPc(local);
    return local;
  } catch { return null; }
}
