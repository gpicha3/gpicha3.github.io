// Hub: หน้าแรก + หน้าซิงก์ + หน้ารายงาน + ช่องสั่งงาน
import APPS from './config.js';
import { runCommand } from './commands.js';
import { M, greeting } from './messages.js';

const $ = (s) => document.querySelector(s);
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
    for (const al of r.summary.alerts || []) out.push({ ...al, app: a });
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
  live.querySelector('b').textContent = syncing ? 'SYNCING' : anyError ? 'PARTIAL' : 'ONLINE';

  const alerts = allAlerts();
  const urgent = alerts.filter((a) => a.level === 'urgent').length;
  const soon = alerts.filter((a) => a.level === 'soon').length;
  const hasData = Object.values(results).some((r) => r.summary);
  const H = M.headline;
  $('#headline').innerHTML = urgent ? `<b class="u">${esc(H.urgent(urgent))}</b>${soon ? `${esc(H.join)}<b class="s">${esc(H.soon(soon))}</b>` : ''}`
    : soon ? `<b class="s">${esc(H.soon(soon))}</b>`
      : esc(!hasData && syncing ? H.loading : hasData ? H.allGood : H.noData);

  // ป้ายแจ้งเตือน: อันแรกเด่น + อีกไม่เกิน 2 อัน + ดูทั้งหมด
  const top = alerts.slice(0, 3);
  if (!top.length) $('#alerts').innerHTML = '';
  else {
    const [first, ...rest] = top;
    $('#alerts').innerHTML = `<div class="glass al-card">
      <a class="al-main" href="${esc(first.link || first.app.path)}">
        <span class="al-ic ${first.level}">!</span>
        <span class="al-text"><b>${esc(first.text)}</b><small>${esc(first.app.name)}</small></span>${CHEV}
      </a>
      ${rest.map((a) => `<a class="al-row" href="${esc(a.link || a.app.path)}"><span class="dot ${a.level}"></span><span>${esc(a.text)}</span><small>${esc(a.app.name)}</small></a>`).join('')}
      ${alerts.length > 1 ? `<button type="button" class="al-more" data-report>${esc(M.seeAll(alerts.length))}</button>` : ''}
    </div>`;
  }

  $('#apps').innerHTML = APPS.map(appCard).join('');
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
  const meta = r.status === 'error' ? `<div class="app-meta err mono">OFFLINE · ${esc(ago(r.at))}</div>`
    : r.status === 'loading' ? `<div class="app-meta mono">SYNCING…</div>`
      : `<div class="app-meta mono">${esc(M.card.updated(ago(r.at)))}</div>`;
  return `<a class="glass app" href="${esc(a.path)}">
    <span class="app-name" style="color:${esc(a.color)}">${icon}${esc(a.name)}</span>
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
function reportLines() {
  const alerts = allAlerts();
  const lines = [];
  for (const a of alerts) {
    const cls = a.level === 'urgent' ? 'u' : a.level === 'soon' ? 's' : 'i';
    lines.push({ html: `&gt; <span class="${cls}">${esc(M.report.level[a.level] || '')}</span> ${esc(a.text)}`, text: a.text, link: a.link || a.app.path });
  }
  for (const a of APPS) {
    const s = results[a.id]?.summary;
    if (!s || results[a.id].status === 'setup') continue;
    for (const b of s.brief || []) lines.push({ html: `&gt; ${esc(b)}`, text: b, link: a.path });
  }
  for (const a of APPS) {
    const r = results[a.id];
    if (r?.status === 'setup') lines.push({ html: `&gt; <span class="i">${esc(M.report.notSet(a.name))}</span>`, text: M.report.notSet(a.name), link: a.setupLink || a.path });
  }
  if (!alerts.length && lines.length) lines.unshift({ html: `&gt; <span class="i">${esc(M.report.nothingUrgent)}</span>`, text: M.report.nothingUrgent });
  if (!lines.length) lines.push({ html: `&gt; ${esc(M.report.empty)}`, text: M.report.empty });
  return lines;
}

function renderReport() {
  const mods = APPS.length;
  const anyError = Object.values(results).some((r) => r.status === 'error');
  $('#rpState').textContent = `${syncing ? 'SYNCING' : anyError ? 'PARTIAL' : 'ONLINE'} · ${mods} MODULES`;
  const ts = syncedAt || new Date();
  const lines = reportLines();
  $('#rpBody').innerHTML = `<div class="ts">[${clock(ts)}] ${syncing ? 'syncing…' : 'sync complete'}</div>
    <div class="hello">${esc(M.report.intro(greeting()))}</div>
    ${lines.map((l, i) => (l.link
      ? `<a class="rp-line" href="${esc(l.link)}" data-i="${i}"><span class="tx">${l.html}</span></a>`
      : `<div class="rp-line" data-i="${i}"><span class="tx">${l.html}</span></div>`)).join('')}
    <span class="cursor"></span>`;
  $('#rpModules').innerHTML = APPS.map((a, i) => {
    const r = results[a.id];
    const st = !a.summary ? ['LINK', 'var(--lav)'] : r.status === 'ok' ? ['ONLINE', a.color] : r.status === 'loading' ? ['SYNCING', 'var(--or)'] : r.status === 'setup' ? ['NOT SET', 'var(--rd)'] : ['OFFLINE', 'var(--rd)'];
    return `<a class="rp-mod" href="${esc(r?.status === 'setup' ? a.setupLink || a.path : a.path)}" style="color:${esc(st[1])};border-color:color-mix(in srgb, ${esc(st[1])} 35%, transparent)">
      <span>${String(i + 1).padStart(2, '0')}</span><span style="color:var(--ink)">${esc(a.id)}</span><small>${st[0]}</small>${CHEV}</a>`;
  }).join('');
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
function speak(text, onEnd) {
  if (!canSpeak || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'th-TH';
  const voice = thaiVoice();
  if (voice) u.voice = voice;
  u.rate = 1.02;
  u.onend = u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
}
function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
  $('#speakBtn').classList.remove('on');
}
if (!canSpeak) $('#speakBtn').hidden = true;
$('#speakBtn').addEventListener('click', () => {
  const btn = $('#speakBtn');
  if (btn.classList.contains('on')) { stopSpeaking(); return; }
  btn.classList.add('on');
  const text = [M.report.intro(greeting()).replace(/:$/, ''), ...reportLines().map((l) => l.text)].join(' . ');
  speak(text, () => btn.classList.remove('on'));
});

/* ---------- ช่องสั่งงาน ---------- */
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
  if (voice) speak(res.sub ? `${res.say} ${res.sub}` : res.say);
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
$('#orbBtn').addEventListener('click', () => openReport());
$('#reportBack').addEventListener('click', () => closeReport());
$('#syncSkip').addEventListener('click', hideSync);
document.addEventListener('click', (e) => { if (e.target.closest('[data-report]')) openReport(); });
// กลับมาที่ Hub (เช่นกดกลับจากแอป หรือสลับแอป) แล้วข้อมูลเก่ากว่า 2 นาที ให้ดึงใหม่เงียบ ๆ
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!syncedAt || Date.now() - syncedAt > 120000)) refresh();
});
window.addEventListener('pageshow', (e) => { if (e.persisted) refresh(); });

/* ---------- เริ่ม ---------- */
// ข้อความคงที่ในหน้า HTML ดึงจาก messages.js
$('.orb-hint').textContent = M.orbHint;
$('#cmdInput').placeholder = M.input.placeholder;
$('#sync h2').textContent = M.sync.title;
$('#syncSkip').textContent = M.sync.skip;
renderHome();
if (location.hash === '#report') openReport({ push: false });
else if (!session.get(SYNC_SEEN)) showSync();
refresh();
