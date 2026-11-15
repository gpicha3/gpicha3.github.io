// Hub: หน้าแรก + หน้าซิงก์ + หน้ารายงาน + ช่องสั่งงาน
import APPS from './config.js';
import { runCommand } from './commands.js';
import { M, greeting } from './messages.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CACHE_KEY = 'hub.cache.v1';     // ผลสรุปล่าสุดของแต่ละแอป (เปิดแล้วเห็นทันที)
const SYNC_SEEN = 'hub.syncShown';    // sessionStorage: แสดงหน้าซิงก์ครั้งเดียวต่อการเปิดแอป
const TIMEOUT = 20000;
const LEVEL_RANK = { urgent: 0, soon: 1, info: 2 };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CHEV = '<svg class="chev" viewBox="0 0 8 14"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>';

const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
};

// การตั้งค่าของ Alpha (ที่เดียว): paceMin = แจ้ง "ใช้เร็วกว่าแผน" เมื่อเกินกี่บาท
// tightPerDay / overMid / overHigh = เกณฑ์เลือกประโยคสรุปค่ากิน (ดู speechMoney)
const SETTINGS_KEY = 'alpha.settings';
const DEFAULT_SETTINGS = { paceMin: 100, morningBrief: true, tightPerDay: 200, overMid: 300, overHigh: 1000 };
const settings = { ...DEFAULT_SETTINGS, ...store.get(SETTINGS_KEY, {}) };
const saveSettings = () => store.set(SETTINGS_KEY, settings);

// สถานะของแต่ละแอป: loading | ok | setup | error  (+ summary ล่าสุดจาก cache ถ้ามี)
const cache = store.get(CACHE_KEY, {});
const results = {};
for (const a of APPS) {
  if (!a.summary) continue;
  const c = cache[a.id];
  results[a.id] = { status: 'loading', summary: c?.summary || null, at: c?.at || null, error: null };
}
let syncing = false;
let syncedAt = null;

/* ---------- เวลา / ข้อความ ---------- */
const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function ago(ts) {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? 'เมื่อสักครู่' : m < 60 ? `${m} นาทีที่แล้ว` : m < 1440 ? `${Math.round(m / 60)} ชม.ที่แล้ว` : `${Math.round(m / 1440)} วันที่แล้ว`;
}
const clock = (d) => d.toTimeString().slice(0, 8);

/* ---------- แจ้งเตือนรวม ---------- */
function allAlerts() {
  const out = [];
  for (const a of APPS) {
    const r = results[a.id];
    if (!r?.summary || r.status === 'setup') continue;
    for (const al of r.summary.alerts || []) {
      if (al.kind === 'pace' && (Number(al.amount) || 0) < settings.paceMin) continue;
      out.push({ ...al, app: a });
    }
  }
  return out.sort((x, y) => (LEVEL_RANK[x.level] ?? 3) - (LEVEL_RANK[y.level] ?? 3)
    || String(x.dueDate || '9999').localeCompare(String(y.dueDate || '9999')));
}

/* ---------- หน้าแรก ---------- */
function renderHome() {
  const now = new Date();
  $('#hudDate').textContent = `${TH_DAYS[now.getDay()]} ${now.getDate()} ${TH_MONTHS[now.getMonth()]}`;
  $('#greet').textContent = greeting(now);

  const live = $('#liveState');
  const anyError = Object.values(results).some((r) => r.status === 'error');
  live.className = `live${syncing ? ' warn' : anyError ? ' bad' : ''}`;
  live.querySelector('b').textContent = `ALPHA · ${syncing ? 'SYNCING' : anyError ? 'PARTIAL' : 'ONLINE'}`;

  const alerts = allAlerts();
  const urgent = alerts.filter((a) => a.level === 'urgent').length;
  const soon = alerts.filter((a) => a.level === 'soon').length;
  const hasData = Object.values(results).some((r) => r.summary);
  const H = M.headline;
  $('#headline').disabled = !hasData;
  $('#headline').innerHTML = urgent ? `<b class="u">${esc(H.urgent(urgent))}</b>${soon ? `${esc(H.join)}<b class="s">${esc(H.soon(soon))}</b>` : ''}`
    : soon ? `<b class="s">${esc(H.soon(soon))}</b>`
      : esc(!hasData && syncing ? H.loading : hasData ? H.allGood : H.noData);
  if (hasData) $('#headline').insertAdjacentHTML('beforeend', PLAY);

  // ป้ายแจ้งเตือน: อันแรกเด่น + อีกไม่เกิน 2 อัน + ดูทั้งหมด
  const top = alerts.slice(0, 3);
  if (!top.length) $('#alerts').innerHTML = '';
  else {
    const [first, ...rest] = top;
    // รายการที่รวมหลายงวด (items) แตะแล้วกางรายการย่อย แทนการเปิดลิงก์
    const tag = (a, cls, inner) => (a.items?.length
      ? `<button type="button" class="${cls}" data-toggle aria-expanded="false">${inner}</button>${subList(a)}`
      : `<a class="${cls}" href="${esc(a.link || a.app.path)}">${inner}</a>`);
    $('#alerts').innerHTML = `<div class="glass al-card">
      ${tag(first, 'al-main', `<span class="al-ic ${first.level}" aria-hidden="true">💁🏻‍♀️</span>
        <span class="al-text"><b>${esc(first.text)}</b><small>${esc(first.app.name)}</small></span>${first.items?.length ? CARET : CHEV}`)}
      ${rest.map((a) => tag(a, 'al-row', `<span class="dot ${a.level}"></span><span>${esc(a.text)}</span><small>${esc(a.app.name)}</small>${a.items?.length ? CARET : ''}`)).join('')}
      ${alerts.length > 1 ? `<button type="button" class="al-more" data-report>${esc(M.seeAll(alerts.length))}</button>` : ''}
    </div>`;
  }

  $('#apps').innerHTML = APPS.map(appCard).join('');
}

const PLAY = '<svg class="play" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>';
const CARET = '<svg class="caret" viewBox="0 0 14 8"><path d="M1.5 1.5L7 6.5l5.5-5"/></svg>';
function subList(a) {
  return `<div class="al-sub" hidden>${a.items.map((it) => `<a href="${esc(it.link || a.link || a.app.path)}"><span>${esc(it.text)}</span>${CHEV}</a>`).join('')}</div>`;
}

function appCard(a) {
  const icon = `<img src="${esc(a.icon)}" alt="" width="22" height="22" loading="lazy">`;
  if (!a.summary) {
    return `<a class="glass app wide" href="${esc(a.path)}"><span class="app-name">${icon}<span>${esc(a.name)}<small>${esc(a.desc)}</small></span></span>${CHEV}</a>`;
  }
  const r = results[a.id];
  if (r.status === 'setup') return offlineCard(a, M.card.notSetTitle, M.card.notSetSub);
  if (r.status === 'error' && !r.summary) return offlineCard(a, M.card.errorTitle, r.error === 'unauthorized' ? M.card.errorBadToken : M.card.errorOther);
  const s = r.summary;
  if (!s) {
    return `<a class="glass app" href="${esc(a.path)}"><span class="app-name" style="color:${esc(a.color)}">${icon}${esc(a.name)}</span>
      <span class="sk" style="height:30px;width:70%;margin-top:14px"></span><span class="sk" style="height:10px;width:85%;margin-top:9px"></span></a>`;
  }
  const [main, ...more] = s.stats || [];
  const title = s.title || a.name;
  const meta = r.status === 'error' ? `<div class="app-meta err mono">OFFLINE · ${esc(ago(r.at))}</div>`
    : r.status === 'loading' ? `<div class="app-meta mono">SYNCING…</div>`
      : `<div class="app-meta mono">${esc(M.card.updated(ago(r.at)))}</div>`;
  return `<a class="glass app" href="${esc(a.path)}">
    <span class="app-name" style="color:${esc(a.color)}">${icon}<span class="nm">${esc(title)}</span></span>
    ${main ? `<div class="app-big">${esc(main.value)}<small> ${esc(main.unit)}</small></div><div class="app-sub">${esc(main.label)}${more[0] ? ` · ${esc(more[0].value)} ${esc(more[0].unit)}` : ''}</div>` : ''}
    ${meta}</a>`;
}

function offlineCard(a, title, sub) {
  return `<a class="glass app offline" href="${esc(a.setupLink || a.path)}">
    <div class="tag mono">● MODULE OFFLINE</div>
    <div class="row"><div><b>${esc(a.name)} · ${esc(title)}</b><small>${esc(sub)}</small></div><span class="pill">${esc(M.card.setupButton)}</span></div></a>`;
}

/* ---------- หน้าซิงก์ ---------- */
function renderSync() {
  const list = APPS.filter((a) => a.summary);
  const done = list.filter((a) => results[a.id].status !== 'loading').length;
  $('#syncCount').textContent = `LINK ${done}/${list.length}`;
  const label = (a) => a.id.toUpperCase().replace(/-APP$/, '').replace(/-/g, '.');
  const dots = (s) => '.'.repeat(Math.max(3, 20 - s.length));
  $('#syncLog').innerHTML = APPS.map((a) => {
    const name = label(a);
    if (!a.summary) return `<div><span class="mute">·</span> ${esc(name)} ${dots(name)} <span class="mute">NO SUMMARY</span></div>`;
    const st = results[a.id].status;
    if (st === 'loading') return `<div><span class="run">›</span> ${esc(name)} ${dots(name)} <span class="run">LINKING</span></div><div class="bar"><i></i></div>`;
    if (st === 'ok') return `<div><span class="ok">✓</span> ${esc(name)} ${dots(name)} <span class="ok">SYNCED</span></div>`;
    if (st === 'setup') return `<div><span class="bad">✕</span> ${esc(name)} ${dots(name)} <span class="bad">NOT SET</span></div>`;
    return `<div><span class="bad">✕</span> ${esc(name)} ${dots(name)} <span class="bad">OFFLINE</span></div>`;
  }).join('');
  const hasCache = Object.values(results).some((r) => r.at);
  const newest = Math.max(0, ...Object.values(results).map((r) => r.at || 0));
  $('#syncSub').textContent = hasCache ? M.sync.cached(ago(newest)) : M.sync.fresh;
  $('#syncIssues').innerHTML = list.filter((a) => results[a.id].status === 'setup' || (results[a.id].status === 'error' && !results[a.id].summary)).map(appCard).join('');
}

function showSync() {
  const el = $('#sync');
  el.hidden = false;
  el.classList.remove('closing');
  renderSync();
}
function hideSync() {
  const el = $('#sync');
  if (el.hidden || el.classList.contains('closing')) return;
  session.set(SYNC_SEEN, '1');
  el.classList.add('closing');
  setTimeout(() => { el.hidden = true; el.classList.remove('closing'); }, reduceMotion ? 0 : 400);
}

/* ---------- โหลดสรุปจากทุกแอป (ขนาน) ---------- */
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function loadOne(a) {
  const r = results[a.id];
  r.status = 'loading';
  try {
    const mod = await import(a.summary);
    const s = await withTimeout(mod.getSummary(), TIMEOUT);
    if (s?.needsSetup) { r.status = 'setup'; r.summary = null; delete cache[a.id]; }
    else {
      r.status = 'ok'; r.summary = s; r.at = Date.now(); r.error = null;
      cache[a.id] = { summary: s, at: r.at };
    }
    store.set(CACHE_KEY, cache);
  } catch (err) {
    console.error(`[hub] ${a.id}`, err);
    r.status = 'error';
    r.error = err?.message || 'failed';
  }
  renderHome();
  if (!$('#sync').hidden) renderSync();
}

async function refresh() {
  if (syncing) return;
  syncing = true;
  const started = performance.now();
  for (const a of APPS) if (a.summary) results[a.id].status = 'loading';
  renderHome();
  if (!$('#sync').hidden) renderSync();
  await Promise.allSettled(APPS.filter((a) => a.summary).map(loadOne));
  syncing = false;
  syncedAt = new Date();
  renderHome();
  // เปิดหน้ารายงานค้างไว้ระหว่างซิงก์ → อัปเดตด้วยข้อมูลใหม่
  if (!$('#report').hidden) renderReport();
  morningBrief();
  if (!$('#sync').hidden) {
    renderSync();
    // ถ้ามีแอปที่ต้องตั้งค่า ค้างหน้าซิงก์ไว้นานขึ้นนิดให้เห็น แล้วค่อยเข้าหน้าแรก
    const issues = Object.values(results).some((r) => r.status !== 'ok');
    const wait = Math.max(0, (issues ? 1800 : 900) - (performance.now() - started));
    setTimeout(hideSync, wait);
  }
}

/* ---------- หน้ารายงาน ---------- */
let typingTimer = null;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const int = (n) => Math.round(Number(n) || 0).toLocaleString('th-TH');
const factsOf = (id) => (results[id]?.status !== 'setup' && results[id]?.summary?.facts) || null;

// ค่ากิน: A ยังสบาย · B ใช้ได้ต่อวันต่ำกว่าเกณฑ์ · เกินงบ C (เบา) / D (เกิน ≥ overMid) / E (เกิน ≥ overHigh หรือรอบก่อนก็เกิน)
function speechMoney(f) {
  if (!f || !Number.isFinite(f.left)) return null;
  const v = { left: int(f.left), perDay: int(f.perDay), daysToPayday: f.days, over: int(f.over) };
  const S = M.speech;
  if (f.over > 0) {
    const lvl = f.over >= settings.overHigh || f.prevOver ? 'E' : f.over >= settings.overMid ? 'D' : 'C';
    return pick(S[lvl])(v);
  }
  return pick(f.perDay >= settings.tightPerDay ? S.A : S.B)(v);
}

// เรื่องที่ประโยคพูดครอบคลุมแล้ว ไม่ต้องแสดงซ้ำ (ค่ากิน · งวดผ่อน · เงินเดือนเข้า · น้ำมันใกล้หมด)
function coveredBySpeech(a, money, fuel) {
  if (a.app.id === 'finance-app') return money != null && (a.kind === 'pace' || a.kind === 'installment' || /งบ|เงินเดือน/.test(a.text));
  if (a.app.id === 'fuel-logger') return fuel && /น้ำมัน/.test(a.text);
  return false;
}

let lastLines = [];
function reportLines() {
  const S = M.speech;
  const fin = factsOf('finance-app');
  const fuel = factsOf('fuel-logger');
  const finApp = APPS.find((a) => a.id === 'finance-app');
  const fuelApp = APPS.find((a) => a.id === 'fuel-logger');
  const lines = [];
  const say = (text, link) => text && lines.push({ html: `&gt; ${esc(text)}`, text, link });

  // 1) ค่ากิน + วันเงินเดือนเข้า  2) ค่างวด  3) รถ — ไม่มีข้อมูลก็ข้าม
  const money = speechMoney(fin);
  say(money, finApp && `${finApp.path}#today`);
  if (fin?.install) say(pick(S.install)({ installDays: fin.install.days, installCount: fin.install.count, installTotal: int(fin.install.total) }), finApp && `${finApp.path}#loans`);
  const carLow = !!fuel?.fuelLow;
  if (carLow) say(pick(S.car)({ kmPerL: fuel.kmPerL ? Math.round(fuel.kmPerL) : '–' }), fuelApp && `${fuelApp.path}#add`);

  // เรื่องอื่นที่ยังไม่ได้พูด (เช่น เช็กระยะ ต่อภาษี งวดสุดท้าย)
  for (const a of allAlerts()) {
    if (coveredBySpeech(a, money, carLow)) continue;
    const group = a.items?.length ? a.items : null;
    lines.push({ html: `&gt; ${esc(a.text)}${group ? ' <span class="go">▾</span>' : ''}`, text: a.text, link: group ? null : a.link || a.app.path, toggle: !!group });
    if (group) for (const it of group) lines.push({ html: `<span class="go">└</span> ${esc(it.text)}`, link: it.link || a.link || a.app.path, sub: true });
  }
  for (const a of APPS) {
    const r = results[a.id];
    if (r?.status === 'setup') lines.push({ html: `&gt; <span class="i">${esc(M.report.notSet(a.name))}</span>`, text: M.report.notSet(a.name), link: a.setupLink || a.path });
  }
  if (!lines.length) lines.push({ html: `&gt; ${esc(M.report.empty)}`, text: M.report.empty });
  lastLines = lines;
  return lines;
}

function renderReport() {
  const anyError = Object.values(results).some((r) => r.status === 'error');
  $('#rpState').textContent = syncing ? 'SYNCING' : anyError ? 'PARTIAL' : 'ONLINE';
  const ts = syncedAt || new Date();
  const lines = reportLines();
  $('#rpBody').innerHTML = `<div class="ts">[${clock(ts)}] ${syncing ? 'syncing…' : 'sync complete'}</div>
    <div class="hello">${esc(M.report.intro(greeting()))}</div>
    ${lines.map((l, i) => (l.toggle
      ? `<button type="button" class="rp-line" data-toggle-sub aria-expanded="false" data-i="${i}"><span class="tx">${l.html}</span></button>`
      : l.link
        ? `<a class="rp-line${l.sub ? ' rp-sub' : ''}" href="${esc(l.link)}" data-i="${i}"${l.sub ? ' hidden' : ''}><span class="tx">${l.html}</span></a>`
        : `<div class="rp-line" data-i="${i}"><span class="tx">${l.html}</span></div>`)).join('')}
    <span class="cursor"></span>`;
  typeLines();
  return lines;
}

// พิมพ์ทีละบรรทัด (ตัดตามตัวอักษรไทยแบบ grapheme เพื่อไม่ให้สระลอย)
function typeLines() {
  clearInterval(typingTimer);
  if (reduceMotion) return;
  const nodes = [...document.querySelectorAll('#rpBody .tx')];
  const seg = 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
  const jobs = nodes.map((n) => {
    const html = n.innerHTML;
    const text = n.textContent;
    n.textContent = '';
    n.parentElement.style.visibility = 'hidden';
    return { n, html, chars: seg ? [...seg.segment(text)].map((s) => s.segment) : [...text] };
  });
  let j = 0, k = 0;
  typingTimer = setInterval(() => {
    const job = jobs[j];
    if (!job) { clearInterval(typingTimer); return; }
    job.n.parentElement.style.visibility = '';
    k += 3;
    if (k >= job.chars.length) { job.n.innerHTML = job.html; j++; k = 0; }
    else job.n.textContent = job.chars.slice(0, k).join('');
  }, 22);
}

function openReport({ push = true } = {}) {
  const el = $('#report');
  if (!el.hidden) return;
  el.hidden = false;
  el.scrollTop = 0;
  renderReport();
  reportPushed = push;
  if (push) history.pushState({ report: true }, '', '#report');
}
let reportPushed = false;
function closeReport({ pop = true } = {}) {
  const el = $('#report');
  if (el.hidden) return;
  stopSpeaking();
  clearInterval(typingTimer);
  el.classList.add('closing');
  setTimeout(() => { el.hidden = true; el.classList.remove('closing'); }, reduceMotion ? 0 : 400);
  if (pop && location.hash === '#report') {
    if (reportPushed) history.back();
    else history.replaceState(null, '', location.pathname);
  }
}
window.addEventListener('popstate', () => { if (location.hash !== '#report') closeReport({ pop: false }); });

/* ---------- เสียง ---------- */
const canSpeak = 'speechSynthesis' in window;
// เสียงผู้หญิงภาษาไทย: Kanya (iPhone/Mac), Narisa / Premwadee (Windows), Google ภาษาไทย (Android/Chrome)
const FEMALE_TH = /kanya|narisa|premwadee|google|female|ผู้หญิง/i;
const MALE_TH = /pattara|niwat|male(?!.*female)/i;
function thaiVoice() {
  const th = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('th'));
  return th.find((v) => FEMALE_TH.test(v.name)) || th.find((v) => !MALE_TH.test(v.name)) || th[0] || null;
}
if (canSpeak) speechSynthesis.getVoices(); // iPhone โหลดรายชื่อเสียงช้า เรียกไว้ก่อน
// โหมดเสียง: device = เสียงในเครื่อง, siri = ส่งข้อความให้คำสั่งลัดใน iPhone อ่านด้วยเสียง Siri
const VOICE_KEY = 'hub.voice';
let voiceMode = store.get(VOICE_KEY, 'device') === 'siri' ? 'siri' : 'device';

// แปลงข้อความให้อ่านออกเสียงลื่นขึ้น เช่น ฿1,500 → 1,500 บาท, กม./ล. → กิโลเมตรต่อลิตร
function sayable(text) {
  return String(text)
    .replace(/฿\/กม\./g, 'บาทต่อกิโลเมตร')
    .replace(/กม\.\/ล\./g, 'กิโลเมตรต่อลิตร')
    .replace(/กม\./g, 'กิโลเมตร')
    .replace(/฿\s?([\d,.]+)/g, '$1 บาท')
    .replace(/~/g, 'ประมาณ ')
    .replace(/\s*·\s*/g, ', ')
    .replace(/[<>]/g, '');
}

function speakWithShortcut(text) {
  const q = new URLSearchParams({ name: M.voice.shortcutName, input: 'text', text });
  location.href = `shortcuts://run-shortcut?${q.toString().replace(/\+/g, '%20')}`;
}

function speak(raw, onEnd) {
  const text = sayable(raw || '');
  if (!text) return;
  if (voiceMode === 'siri') { speakWithShortcut(text); setTimeout(() => onEnd?.(), 1500); return; }
  if (!canSpeak) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'th-TH';
  const voice = thaiVoice();
  if (voice) u.voice = voice;
  u.rate = 1.02;
  setSpeaking(true);
  u.onboundary = () => {
    const a = $('#alpha');
    a.classList.add('bump');
    setTimeout(() => a.classList.remove('bump'), 120);
  };
  u.onend = u.onerror = () => { setSpeaking(false); onEnd?.(); };
  speechSynthesis.speak(u);
}
function setSpeaking(on) {
  $('#alpha').classList.toggle('speaking', on);
  $('#rpAvatar').classList.toggle('speaking', on);
}
function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
  setSpeaking(false);
  $('#speakBtn').classList.remove('on');
}
function renderVoice() {
  $$('#voiceSeg [data-voice]').forEach((b) => {
    b.textContent = M.voice[b.dataset.voice];
    b.setAttribute('aria-checked', String(b.dataset.voice === voiceMode));
  });
  $('#voiceNote').textContent = voiceMode === 'siri' ? M.voice.siriNote(M.voice.shortcutName) : M.voice.deviceNote;
  $('#voiceTest').textContent = M.voice.test;
  $('#speakBtn').hidden = voiceMode === 'device' && !canSpeak;
}
$('#voiceSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-voice]');
  if (!b) return;
  stopSpeaking();
  voiceMode = b.dataset.voice;
  store.set(VOICE_KEY, voiceMode);
  renderVoice();
});
$('#voiceTest').addEventListener('click', () => speak(M.voice.testText));
renderVoice();
$('#speakBtn').addEventListener('click', () => {
  const btn = $('#speakBtn');
  if (btn.classList.contains('on')) { stopSpeaking(); return; }
  btn.classList.add('on');
  // อ่านประโยคชุดเดียวกับที่แสดงอยู่ (ไม่สุ่มใหม่)
  const lines = $('#report').hidden || !lastLines.length ? reportLines() : lastLines;
  const text = [M.report.intro(greeting()), ...lines.filter((l) => !l.sub && l.text).map((l) => l.text)].join(' . ');
  speak(text, () => btn.classList.remove('on'));
});

/* ---------- ช่องสั่งงาน ---------- */
// iPhone: ตอนคีย์บอร์ดขึ้น วางช่องสั่งงานไว้เหนือคีย์บอร์ดพอดี ตามขอบล่างของ visual viewport
const vv = window.visualViewport;
function placeCmd() {
  // iPhone (PWA) บางทีค่า innerHeight กับ visualViewport ไม่ตรงกันแม้ไม่มีคีย์บอร์ด → นับเฉพาะตอนช่องสั่งงานถูกโฟกัส
  const typing = document.activeElement === $('#cmdInput');
  const kb = vv && typing ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
  document.body.classList.toggle('kb-open', kb > 80);
}
if (vv) { vv.addEventListener('resize', placeCmd); vv.addEventListener('scroll', placeCmd); }
// คีย์บอร์ดดันหน้าขึ้นแล้วไม่เลื่อนกลับ → ดึงกลับที่เดิม
$('#cmdInput').addEventListener('focus', () => setTimeout(() => { window.scrollTo(0, 0); placeCmd(); }, 320));
$('#cmdInput').addEventListener('blur', () => setTimeout(() => { window.scrollTo(0, 0); placeCmd(); }, 60));
let answerTimer = null;
function showAnswer(say, sub) {
  const el = $('#answer');
  el.innerHTML = `${esc(say)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  el.hidden = false;
  clearTimeout(answerTimer);
  answerTimer = setTimeout(() => { el.hidden = true; }, 6500);
}

function handleCommand(text, { voice = false } = {}) {
  const res = runCommand(text, { apps: APPS, results, alerts: allAlerts() });
  if (!res) return;
  $('#cmdInput').value = '';
  $('#cmdInput').blur();
  showAnswer(res.say, res.sub);
  // โหมด Siri สลับแอปทุกครั้งที่พูด จึงพูดเฉพาะคำตอบที่ไม่ต้องเปิดหน้าอื่นต่อ
  if (voice && !(voiceMode === 'siri' && (res.go || res.report))) speak(res.sub ? `${res.say} ${res.sub}` : res.say);
  if (res.report) setTimeout(() => openReport(), 250);
  else if (res.go) setTimeout(() => { location.href = res.go; }, voice ? 900 : 450);
}

$('#cmd').addEventListener('submit', (e) => {
  e.preventDefault();
  handleCommand($('#cmdInput').value);
});

// ไมค์: ใช้ Web Speech API ถ้าเครื่องรองรับ ถ้าไม่รองรับให้ใช้ปุ่มไมค์บนคีย์บอร์ด iPhone แทน
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;
function keyboardDictationHint() {
  $('#cmdInput').focus();
  showAnswer(M.input.dictation, M.input.dictationSub);
}
$('#micBtn').addEventListener('click', () => {
  if (!SR) { keyboardDictationHint(); return; }
  if (recog) { recog.stop(); return; }
  stopSpeaking();
  recog = new SR();
  recog.lang = 'th-TH';
  recog.interimResults = true;
  recog.maxAlternatives = 1;
  let finalText = '';
  $('#cmd').classList.add('listening');
  $('#cmdInput').placeholder = M.input.listening;
  recog.onresult = (e) => {
    const text = [...e.results].map((r) => r[0].transcript).join('');
    $('#cmdInput').value = text;
    if (e.results[e.results.length - 1].isFinal) finalText = text;
  };
  recog.onerror = (e) => {
    console.warn('[hub] speech', e.error);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') keyboardDictationHint();
  };
  recog.onend = () => {
    $('#cmd').classList.remove('listening');
    $('#cmdInput').placeholder = M.input.placeholder;
    recog = null;
    const text = finalText || $('#cmdInput').value;
    if (text.trim()) handleCommand(text, { voice: true });
  };
  try { recog.start(); } catch { recog = null; keyboardDictationHint(); }
});

/* ---------- events ---------- */
// แตะหัวข้อ (เช่น "2 เรื่องใกล้ถึง") = เปิดหน้าสรุปและอ่านให้ฟัง (โหมด Siri: เปิดหน้าอย่างเดียว ไม่สลับแอปเอง)
$('#headline').addEventListener('click', () => {
  openReport();
  if (voiceMode === 'device') setTimeout(() => { if (!$('#speakBtn').classList.contains('on')) $('#speakBtn').click(); }, 350);
});
$('#reportBack').addEventListener('click', () => closeReport());
$('#syncSkip').addEventListener('click', hideSync);
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-report]')) openReport();
  // กาง/หุบรายการย่อยของแจ้งเตือนที่รวมหลายงวด
  const t = e.target.closest('[data-toggle]');
  if (t) {
    const sub = t.nextElementSibling;
    const open = sub.hidden;
    sub.hidden = !open;
    t.setAttribute('aria-expanded', String(open));
  }
  const ts = e.target.closest('[data-toggle-sub]');
  if (ts) {
    const open = ts.getAttribute('aria-expanded') !== 'true';
    ts.setAttribute('aria-expanded', String(open));
    for (let n = ts.nextElementSibling; n && n.classList.contains('rp-sub'); n = n.nextElementSibling) n.hidden = !open;
  }
});

/* ---------- หน้าตั้งค่า (ที่เดียวของ Alpha) ---------- */
const T = globalThis.AlphaTheme;
// รูปแบบ Setup code เดียวกับในแอป: ลิงก์ Apps Script + ?k=TOKEN
function parseSetup(text) {
  let u;
  try { u = new URL(String(text).trim()); } catch { return null; }
  const k = u.searchParams.get('k');
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(u.href) || !k) return null;
  return { url: `${u.origin}${u.pathname}`, k };
}
const editing = new Set(); // แอปที่กำลังแก้ Setup code
const connMsg = {};        // ข้อความสถานะการเชื่อมต่อของแต่ละแอป

function renderSettings() {
  const S = M.settings;
  $('#setTitle').textContent = S.title;
  $('#themeLabel').textContent = S.themeLabel;
  $('#modeLabel').textContent = S.modeLabel;
  $('#langLabel').textContent = S.langLabel;
  $('#connLabel').textContent = S.connLabel;
  $('#alertLabel').textContent = S.alertLabel;
  $('#voiceLabel').textContent = S.voiceLabel;
  $('#setFoot').textContent = S.foot;

  const cur = T.choice();
  const tile = (id, t, label) => `<button type="button" role="radio" data-theme-id="${id}" aria-checked="${id === cur}">
    <i style="background:radial-gradient(60% 80% at 25% 20%, ${t.g1}, transparent), radial-gradient(60% 80% at 85% 70%, ${t.g2}, transparent), ${t.bg}; box-shadow: inset 0 0 0 1px ${t.vi}55"></i>${esc(label)}</button>`;
  const tt = T.THEMES;
  $('#themes').innerHTML = Object.entries(tt).map(([id, t]) => tile(id, t, t.name)).join('')
    + `<button type="button" role="radio" data-theme-id="time" aria-checked="${cur === 'time'}"><i style="background:linear-gradient(90deg, ${tt.ocean.bg} 0 33%, ${tt.sunset.bg} 33% 66%, ${tt.aurora.bg} 66%), linear-gradient(90deg, ${tt.ocean.vi}, ${tt.sunset.vi}, ${tt.aurora.vi}); background-blend-mode: screen"></i>${esc(S.themeTime)}</button>`;

  $$('#modeSeg [data-mode]').forEach((b) => { b.textContent = S.modes[b.dataset.mode]; b.setAttribute('aria-checked', String(b.dataset.mode === T.mode())); });
  const lang = T.lang() || 'th';
  $$('#langSeg [data-lang]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === lang)));

  $('#conns').innerHTML = APPS.filter((a) => a.setupKey).map((a) => {
    const setup = store.get(a.setupKey, null);
    const edit = editing.has(a.id) || !setup;
    const msg = connMsg[a.id];
    return `<div class="glass conn" data-conn="${a.id}">
      <div class="conn-head"><img src="${esc(a.icon)}" alt=""><b>${esc(a.name)}</b><span class="conn-state ${setup ? 'on' : 'off'}">${esc(setup ? S.connOn : S.connOff)}</span></div>
      ${edit ? `<textarea rows="3" placeholder="${esc(S.connPlaceholder)}" autocomplete="off" autocapitalize="off" spellcheck="false">${setup && editing.has(a.id) ? esc(`${setup.url}?k=${setup.k}`) : ''}</textarea>
        <div class="conn-actions">${setup ? `<button type="button" data-conn-cancel>${esc(S.connCancel)}</button>` : ''}<button type="button" class="primary" data-conn-save>${esc(S.connSave)}</button></div>`
        : `<div class="conn-actions"><button type="button" data-conn-edit>${esc(S.connEdit)}</button><button type="button" class="danger" data-conn-clear>${esc(S.connClear)}</button></div>`}
      ${msg ? `<p class="conn-msg${msg.err ? ' err' : ''}">${esc(msg.text)}</p>` : ''}
    </div>`;
  }).join('');

  $('#paceLabel').textContent = S.paceLabel;
  $('#paceHint').textContent = S.paceHint;
  $('#paceMin').value = settings.paceMin;
  $('#speechLabel').textContent = S.speechLabel;
  $('#tightLabel').textContent = S.tightLabel;
  $('#overMidLabel').textContent = S.overMidLabel;
  $('#overHighLabel').textContent = S.overHighLabel;
  $('#speechHint').textContent = S.speechHint;
  for (const k of ['tightPerDay', 'overMid', 'overHigh']) $(`#${k}`).value = settings[k];
  $('#briefLabel').textContent = S.briefLabel;
  $('#briefHint').textContent = S.briefHint;
  $('#briefSwitch').setAttribute('aria-checked', String(!!settings.morningBrief));
  renderVoice();
}
function openSettings() {
  renderSettings();
  const el = $('#settings');
  el.hidden = false;
  el.scrollTop = 0;
}
function closeSettings() {
  if (location.hash === '#settings') history.replaceState(null, '', location.pathname);
  const el = $('#settings');
  el.classList.add('closing');
  setTimeout(() => { el.hidden = true; el.classList.remove('closing'); }, reduceMotion ? 0 : 400);
}
$('#settingsBtn').addEventListener('click', openSettings);
$('#themes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-id]');
  if (!b) return;
  T.set(b.dataset.themeId);
  renderSettings();
});
$('#modeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  T.setMode(b.dataset.mode);
  renderSettings();
});
$('#langSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b) return;
  T.setLang(b.dataset.lang);
  renderSettings();
});
$('#briefSwitch').addEventListener('click', () => {
  settings.morningBrief = !settings.morningBrief;
  saveSettings();
  renderSettings();
});
// การเชื่อมต่อ Google Sheet ของแต่ละแอป (เขียนลง key เดิมของแอป เช่น fl.setup / fa.setup)
$('#conns').addEventListener('click', async (e) => {
  const card = e.target.closest('[data-conn]');
  if (!card) return;
  const a = APPS.find((x) => x.id === card.dataset.conn);
  const S = M.settings;
  if (e.target.closest('[data-conn-edit]')) { editing.add(a.id); delete connMsg[a.id]; renderSettings(); return; }
  if (e.target.closest('[data-conn-cancel]')) { editing.delete(a.id); delete connMsg[a.id]; renderSettings(); return; }
  if (e.target.closest('[data-conn-clear]')) {
    if (!confirm(S.connConfirmClear(a.name))) return;
    try { localStorage.removeItem(a.setupKey); } catch { /* ignore */ }
    delete cache[a.id]; store.set(CACHE_KEY, cache);
    results[a.id] = { status: 'setup', summary: null, at: null, error: null };
    delete connMsg[a.id];
    renderSettings(); renderHome();
    return;
  }
  if (e.target.closest('[data-conn-save]')) {
    const setup = parseSetup(card.querySelector('textarea').value);
    if (!setup) { connMsg[a.id] = { text: S.connBad, err: true }; renderSettings(); return; }
    store.set(a.setupKey, setup);
    editing.delete(a.id);
    connMsg[a.id] = { text: S.connTesting };
    renderSettings();
    await loadOne(a);
    const r = results[a.id];
    connMsg[a.id] = r.status === 'ok' ? { text: S.connDone } : { text: S.connFail(r.error || 'error'), err: true };
    renderSettings();
  }
});
// เปิดหน้าตั้งค่าจากลิงก์ เช่น /#settings (การ์ดที่ยังไม่เชื่อม หรือปุ่มในแอป)
window.addEventListener('hashchange', () => { if (location.hash === '#settings') openSettings(); });
$('#settingsBack').addEventListener('click', closeSettings);
$('#paceMin').addEventListener('change', (e) => {
  const v = Math.max(0, Math.round(Number(e.target.value) || 0));
  settings.paceMin = v;
  e.target.value = v;
  saveSettings();
  renderHome();
});
for (const k of ['tightPerDay', 'overMid', 'overHigh']) {
  $(`#${k}`).addEventListener('change', (e) => {
    const v = Math.max(0, Math.round(Number(e.target.value) || 0));
    settings[k] = v;
    e.target.value = v;
    saveSettings();
  });
}
// กลับมาที่ Hub (เช่นกดกลับจากแอป หรือสลับแอป) แล้วข้อมูลเก่ากว่า 2 นาที ให้ดึงใหม่เงียบ ๆ
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!syncedAt || Date.now() - syncedAt > 120000)) refresh();
});
window.addEventListener('pageshow', (e) => { if (e.persisted) refresh(); });

/* ---------- กดค้างที่การ์ด = ทางลัด (config.longPress) ---------- */
// เช่น กดค้างการ์ด Fuel Logger 0.5 วิ → เปิดฟอร์มเติมน้ำมันทันที
let pressTimer = null;
let pressFired = false;
document.addEventListener('pointerdown', (e) => {
  const card = e.target.closest('a.app');
  const app = card && APPS.find((a) => a.path === card.getAttribute('href') && a.longPress);
  pressFired = false;
  if (!app) return;
  card.classList.add('pressing');
  pressTimer = setTimeout(() => {
    pressFired = true;
    card.classList.remove('pressing');
    navigator.vibrate?.(12);
    location.href = app.longPress;
  }, 500);
});
const cancelPress = () => { clearTimeout(pressTimer); document.querySelectorAll('.app.pressing').forEach((c) => c.classList.remove('pressing')); };
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => document.addEventListener(ev, cancelPress));
document.addEventListener('scroll', cancelPress, true);
// กดค้างจนเปิดทางลัดแล้ว ไม่ต้องเปิดหน้าแอปซ้ำ
document.addEventListener('click', (e) => { if (pressFired && e.target.closest('a.app')) { e.preventDefault(); e.stopPropagation(); pressFired = false; } }, true);
document.addEventListener('contextmenu', (e) => { if (e.target.closest('a.app')) e.preventDefault(); });

/* ---------- เปลี่ยนหน้าให้สมูท ---------- */
// ชื่อแอปบนการ์ดที่กดเท่านั้นที่ได้ view-transition-name (ห้ามซ้ำในหน้า) แล้วเลื่อนไปเป็นหัวข้อของแอป
document.addEventListener('click', (e) => {
  const card = e.target.closest('a.app');
  if (!card) return;
  document.querySelectorAll('.app-name').forEach((n) => { n.style.viewTransitionName = ''; });
  const name = card.querySelector('.app-name');
  if (name) name.style.viewTransitionName = 'app-title';
}, true);
// โหลดหน้าแอปเก็บไว้ล่วงหน้า กดแล้วเปิดได้ทันที
for (const a of APPS) {
  for (const href of [a.path, `${a.path}styles.css`, `${a.path}app.js`]) {
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = href;
    document.head.appendChild(l);
  }
}

/* ---------- สรุปตอนเช้าอัตโนมัติ ---------- */
const BRIEF_KEY = 'alpha.lastBrief';
function morningBrief() {
  if (!settings.morningBrief) return;
  const now = new Date();
  if (now.getHours() < 5) return;
  const today = now.toDateString();
  if (store.get(BRIEF_KEY, '') === today) return;
  if (!Object.values(results).some((r) => r.summary)) return;
  store.set(BRIEF_KEY, today);
  const go = () => {
    hideSync();
    openReport();
    // iPhone อาจไม่ยอมให้เล่นเสียงเองโดยไม่ได้แตะ ถ้าไม่ได้ก็แสดงสรุปอย่างเดียว (โหมด Siri ไม่สลับแอปเอง)
    if (voiceMode === 'device') setTimeout(() => $('#speakBtn').click(), 700);
  };
  setTimeout(go, $('#sync').hidden ? 300 : 1900);
}

/* ---------- เริ่ม ---------- */
// ข้อความคงที่ในหน้า HTML ดึงจาก messages.js
$('#orbBtn').setAttribute('aria-label', M.alphaLabel);
$('#headline').setAttribute('aria-label', M.headlineHint);
$('#cmdInput').placeholder = M.input.placeholder;
$('#sync h2').textContent = M.sync.title;
$('#syncSkip').textContent = M.sync.skip;
renderHome();
if (location.hash === '#report') openReport({ push: false });
else if (location.hash === '#settings') openSettings();
else if (!session.get(SYNC_SEEN)) showSync();
refresh();
