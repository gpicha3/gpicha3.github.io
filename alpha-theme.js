'use strict';
// ธีมของ Alpha — โหลดใน <head> (script ธรรมดา) เพื่อใส่สีก่อนหน้าเว็บแสดงผล ไม่มีจอกะพริบ
// ใช้ร่วมกันทั้ง 3 แอป (Alpha, fuel-logger, finance-app โหลดไฟล์นี้จาก /alpha-theme.js)
// localStorage (ตั้งค่าที่หน้าตั้งค่าของ Alpha ที่เดียว):
//   "alpha.theme" = รหัสธีม เช่น "aurora" หรือ "time" (เปลี่ยนตามเวลา)
//   "alpha.mode"  = "auto" | "light" | "dark"
//   "alpha.lang"  = "th" | "en" (ภาษาในแอป Fuel Logger / Finance)
(function (root) {
  const KEY = 'alpha.theme';
  const MODE_KEY = 'alpha.mode';
  const LANG_KEY = 'alpha.lang';
  const DEFAULT = 'aurora';
  const THEMES = {
    aurora: {
      name: 'Aurora', bg: '#07040f', ink: '#f4efff', lav: '#c7b8ea', dim: '#9a8fb8', vi: '#b48cff', pk: '#ff5fbf',
      g1: 'rgba(106,43,255,.55)', g2: 'rgba(255,63,180,.30)', g3: 'rgba(43,107,255,.28)', halo: 'rgba(192,77,255,.55)',
      core: ['#ffc4f2', '#c04dff', '#3b1d9e'], shirt: '#b07cff', apps: { fuel: 'lavender', finance: 'lavender' },
    },
    ocean: {
      name: 'Ocean', bg: '#03101a', ink: '#eaf8ff', lav: '#a9d6ea', dim: '#7fa9bd', vi: '#5fd4ff', pk: '#3cf0c8',
      g1: 'rgba(0,140,255,.5)', g2: 'rgba(0,220,200,.28)', g3: 'rgba(60,90,255,.28)', halo: 'rgba(60,190,255,.5)',
      core: ['#c4f3ff', '#2fb6f0', '#0d3f8a'], shirt: '#4fb8e8', apps: { fuel: 'sky', finance: 'sky' },
    },
    sunset: {
      name: 'Sunset', bg: '#120608', ink: '#fff0ea', lav: '#f0c3b4', dim: '#c4958a', vi: '#ff9a5c', pk: '#ff5f9a',
      g1: 'rgba(255,110,60,.45)', g2: 'rgba(255,60,140,.3)', g3: 'rgba(255,180,60,.22)', halo: 'rgba(255,120,80,.5)',
      core: ['#ffe0c4', '#ff7a45', '#8a1f3a'], shirt: '#ff8a5c', apps: { fuel: 'peach', finance: 'peach' },
    },
    forest: {
      name: 'Forest', bg: '#04100a', ink: '#ecfff3', lav: '#b2e0c4', dim: '#84b096', vi: '#6fe3a0', pk: '#c6f06a',
      g1: 'rgba(40,190,110,.45)', g2: 'rgba(170,230,80,.22)', g3: 'rgba(30,140,160,.25)', halo: 'rgba(80,220,140,.45)',
      core: ['#d6ffe4', '#36c47a', '#0f5a3a'], shirt: '#5fcb8a', apps: { fuel: 'sage', finance: 'mint' },
    },
    rose: {
      name: 'Rose', bg: '#12060c', ink: '#ffeef5', lav: '#f0bcd2', dim: '#c08ea5', vi: '#ff7aae', pk: '#ffb27a',
      g1: 'rgba(255,80,150,.42)', g2: 'rgba(255,170,120,.25)', g3: 'rgba(170,80,255,.22)', halo: 'rgba(255,100,160,.5)',
      core: ['#ffd6e8', '#f0478d', '#7a1a4a'], shirt: '#f27fa8', apps: { fuel: 'pink', finance: 'pink' },
    },
    mono: {
      name: 'Mono', bg: '#0a0a0b', ink: '#f4f4f5', lav: '#c4c4cc', dim: '#8d8d96', vi: '#e4e4ea', pk: '#9a9aa6',
      g1: 'rgba(180,180,200,.18)', g2: 'rgba(120,120,140,.14)', g3: 'rgba(90,90,110,.16)', halo: 'rgba(220,220,235,.3)',
      core: ['#ffffff', '#b8b8c4', '#3a3a44'], shirt: '#b9b9c2', apps: { fuel: 'gray', finance: 'black' },
    },
  };
  // ธีมตามเวลา: เช้า-บ่าย Ocean · เย็น Sunset · ค่ำ-ดึก Aurora
  function themeForTime(d = new Date()) {
    const h = d.getHours();
    return h >= 6 && h < 16 ? 'ocean' : h >= 16 && h < 19 ? 'sunset' : 'aurora';
  }

  const read = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? fb; } catch { return fb; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

  // รหัสที่ผู้ใช้เลือก (อาจเป็น "time") / ธีมจริงที่ใช้ตอนนี้
  const choice = () => { const id = read(KEY, DEFAULT); return id === 'time' || THEMES[id] ? id : DEFAULT; };
  const get = () => { const c = choice(); return c === 'time' ? themeForTime() : c; };
  const mode = () => { const m = read(MODE_KEY, 'auto'); return ['auto', 'light', 'dark'].includes(m) ? m : 'auto'; };
  const isDark = () => { const m = mode(); return m === 'dark' || (m === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); };
  const lang = () => (read(LANG_KEY, null) === 'en' ? 'en' : read(LANG_KEY, null) === 'th' ? 'th' : null);

  function mixHex(a, b, w) {
    const c = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    return `#${[0, 1, 2].map((i) => Math.round(c(a, i) * w + c(b, i) * (1 - w)).toString(16).padStart(2, '0')).join('')}`;
  }
  // พื้นหลังโหมดสว่าง = สีหลักของธีมจาง ๆ บนขาว (ใช้กับ meta theme-color ด้วย)
  const lightBg = (t) => mixHex(t.vi, '#fbfaff', 0.1);

  function apply() {
    const id = get();
    const t = THEMES[id];
    const el = document.documentElement;
    const s = el.style;
    const dark = isDark();
    const vars = { vi: t.vi, pk: t.pk, g1: t.g1, g2: t.g2, g3: t.g3, halo: t.halo, shirt: t.shirt,
      'core-a': t.core[0], 'core-b': t.core[1], 'core-c': t.core[2],
      'bg-dark': t.bg, 'ink-dark': t.ink, 'lav-dark': t.lav, 'dim-dark': t.dim, 'bg-light': lightBg(t) };
    Object.entries(vars).forEach(([k, v]) => s.setProperty(`--${k}`, v));
    el.dataset.alphaTheme = id;
    el.dataset.alphaMode = dark ? 'dark' : 'light';
    // แถบสถานะ/พื้นหลังของระบบให้ตรงกับพื้นหลัง (กันขอบสีต่างตอนโหลด)
    const meta = document.querySelector('meta[name="theme-color"]:not([media])') || document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? t.bg : lightBg(t);
    const sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (sb) sb.content = dark ? 'black-translucent' : 'default';
  }

  function set(id) { if (id === 'time' || THEMES[id]) { write(KEY, id); apply(); } }
  function setMode(m) { if (['auto', 'light', 'dark'].includes(m)) { write(MODE_KEY, m); apply(); } }
  function setLang(l) { if (l === 'th' || l === 'en') write(LANG_KEY, l); }

  root.AlphaTheme = { KEY, MODE_KEY, LANG_KEY, DEFAULT, THEMES, themeForTime, choice, get, mode, isDark, lang, set, setMode, setLang, apply };
  apply();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
  // ธีมตามเวลา: เช็กทุกครั้งที่กลับมาเปิดแอป
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && choice() === 'time') apply(); });
})(globalThis);
