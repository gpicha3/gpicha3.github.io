'use strict';
// ธีมสีของ Alpha — โหลดใน <head> (script ธรรมดา) เพื่อใส่สีก่อนหน้าเว็บแสดงผล ไม่มีจอกะพริบ
// เก็บใน localStorage key เดียว: "alpha.theme" = รหัสธีม (JSON string) เช่น "aurora"
// fuel-logger และ finance-app อ่าน key เดียวกันใน theme.js ของตัวเอง แล้วเลือกชุดสีที่ใกล้ที่สุดของแอป
//   (ตาราง apps ด้านล่าง — ถ้าแก้ชื่อธีมที่นี่ ต้องแก้ตาราง ALPHA_THEME ในแอปทั้งสองด้วย)
(function (root) {
  const KEY = 'alpha.theme';
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

  function get() {
    try { const id = JSON.parse(localStorage.getItem(KEY) || 'null'); return THEMES[id] ? id : DEFAULT; } catch { return DEFAULT; }
  }

  function apply(id) {
    const t = THEMES[id] || THEMES[DEFAULT];
    const s = document.documentElement.style;
    const vars = { bg: t.bg, ink: t.ink, lav: t.lav, dim: t.dim, vi: t.vi, pk: t.pk, g1: t.g1, g2: t.g2, g3: t.g3, halo: t.halo, shirt: t.shirt,
      'core-a': t.core[0], 'core-b': t.core[1], 'core-c': t.core[2] };
    Object.entries(vars).forEach(([k, v]) => s.setProperty(`--${k}`, v));
    document.documentElement.dataset.alphaTheme = id;
    // แถบสถานะ/พื้นหลังของระบบให้ตรงกับพื้นหลัง (กันขอบสีต่างตอนโหลด)
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t.bg;
  }

  function set(id) {
    if (!THEMES[id]) return;
    try { localStorage.setItem(KEY, JSON.stringify(id)); } catch { /* storage unavailable */ }
    apply(id);
  }

  root.AlphaTheme = { KEY, DEFAULT, THEMES, get, set, apply };
  apply(get());
})(globalThis);
