// Hub: หน้าแรก + หน้าซิงก์ + หน้ารายงาน + ช่องสั่งงาน
import APPS from './config.js';
import { runCommand } from './commands.js';
import { M, greeting } from './messages.js';
import { loadMessages, compose, wrap, render as renderLine, pickTease, teaseUsedToday, foodLevel } from './speech.js';
import { parseLog, iso } from './log/parse.js';
import { categorize, learnKey } from './log/categories.js';
import { openCard, closeCard, isOpen as cardOpen, setBusy, bindCard, isBig, openAsk } from './log/card.js';
import * as sheet from './log/sheet.js';
import { mountFace } from './alpha-face.js';

// ประโยคพูด + ตารางคำ → หมวด ของการจดรายจ่าย: โหลดพร้อมกันเบื้องหลัง (index.html preload ไว้ตั้งแต่ต้น)
// หน้าแรกแสดงตัวเลขจาก cache ได้เลยโดยไม่ต้องรอ · ส่วนที่ต้องใช้ประโยค (อารมณ์ตัวละคร หน้าสรุป) รอ `ready`
let messagesReady = false;
let CATEGORY_TABLE = { categories: {}, guess: [] };
const ready = Promise.all([
  loadMessages(),
  fetch('/data/categoryWords.th.json').then((r) => r.json()).then((t) => { CATEGORY_TABLE = t; }).catch(() => {}),
]).then(() => { messagesReady = true; });

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CACHE_KEY = 'hub.cache.v1';     // ผลสรุปล่าสุดของแต่ละแอป (เปิดแล้วเห็นทันที)
const WELCOME_SESSION = 'hub.session'; // sessionStorage: มีแล้ว = แอปเปิดค้างอยู่ (กลับจากแอปลูก/พื้นหลัง) · ไม่มี = เพิ่งเปิดแอปใหม่ (cold start)
const PERF_KEY = 'hub.perf';          // เวลาโหลดล่าสุด 30 ครั้ง (ทุก request ไป Apps Script + สรุปของแต่ละแอป)
const TIMEOUT = 8000;                 // แอปไหนช้ากว่านี้ ใช้ข้อมูลล่าสุดไปก่อน
const WELCOME_MAX = 2200;             // หน้า welcome ยาวสุด (มี cache) · ไม่มี cache เลยรอได้ถึง TIMEOUT
const LEVEL_RANK = { urgent: 0, soon: 1, info: 2 };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CHEV = '<svg class="chev" viewBox="0 0 8 14"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>';

const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
/* ---------- จับเวลา: ทุก request ไป Apps Script + สรุปของแต่ละแอป (console + หน้าตั้งค่า) ---------- */
const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
};
const perf = store.get(PERF_KEY, []);
function logPerf(tag, ms, ok = true) {
  const entry = { tag, ms: Math.round(ms), ok, at: Date.now() };
  console.info(`[hub] ${tag} ${entry.ms}ms${ok ? '' : ' (failed)'}`);
  perf.push(entry);
  while (perf.length > 30) perf.shift();
  store.set(PERF_KEY, perf);
}
const appOfUrl = (url) => APPS.find((a) => { const s = a.setupKey && store.get(a.setupKey, null); return s?.url && url.startsWith(s.url); });
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input?.url || input);
  if (!/^https:\/\/script\.google/.test(url) && !/\/mock\//.test(url)) return nativeFetch(input, init);
  const action = new URL(url, location.href).searchParams.get('action');
  const tag = `${appOfUrl(url)?.name || 'script'}${action ? ` ${action}` : ''}${init?.method === 'POST' ? ' POST' : ''}`;
  const t0 = performance.now();
  try {
    const res = await nativeFetch(input, init);
    logPerf(tag, performance.now() - t0, res.ok);
    return res;
  } catch (err) { logPerf(tag, performance.now() - t0, false); throw err; }
};
let firstNumbersAt = null;

// การตั้งค่าของ Alpha (ที่เดียว): paceMin = แจ้ง "ใช้เร็วกว่าแผน" เมื่อเกินกี่บาท
// tightPerDay / lowPerDay / overMid / overHigh = เกณฑ์เลือกระดับค่ากิน (ดู speech.js → foodLevel)
const SETTINGS_KEY = 'alpha.settings';
const DEFAULT_SETTINGS = { paceMin: 100, morningBrief: true, tightPerDay: 200, lowPerDay: 100, overMid: 300, overHigh: 1000, lateNightCutoffHour: 5 };
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
    // ยอดเตรียมวันเงินเข้า (Finance): แสดงแยก ttb / บิลบัตร + ยอดรวม ไม่ต้องกาง
    if (first.kind === 'payday' && first.lines?.length) first.items = null;
    // รายการที่รวมหลายงวด (items) แตะแล้วกางรายการย่อย แทนการเปิดลิงก์
    const tag = (a, cls, inner) => (a.kind === 'payday' && a.lines?.length && cls === 'al-main'
      ? `<div class="${cls} prep-card">${inner}</div>`
      : a.items?.length
      ? `<button type="button" class="${cls}" data-toggle aria-expanded="false">${inner}</button>${subList(a)}`
      : `<a class="${cls}" href="${esc(a.link || a.app.path)}">${inner}</a>`);
    $('#alerts').innerHTML = `<div class="glass al-card">
      ${tag(first, 'al-main', `<span class="al-ic ${first.level}" aria-hidden="true"><i class="al-face"><img src="/assets/alpha-character.png" alt=""></i></span>
        <span class="al-text"><b>${keep(first.kind === 'payday' && first.lines?.length ? first.text.replace(/ ฿[\d,.]+/, '') : first.text)}</b>${prepLines(first)}<small>${esc(first.app.name)}</small></span>${first.items?.length ? CARET : CHEV}`)}
      ${rest.map((a) => tag(a, 'al-row', `<span class="dot ${a.level}"></span><span>${keep(a.text)}</span><small>${esc(a.app.name)}</small>${a.items?.length ? CARET : ''}`)).join('')}
      ${alerts.length > 1 ? `<button type="button" class="al-more" data-report>${esc(M.seeAll(alerts.length))}</button>` : ''}
    </div>`;
  }

  $('#apps').innerHTML = APPS.map(appCard).join('');
  fitHome();
  if (messagesReady && !syncing && (hasData || anyError)) setEmotion(brief().emotion);
}

// ตัวเลขกับหน่วยไม่แยกบรรทัด เช่น "อีก 2 วัน" ไม่ขาดเป็น "อีก 2 / วัน"
const keep = (t) => esc(t).replace(/ (\d[\d,.]*) (วัน|กม\.|บาท|รายการ)/g, '&nbsp;$1&nbsp;$2');
const exact = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
// บรรทัดที่มีรายการย่อย (บิลบัตรเครดิต) แตะแล้วกางดูแต่ละรายการ
function prepLines(a) {
  if (a.kind !== 'payday' || !a.lines?.length) return '';
  const row = (l) => (l.items?.length
    ? `<button type="button" class="prep-row" data-prep-toggle aria-expanded="false"><i>${esc(l.label)}</i><b>${exact(l.amount)}</b></button>
      <span class="prep-sub" hidden>${l.items.map((it) => `<span><i>${esc(it.label)}</i><b>${exact(it.amount)}</b></span>`).join('')}</span>`
    : `<span class="prep-row"><i>${esc(l.label)}</i><b>${exact(l.amount)}</b></span>`);
  return `<span class="prep">${a.lines.map(row).join('')}
    ${a.lines.length > 1 ? `<span class="sum"><i>รวมที่ต้องเตรียม</i><b>${exact(a.total)}</b></span>` : ''}
    ${a.note ? `<em>${esc(a.note)}</em>` : ''}</span>`;
}
// หน้าแรกไม่เลื่อน: ถ้าการ์ดล่างสุดล้นลงไปใต้ช่องสั่งงาน ย่อตัวละครลงให้พอดี
function fitHome() {
  const home = $('#home');
  home.style.setProperty('--squeeze', '0px');
  const over = $('#apps').getBoundingClientRect().bottom - ($('#cmd').getBoundingClientRect().top - 10);
  if (over > 0) home.style.setProperty('--squeeze', `${Math.ceil(over)}px`);
}
window.addEventListener('resize', () => { if (!document.body.classList.contains('kb-open')) fitHome(); });
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
    return `<a class="glass app" href="${esc(a.path)}"><span class="app-name" style="--app-c:${esc(a.color)}">${icon}${esc(a.name)}</span>
      <span class="sk" style="height:30px;width:70%;margin-top:14px"></span><span class="sk" style="height:10px;width:85%;margin-top:9px"></span></a>`;
  }
  const [main, ...more] = s.stats || [];
  const title = s.title || a.name;
  const meta = r.status === 'error' ? `<div class="app-meta err mono">OFFLINE · ${esc(ago(r.at))}</div>`
    : r.status === 'loading' ? `<div class="app-meta mono">${esc(r.at ? M.card.updating(ago(r.at)) : M.card.loading)}</div>`
      : `<div class="app-meta mono">${esc(M.card.updated(ago(r.at)))}</div>`;
  return `<a class="glass app" href="${esc(a.path)}">
    <span class="app-name" style="--app-c:${esc(a.color)}">${icon}<span class="nm">${esc(title)}</span></span>
    ${main ? `<div class="app-big">${esc(main.value)}<small> ${esc(main.unit)}</small></div><div class="app-sub">${esc(main.label)}${more[0] ? ` · ${esc(more[0].value)} ${esc(more[0].unit)}` : ''}</div>` : ''}
    ${meta}</a>`;
}

function offlineCard(a, title, sub) {
  return `<a class="glass app offline" href="${esc(a.setupLink || a.path)}">
    <div class="tag mono">● MODULE OFFLINE</div>
    <div class="row"><div><b>${esc(a.name)} · ${esc(title)}</b><small>${esc(sub)}</small></div><span class="pill">${esc(M.card.setupButton)}</span></div></a>`;
}

/* ---------- หน้า welcome (HUD) ---------- */
// บรรทัดบูตติ๊กตามการโหลดจริงของแต่ละแอป: CONNECTING X ··· → X CONNECTED ✓ (หรือ OFFLINE / NOT SET)
// มีข้อมูลที่จำไว้แล้ว = ติ๊ก "X LOADED ✓" ทันทีที่อ่านข้อมูลนั้นได้ (ห่างกันทีละนิด) แล้วซิงก์จริงต่อเบื้องหลัง
// แสดงทุกครั้งที่เปิดแอปใหม่ (cold start) · สลับแอป/กลับจากแอปลูกไม่แสดง · แตะที่ไหนก็ข้าม · ยาวสุด WELCOME_MAX
const syncApps = () => APPS.filter((a) => a.summary);
const upName = (a) => a.name.toUpperCase();
let welcomeTimer = null;
const cacheTick = {}; // แอปที่ติ๊กจากข้อมูลที่จำไว้แล้ว (ระหว่างรอข้อมูลใหม่)
function renderSync() {
  const list = syncApps();
  const log = $('#syncLog');
  if (!log.children.length) {
    log.innerHTML = `<div class="on"><span class="lbl">ALPHA ONLINE</span><span class="st ok">✓</span></div>${list.map((a) => `<div data-app="${esc(a.id)}"><img src="${esc(a.icon)}" alt="" width="16" height="16"><span class="lbl"></span><span class="st"></span></div>`).join('')}`;
    list.forEach((a, i) => setTimeout(() => log.querySelector(`[data-app="${a.id}"]`)?.classList.add('on'), reduceMotion ? 0 : 120 + i * 140));
  }
  let done = 0;
  for (const a of list) {
    const row = log.querySelector(`[data-app="${a.id}"]`);
    const r = results[a.id];
    const [lbl, st, cls] = r.status === 'loading' && cacheTick[a.id] && r.summary ? [`${upName(a)} LOADED`, '✓', 'ok']
      : r.status === 'loading' ? [`CONNECTING ${upName(a)}`, '···', 'wait']
      : r.status === 'ok' ? [`${upName(a)} CONNECTED`, '✓', 'ok']
        : r.status === 'setup' ? [`${upName(a)} NOT SET`, '✕', 'bad']
          : [`${upName(a)} ${r.summary ? 'LAST DATA' : 'OFFLINE'}`, r.summary ? '!' : '✕', r.summary ? 'warn' : 'bad'];
    row.querySelector('.lbl').textContent = lbl;
    const stEl = row.querySelector('.st');
    stEl.textContent = st; stEl.className = `st ${cls}`;
    if (r.status !== 'loading' || (cacheTick[a.id] && r.summary)) done += 1;
  }
  $('#syncBar').style.width = `${Math.round(((1 + done) / (1 + list.length)) * 100)}%`;
  const all = done === list.length;
  $('#syncWelcome').textContent = all ? M.sync.welcome : '';
  $('#syncWelcome').classList.toggle('on', all);
  $('#syncIssues').innerHTML = list.filter((a) => results[a.id].status === 'setup' || (results[a.id].status === 'error' && !results[a.id].summary)).map(appCard).join('');
  // ครบทุกแอปแล้ว: ค้างข้อความต้อนรับครู่หนึ่ง (ไม่เกินเวลาสูงสุด) แล้วเข้าหน้าแรก · มีแอปต้องตั้งค่า = รอให้แตะเอง
  const issues = list.some((a) => results[a.id].status === 'setup' || (results[a.id].status === 'error' && !results[a.id].summary));
  if (all && !issues) setTimeout(hideSync, reduceMotion ? 300 : 650);
}

function showSync() {
  const el = $('#sync');
  if (document.documentElement.classList.contains('welcome')) el.style.animation = 'none'; // ขึ้นอยู่แล้วจาก <head>
  el.hidden = false;
  el.classList.remove('closing');
  $('#syncLog').innerHTML = '';
  session.set(WELCOME_SESSION, '1');
  renderSync();
  // มี cache = ติ๊กจากข้อมูลที่จำไว้ทีละบรรทัดเร็วๆ (หน้าแรกแสดงข้อมูลล่าสุดได้เลย) · ไม่มีเลย = รอข้อมูลจริงได้ถึง TIMEOUT
  const hasCache = Object.values(results).some((r) => r.summary);
  if (hasCache) syncApps().forEach((a, i) => setTimeout(() => { cacheTick[a.id] = true; if (!$('#sync').hidden) renderSync(); }, (reduceMotion ? 0 : 250) + i * 150));
  clearTimeout(welcomeTimer);
  welcomeTimer = setTimeout(hideSync, hasCache ? WELCOME_MAX : TIMEOUT + 500);
}
function hideSync() {
  const el = $('#sync');
  if (el.hidden || el.classList.contains('closing')) return;
  clearTimeout(welcomeTimer);
  el.style.animation = '';
  el.classList.add('closing');
  setTimeout(() => { el.hidden = true; el.classList.remove('closing'); }, reduceMotion ? 0 : 400);
}
const needWelcome = () => !session.get(WELCOME_SESSION);

/* ---------- โหลดสรุปจากทุกแอป (ขนาน) ---------- */
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function loadOne(a) {
  const r = results[a.id];
  r.status = 'loading';
  const t0 = performance.now();
  try {
    const mod = await import(a.summary);
    const s = await withTimeout(mod.getSummary(), TIMEOUT);
    logPerf(`summary ${a.name}`, performance.now() - t0);
    if (s?.needsSetup) { r.status = 'setup'; r.summary = null; delete cache[a.id]; }
    else {
      r.status = 'ok'; r.summary = s; r.at = Date.now(); r.error = null;
      cache[a.id] = { summary: s, at: r.at };
    }
    store.set(CACHE_KEY, cache);
  } catch (err) {
    console.error(`[hub] ${a.id}`, err);
    logPerf(`summary ${a.name}${err?.message === 'timeout' ? ' timeout' : ''}`, performance.now() - t0, false);
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
  await ready;
  morningBrief();
  logPerf('sync all', performance.now() - started, !Object.values(results).some((r) => r.status === 'error'));
  prefetchApps();
}

/* ---------- หน้ารายงาน ---------- */
let typingTimer = null;
const factsOf = (id) => (results[id]?.status !== 'setup' && results[id]?.summary?.facts) || null;
// แอปที่ส่ง facts มา = hub แต่งประโยคเรื่องของแอปนั้นเองทั้งหมด (แจ้งเตือนของแอปนั้นไม่ต้องอ่านซ้ำ)
const SPEECH_APPS = new Set(['finance-app', 'fuel-logger']);

// สรุปทั้งวัน: ค่ากิน (+วันเงินเดือนเข้า) → ค่างวด → รถ → เรื่องอื่นๆ (แจ้งเตือนจากแอปอื่น) → แอปที่ยังไม่ได้ตั้งค่า
// ใช้ข้อความชุดเดียวกันทั้งบนจอและตอนอ่านออกเสียง
function brief({ tease = null } = {}) {
  const status = (id) => results[id]?.status;
  // แอปที่โหลดไม่สำเร็จรอบนี้: ไม่ใช้ข้อมูลเก่า แล้วบอกว่าส่วนไหนขาด (ไม่แน่ใจ) · โหลดไม่ได้เลยสักแอป = ขอโทษ
  // (โหลดไม่ได้ทุกแอป → สรุปจากข้อมูลล่าสุดที่จำไว้เหมือนเดิม แต่ตัวละครทำหน้าขอโทษ)
  const live = APPS.filter((a) => a.summary && status(a.id) !== 'setup');
  const allFailed = live.length > 0 && live.every((a) => status(a.id) === 'error');
  const failed = allFailed ? {} : { money: status('finance-app') === 'error', car: status('fuel-logger') === 'error' };
  const fin = factsOf('finance-app');
  const fuel = factsOf('fuel-logger');
  const finPath = APPS.find((a) => a.id === 'finance-app')?.path;
  const fuelPath = APPS.find((a) => a.id === 'fuel-logger')?.path;
  const links = {
    food: finPath && `${finPath}#today`, install: finPath && `${finPath}#loans`,
    fuel: fuelPath && `${fuelPath}#add`, care: fuelPath && `${fuelPath}#care`,
  };
  const b = compose({ fin, fuel, settings, links, failed, allFailed });
  const items = b.topics.map((t) => ({ text: t.text, link: t.link }));
  for (const a of allAlerts()) {
    if (SPEECH_APPS.has(a.app.id)) continue;
    items.push({ text: a.text, link: a.items?.length ? null : a.link || a.app.path, group: a.items?.length ? a : null });
  }
  // แซว: ต่อท้ายสรุป ก่อนส่วน "ท้าย"
  if (tease) items.push({ text: tease.text, link: null });
  if (items.length && !b.nothing) wrap(items.map((i) => i.text)).forEach((t, i) => { items[i].text = t; });
  return { items, emotion: tease ? 'tease' : b.emotion, fin: failed.money ? null : fin };
}

// จำนวนครั้งที่กดฟังสรุปวันนี้ (ใช้กับแซว "ฟังรอบที่ 3")
const LISTEN_KEY = 'hub.listens';
function bumpListen() {
  const today = new Date().toDateString();
  const v = store.get(LISTEN_KEY, {});
  const count = (v.day === today ? v.count : 0) + 1;
  store.set(LISTEN_KEY, { day: today, count });
  return count;
}
const listenCount = () => { const v = store.get(LISTEN_KEY, {}); return v.day === new Date().toDateString() ? v.count : 0; };

// แซวเลือกครั้งเดียวต่อการเปิดหน้าสรุปหนึ่งครั้ง (เปิดหน้าสรุปใหม่ = เลือกใหม่ แต่ทั้งวันแซวได้ครั้งเดียว)
let reportSession = 0;
let teaseMem = { session: -1, tease: null };
let reteaseNext = false;

let lastLines = [];
function reportLines() {
  if (teaseMem.session !== reportSession || (reteaseNext && !teaseMem.tease)) {
    const base = brief();
    teaseMem = { session: reportSession, tease: pickTease({ emotion: base.emotion, fin: base.fin, listens: listenCount() }) };
  }
  reteaseNext = false;
  const { items, emotion } = brief({ tease: teaseMem.tease });
  setEmotion(emotion);
  const lines = [];
  for (const it of items) {
    const g = it.group;
    lines.push({ html: `&gt; ${esc(it.text)}${g ? ' <span class="go">▾</span>' : ''}`, text: it.text, link: it.link, toggle: !!g });
    if (g) for (const sub of g.items) lines.push({ html: `<span class="go">└</span> ${esc(sub.text)}`, link: sub.link || g.link || g.app.path, sub: true });
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
  if (!messagesReady) { ready.then(() => openReport({ push })); return; }
  const el = $('#report');
  if (!el.hidden) return;
  el.hidden = false;
  el.scrollTop = 0;
  reportSession++;
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
  faces.forEach((f) => f.talk(true));
  u.onboundary = () => {
    const a = $('#alpha');
    a.classList.add('bump');
    setTimeout(() => a.classList.remove('bump'), 120);
  };
  u.onend = u.onerror = () => { setSpeaking(false); faces.forEach((f) => f.talk(false)); onEnd?.(); };
  speechSynthesis.speak(u);
}
function setSpeaking(on) {
  $('#alpha').classList.toggle('speaking', on);
  $('#rpAvatar').classList.toggle('speaking', on);
}
function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
  setSpeaking(false);
  faces.forEach((f) => f.talk(false));
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
let fromBrief = false; // ปุ่มอ่านถูกกดต่อจากชิปสรุป/สรุปตอนเช้า (นับการฟังไปแล้ว)
$('#speakBtn').addEventListener('click', () => {
  const btn = $('#speakBtn');
  if (btn.classList.contains('on')) { stopSpeaking(); return; }
  // กดฟังเองในหน้าสรุป = นับเป็นการฟังอีกรอบ ถ้าถึงรอบที่ 3 และวันนี้ยังไม่ได้แซว → สรุปใหม่ให้มีประโยคแซว
  if (!fromBrief) {
    const n = bumpListen();
    if (!$('#report').hidden && n >= 3 && !teaseUsedToday()) { reteaseNext = true; renderReport(); }
  }
  fromBrief = false;
  btn.classList.add('on');
  // อ่านประโยคชุดเดียวกับที่แสดงอยู่ (ไม่สุ่มใหม่)
  const lines = $('#report').hidden || !lastLines.length ? reportLines() : lastLines;
  const text = lines.filter((l) => !l.sub && l.text).map((l) => l.text).join(' . ');
  speak(text, () => btn.classList.remove('on'));
});

/* ---------- ช่องสั่งงาน ---------- */
// ช่องสั่งงานวางจากขอบล่างของพื้นที่ที่วาดได้ (ไม่ใช้ความสูงจอ เพราะ PWA บน iPhone จะตัดส่วนที่เกินทิ้ง)
// ตอนพิมพ์: ชิดเหนือคีย์บอร์ดตามขอบล่างของ visual viewport (--vv-bottom)
// ช่องสั่งงานยึดขอบล่างของส่วนที่มองเห็นจริงเสมอ (CSS: top = --vv-bottom แล้วเลื่อนขึ้นเท่าความสูงตัวเอง)
// คีย์บอร์ดขึ้น: visual viewport สั้นลง → ช่องเลื่อนตามมาติดเหนือคีย์บอร์ดพอดี (อัปเดตทุกเฟรมที่ viewport ขยับ)
const vv = window.visualViewport;
let placeQueued = false;
function placeCmd() {
  placeQueued = false;
  const typing = document.activeElement === $('#cmdInput');
  const vvBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  document.documentElement.style.setProperty('--vv-bottom', `${Math.round(vvBottom)}px`);
  document.body.classList.toggle('kb-open', typing && window.innerHeight - (vv ? vv.height : window.innerHeight) > 80);
}
const queuePlace = () => { if (!placeQueued) { placeQueued = true; requestAnimationFrame(placeCmd); } };
placeCmd();
window.addEventListener('resize', queuePlace);
if (vv) { vv.addEventListener('resize', queuePlace); vv.addEventListener('scroll', queuePlace); }
// iOS เลื่อนทั้งหน้าตอนแตะช่องพิมพ์ (ช่องเด้งไปกลางจอ) → ดึงหน้ากลับที่เดิมทันทีที่มันเลื่อน
window.addEventListener('scroll', () => { if (window.scrollY !== 0) window.scrollTo(0, 0); queuePlace(); }, { passive: true });
$('#cmdInput').addEventListener('focus', () => { window.scrollTo(0, 0); queuePlace(); setTimeout(queuePlace, 350); });
$('#cmdInput').addEventListener('blur', () => { window.scrollTo(0, 0); setTimeout(queuePlace, 60); });
let answerTimer = null;
function showAnswer(say, sub) {
  const el = $('#answer');
  el.innerHTML = `${esc(say)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  el.hidden = false;
  clearTimeout(answerTimer);
  answerTimer = setTimeout(() => { el.hidden = true; }, 6500);
}

// อารมณ์ชั่วคราวระหว่างที่คำตอบขึ้นอยู่ แล้วกลับเป็นอารมณ์ของสรุป
let flashTimer = null;
let flashing = false;
// ms = 0: ค้างไว้จนกว่าจะเรียก flashEmotion ใหม่หรือ endFlash() (เช่นตอนการ์ดเปิดอยู่)
function flashEmotion(e, ms = 6500) {
  flashing = true;
  faces.forEach((f) => f.setEmotion(e));
  clearTimeout(flashTimer);
  if (ms) flashTimer = setTimeout(endFlash, ms);
}
function endFlash() {
  clearTimeout(flashTimer);
  flashing = false;
  faces.forEach((f) => f.setEmotion(curEmotion || 'greet'));
}
// ตอบสั้นๆ: ประโยคจาก messages/th.json + อารมณ์ (+ อ่านออกเสียงถ้าสั่งด้วยเสียง)
const spaced = (vars = {}) => Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, k === 'item' && /^[A-Za-z0-9]/.test(String(v)) ? ` ${v}` : v]));
const line = (key, vars) => (renderLine(key, spaced(vars), { daily: false }) || '').replace(/\s+/g, ' ').trim();
function reply(parts, emotion, voice = false) {
  const text = (Array.isArray(parts) ? parts : [parts]).map(([key, vars]) => line(key, vars)).filter(Boolean).join(' ');
  if (!text) return '';
  showAnswer(text);
  flashEmotion(emotion);
  if (voice) speak(text);
  return text;
}

function handleCommand(text, { voice = false } = {}) {
  const raw = String(text || '').trim();
  if (!raw) return;
  const parsed = parseLog(raw, { cutoff: settings.lateNightCutoffHour, spoken: voice });
  const clear = () => { $('#cmdInput').value = ''; $('#cmdInput').blur(); };
  // การ์ดเปิดอยู่ + "ยกเลิก/ไม่เอา/ไม่" = ปิดการ์ด ไม่จด
  if (cardOpen() && (parsed.intent === 'cancel' || (parsed.intent === 'undo' && parsed.cancel))) { clear(); cancelLog(voice); return; }
  if (parsed.intent === 'undo') { clear(); askUndo(voice); return; }
  if (parsed.intent === 'card') { clear(); reply([['log-card-skip']], 'interrupt', voice); return; }
  if (parsed.intent === 'fuel') {
    // ค่าน้ำมันไม่ลง Daily Log → เปิดฟอร์มเติมน้ำมันในแอปรถ พร้อมกรอกราคาที่แกะได้
    clear();
    showAnswer(M.cmd.openFuelForm);
    if (voice && voiceMode !== 'siri') speak(M.cmd.openFuelForm);
    setTimeout(() => { location.href = `/fuel-logger/#add${parsed.fuelAmount ? `?price=${parsed.fuelAmount}` : ''}`; }, voice ? 900 : 450);
    return;
  }
  if (parsed.intent === 'entries') { clear(); openLog(parsed, raw, voice); return; }
  if (parsed.intent === 'none' && parsed.logish) { clear(); reply([['log-parse-fail']], 'unsure', voice); return; }

  // คำถาม / เปิดแอป / คำสั่งเดิม
  const res = runCommand(raw, { apps: APPS, results, alerts: allAlerts() });
  if (!res) return;
  clear();
  // แกะคำสั่งไม่ออก → ประโยค "ไม่แน่ใจ" + ตัวละครทำหน้าไม่แน่ใจระหว่างที่คำตอบขึ้นอยู่
  if (res.unknown) {
    res.say = renderLine('uncertain-command', {}, { daily: false }) || res.say;
    flashEmotion('unsure');
  }
  showAnswer(res.say, res.sub);
  // โหมด Siri สลับแอปทุกครั้งที่พูด จึงพูดเฉพาะคำตอบที่ไม่ต้องเปิดหน้าอื่นต่อ
  if (voice && !(voiceMode === 'siri' && (res.go || res.report))) speak(res.sub ? `${res.say} ${res.sub}` : res.say);
  if (res.report) setTimeout(() => openReport(), 250);
  else if (res.go) setTimeout(() => { location.href = res.go; }, voice ? 900 : 450);
}

/* ---------- จดรายรับรายจ่าย (log/*) ---------- */
const LEARNED_KEY = 'alpha.learnedCategory';
const learned = () => store.get(LEARNED_KEY, {});
const fmtMoney = (n) => Math.round(Number(n) || 0);
// รอบเงินเดือน (กติกาเดียวกับ calc.js: วันที่ 25 ขึ้นไป = รอบเดือนนี้) ใช้บอกว่าจดลงรอบที่แล้วหรือเปล่า
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const cycleStart = (d) => (d.getDate() >= 25 ? new Date(d.getFullYear(), d.getMonth(), 1) : new Date(d.getFullYear(), d.getMonth() - 1, 1));
const cycleLabel = (d) => { const m = cycleStart(d).getMonth(); return `รอบ 26 ${TH_M[m]}–24 ${TH_M[(m + 1) % 12]}`; };
const isPrevCycle = (d) => cycleStart(d) < cycleStart(new Date());
const LOG_EMOTION = { A: 'ok', B: 'advise', F: 'worry', C: 'no', D: 'no', E: 'sulk' };

function confirmSay(st) {
  const rows = st.rows;
  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const missing = st.type !== 'รายรับ' && rows.find((r) => !r.category);
  if (missing) return [[['log-confirm-ask-category', { item: missing.item || 'รายการนี้' }]], 'advise'];
  if (st.lateNight && st.dateGuess) return [[['log-confirm-late-night']], 'unsure'];
  if (rows.some((r) => r.guess)) return [[['log-confirm-guess']], 'unsure'];
  const big = rows.find((r) => isBig(r));
  if (big) return [[['log-confirm-big', { amount: big.amount }]], 'interrupt'];
  if (st.type === 'รายรับ') return [[['log-confirm-income', { amount: rows[0].amount, item: rows[0].item }]], 'ok'];
  if (rows.length > 1) return [[['log-confirm-multi', { count: rows.length, total }]], 'work'];
  return [[['log-confirm-one', { item: rows[0].item, amount: rows[0].amount, category: rows[0].category }]], 'work'];
}

function openLog(parsed, raw, voice) {
  if (parsed.dateError) { reply([[parsed.dateError === 'future' ? 'log-date-future' : 'log-date-old']], 'unsure', voice); return; }
  const type = parsed.entries[0].type;
  const rows = parsed.entries.map((e) => {
    if (type === 'รายรับ') return { item: e.item, amount: e.amount, category: null, guess: false };
    const c = categorize(e.item, { table: CATEGORY_TABLE, learned: learned() });
    return { item: e.item, amount: e.amount, category: c.category, guess: c.guess };
  });
  const st = { rows, type, date: parsed.date, dateGuess: parsed.dateGuess, lateNight: parsed.lateNight };
  const [parts, emotion] = confirmSay(st);
  const say = parts.map(([k, v]) => line(k, v)).filter(Boolean).join(' ');
  openCard({
    ...st, note: parsed.note, raw: voice ? raw : null, say,
    cycleText: isPrevCycle(parsed.date) ? cycleLabel(parsed.date) : '',
    onChange: (cs) => { cs.cycleText = isPrevCycle(cs.date) ? cycleLabel(cs.date) : ''; },
    onSave: saveLog, onCancel: () => cancelLog(false),
  });
  flashEmotion(emotion, 0);
  if (voice && say) speak(say);
}

function cancelLog(voice) {
  closeCard();
  reply([['log-cancelled']], 'greet', voice);
}

async function saveLog(st) {
  // จำหมวดที่บอสเลือกเอง (คำแรกของรายการ → หมวด)
  const mem = learned();
  for (const r of st.rows) if (r.picked && st.type !== 'รายรับ' && learnKey(r.item)) mem[learnKey(r.item)] = r.category;
  store.set(LEARNED_KEY, mem);

  const entries = st.rows.map((r) => ({
    date: iso(st.date), type: st.type, category: st.type === 'รายรับ' ? '' : r.category,
    item: String(r.item).trim(), amount: Number(r.amount), note: String(st.note || '').trim(),
  }));
  setBusy(true);
  flashEmotion('work', 0);
  const res = await sheet.addBatch(entries);
  renderPending();
  if (res.status === 'auth' || res.status === 'config') { setBusy(false); reply([['log-auth-failed']], 'sorry'); return; }
  if (res.status === 'failed') { setBusy(false); reply([['log-failed']], 'sorry'); return; }
  closeCard();
  if (res.status === 'queued') { reply([['log-queued', { pending: sheet.pendingCount() }]], 'sorry'); return; }

  // จดสำเร็จ: หมวดกิน → พูดยอดค่ากินที่เหลือ (ดึงสรุปของ Finance ใหม่ ใช้สูตรเดียวกับหน้าสรุป)
  const total = entries.reduce((a, e) => a + e.amount, 0);
  const many = entries.length > 1;
  const hasFood = entries.some((e) => e.type === 'รายจ่าย' && e.category === 'กิน');
  let parts = [];
  let emotion = 'ok';
  if (isPrevCycle(st.date)) {
    parts = [['log-saved-prev-cycle', { cycleText: res.data?.cycleText || cycleLabel(st.date).replace(/^รอบ /, '') }]];
    emotion = 'advise';
  } else if (st.type === 'รายรับ') {
    parts = [['log-saved-income', { amount: total }]];
  } else {
    const finApp = APPS.find((a) => a.id === 'finance-app');
    if (hasFood && finApp) await loadOne(finApp);
    const f = hasFood ? factsOf('finance-app') : null;
    const level = f && results['finance-app']?.status === 'ok' ? foodLevel(f, settings) : null;
    const nums = level && { left: fmtMoney(f.left), perDay: fmtMoney(f.perDay), daysLeft: f.daysToPayday, over: fmtMoney(f.over) };
    if (many) parts.push(['log-saved-multi', { count: entries.length, total }]);
    else if (nums) parts.push([f.over > 0 ? 'log-saved-food-over' : 'log-saved-food', nums]);
    else parts.push(['log-saved-other', { item: entries[0].item, amount: entries[0].amount, category: entries[0].category }]);
    if (nums) { parts.push([`log-saved-food-${level}`, nums]); emotion = LOG_EMOTION[level]; }
  }
  reply(parts, emotion);
  showUndoBar(res.batch);
}

// แถบ "เลิกทำ" 10 วินาทีหลังจด (กดแล้วลบทันที)
let undoTimer = null;
function showUndoBar(batch) {
  const n = batch.entries.length;
  $('#logUndoText').textContent = n > 1 ? `จด ${n} รายการแล้ว` : `จด${batch.entries[0].item} ${batch.entries[0].amount.toLocaleString('th-TH')} ฿ แล้ว`;
  $('#logUndo').hidden = false;
  $('#logUndoBtn').onclick = () => { $('#logUndo').hidden = true; doUndo(batch.batchId); };
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { $('#logUndo').hidden = true; }, 10000);
}

function askUndo(voice) {
  const b = sheet.history()[0];
  if (!b) { reply([['log-undo-none']], 'unsure', voice); return; }
  const e = b.entries[0];
  const [y, m, d] = e.date.split('-').map(Number);
  const when = new Date(y, m - 1, d);
  // log-undo-confirm มี 2 แบบ: ระบุรายการ (ชุดเดียว) / ระบุจำนวน (หลายรายการ) · ส่งเฉพาะตัวแปรที่ตรงกับชุด แบบที่ขาดตัวแปรจะถูกข้าม
  const vars = b.entries.length > 1 ? { count: b.entries.length } : { item: e.item, amount: e.amount, dateText: dateLabel(when) };
  let say = '';
  for (let i = 0; i < 6 && !say; i += 1) say = line('log-undo-confirm', vars);
  openAsk({
    say, lines: b.entries.map((x) => `${x.item} ${x.amount.toLocaleString('th-TH')} ฿`),
    onYes: () => doUndo(b.batchId), onNo: () => { closeCard(); endFlash(); },
  });
  flashEmotion('advise', 0);
  if (voice && say) speak(say);
}
const dateLabel = (d) => {
  const back = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  return back === 0 ? 'วันนี้' : back === 1 ? 'เมื่อวาน' : `วันที่ ${d.getDate()} ${TH_M[d.getMonth()]}`;
};

async function doUndo(batchId) {
  const b = sheet.history().find((x) => x.batchId === batchId);
  const r = await sheet.undoBatch(batchId);
  closeCard();
  if (r.ok) {
    // ลบภายใน 2 นาทีหลังจด = แซว · นานกว่านั้น = โอเค
    const quick = b && Date.now() - b.at < 120000;
    reply([[quick ? 'log-undo-done' : 'log-undo-done-late']], quick ? 'tease' : 'ok');
    const finApp = APPS.find((a) => a.id === 'finance-app');
    if (finApp) loadOne(finApp);
    return;
  }
  if (r.error === 'not-last' || r.error === 'changed') reply([['log-undo-blocked']], 'sorry');
  else if (r.error === 'not-found' || r.error === 'none') reply([['log-undo-none']], 'unsure');
  else if (r.error === 'auth' || r.error === 'config') reply([['log-auth-failed']], 'sorry');
  else reply([['log-failed']], 'sorry');
}

// รายการรอส่ง (เน็ตหลุดตอนจด)
function renderPending() {
  const n = sheet.pendingCount();
  const el = $('#logPending');
  el.hidden = !n;
  el.textContent = `รอส่ง ${n} รายการ ›`;
  if (!$('#logQueue').hidden) renderQueue();
}
function renderQueue() {
  const q = sheet.queue();
  $('#logQueueList').innerHTML = q.length ? q.map((b) => `<div class="glass conn" data-batch="${esc(b.batchId)}">
      ${b.entries.map((e) => `<div class="lq-line"><span>${esc(e.item)} · ${esc(e.category || e.type)}</span><b>${esc(e.amount.toLocaleString('th-TH'))} ฿</b></div>`).join('')}
      <div class="conn-actions"><button type="button" class="danger" data-q="drop">ลบ</button><button type="button" class="primary" data-q="send">ส่งตอนนี้</button></div>
    </div>`).join('') : '<p class="set-hint">ไม่มีรายการรอส่งแล้วค่ะ</p>';
}
$('#logPending').addEventListener('click', () => { renderQueue(); $('#logQueue').hidden = false; });
$('#logQueueBack').addEventListener('click', () => { $('#logQueue').hidden = true; });
$('#logQueueList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  const id = b.closest('[data-batch]').dataset.batch;
  if (b.dataset.q === 'drop') { if (confirm('ลบรายการนี้ออกจากคิว? (ยังไม่ได้จดลงชีต)')) sheet.dropQueued(id); }
  else {
    b.disabled = true;
    const r = await sheet.sendQueued(id);
    if (r.ok) reply([['log-queue-sent', { count: 1 }]], 'ok');
    else reply([[r.error === 'auth' || r.error === 'config' ? 'log-auth-failed' : 'log-failed']], 'sorry');
  }
  renderPending();
});
async function flushLogQueue() {
  if (!sheet.pendingCount()) return;
  const r = await sheet.flushQueue();
  renderPending();
  if (r.sent) reply([['log-queue-sent', { count: r.sent }]], 'ok');
  else if (sheet.staleQueued().length) reply([['log-queue-failed', { pending: sheet.pendingCount() }]], 'worry');
}
window.addEventListener('online', flushLogQueue);
bindCard();

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
  bumpListen();
  openReport();
  if (voiceMode === 'device') setTimeout(() => { if (!$('#speakBtn').classList.contains('on')) { fromBrief = true; $('#speakBtn').click(); } }, 350);
});
$('#reportBack').addEventListener('click', () => closeReport());
// แตะตรงไหนก็ได้บนหน้า welcome = ข้าม (ยกเว้นการ์ดตั้งค่าของแอปที่ยังไม่เชื่อม)
$('#sync').addEventListener('click', (e) => { if (!e.target.closest('#syncIssues a')) hideSync(); });
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-report]')) openReport();
  // กาง/หุบรายการย่อยของแจ้งเตือนที่รวมหลายงวด
  const pt = e.target.closest('[data-prep-toggle]');
  if (pt) {
    const open = pt.getAttribute('aria-expanded') !== 'true';
    pt.setAttribute('aria-expanded', String(open));
    pt.nextElementSibling.hidden = !open;
    fitHome();
    return;
  }
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
  // เวลาโหลดล่าสุดของแต่ละอย่าง (ดูความเร็วจริงบน iPhone)
  const lastOf = new Map();
  for (const p of perf) lastOf.set(p.tag, p);
  const perfText = [...lastOf.values()].filter((p) => !/POST/.test(p.tag)).map((p) => `${p.tag} ${(p.ms / 1000).toFixed(1)}s${p.ok ? '' : '✕'}`).join(' · ');
  $('#setFoot').textContent = perfText ? `${S.foot}\nโหลดล่าสุด: ${perfText}` : S.foot;

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
  const w = store.get('alpha.logWrite', {}) || {};
  $('#logUrl').value = w.url || '';
  $('#logToken').value = w.token || '';
  $('#lateCutoff').value = settings.lateNightCutoffHour;
  const mem = store.get('alpha.learnedCategory', {});
  $('#learnedList').innerHTML = Object.keys(mem).length
    ? Object.entries(mem).map(([k, v]) => `<span class="learned-chip">${esc(k)} → ${esc(v)}<button type="button" data-unlearn="${esc(k)}" aria-label="ลืมคำนี้">✕</button></span>`).join('')
    : '<span class="set-hint">ยังไม่มีค่ะ (เลือกหมวดเองบนการ์ดแล้วหนูจะจำ)</span>';
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
for (const id of ['logUrl', 'logToken']) {
  $(`#${id}`).addEventListener('change', () => sheet.saveWriteConfig({ url: $('#logUrl').value, token: $('#logToken').value }));
}
$('#lateCutoff').addEventListener('change', (e) => {
  const v = Math.min(12, Math.max(0, Math.round(Number(e.target.value) || 0)));
  settings.lateNightCutoffHour = v;
  e.target.value = v;
  saveSettings();
});
$('#learnedList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-unlearn]');
  if (!b) return;
  const mem = store.get('alpha.learnedCategory', {});
  delete mem[b.dataset.unlearn];
  store.set('alpha.learnedCategory', mem);
  renderSettings();
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
// โหลดหน้าแอปเก็บไว้ล่วงหน้า กดแล้วเปิดได้ทันที · ทำหลังซิงก์เสร็จ ไม่แย่งเน็ตตอนเปิดแอป
let prefetched = false;
function prefetchApps() {
  if (prefetched) return;
  prefetched = true;
  setTimeout(() => {
    for (const a of APPS) {
      for (const href of [a.path, `${a.path}styles.css`, `${a.path}app.js`]) {
        const l = document.createElement('link');
        l.rel = 'prefetch';
        l.href = href;
        document.head.appendChild(l);
      }
    }
  }, 800);
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
    if (voiceMode === 'device') bumpListen();
    openReport();
    // iPhone อาจไม่ยอมให้เล่นเสียงเองโดยไม่ได้แตะ ถ้าไม่ได้ก็แสดงสรุปอย่างเดียว (โหมด Siri ไม่สลับแอปเอง)
    if (voiceMode === 'device') setTimeout(() => { fromBrief = true; $('#speakBtn').click(); }, 700);
  };
  // รอหน้า welcome ปิดก่อน แล้วค่อยเปิดหน้าสรุป
  const wait = () => ($('#sync').hidden ? setTimeout(go, 300) : setTimeout(wait, 200));
  wait();
}

/* ---------- ตัวละครมีอารมณ์ (alpha-face.js) ---------- */
// หน้าแรก + avatar หน้าสรุป เปลี่ยนอารมณ์ตามสรุป · หน้าซิงก์ = ท่าทำงาน
const faces = [mountFace($('#alpha .char')), mountFace($('#rpAvatar .char'))];
let curEmotion = null;
function setEmotion(e) {
  if (e === curEmotion) return;
  curEmotion = e;
  // ระหว่างที่ตัวละครทำหน้าตอบคำสั่งอยู่ (flashEmotion) จำอารมณ์ไว้ก่อน แล้วค่อยเปลี่ยนตอนหมดเวลา
  if (!flashing) faces.forEach((f) => f.setEmotion(e));
}

/* ---------- เริ่ม ---------- */
// ข้อความคงที่ในหน้า HTML ดึงจาก messages.js
$('#orbBtn').setAttribute('aria-label', M.alphaLabel);
$('#headline').setAttribute('aria-label', M.headlineHint);
$('#cmdInput').placeholder = M.input.placeholder;
$('#syncSkip').textContent = M.sync.skip;
renderHome();
if (location.hash === '#report') openReport({ push: false });
else if (location.hash === '#settings') openSettings();
else if (needWelcome()) showSync();
document.documentElement.classList.remove('welcome'); // ส่งต่อจากสคริปต์ใน <head> ให้ hub คุมเอง
logPerf('first render', performance.now());
ready.then(() => renderHome()); // ประโยคพร้อมแล้ว: ใส่อารมณ์ตัวละครตามสรุป
refresh();
renderPending();
flushLogQueue();
