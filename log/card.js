// การ์ดยืนยันก่อนจด (แก้ได้ทุกช่อง) · แสดงผลอย่างเดียว การส่ง/พูดอยู่ที่ hub.js
import { CATEGORIES } from './categories.js';
import { iso, dateText, MAX_BACK_DAYS } from './parse.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString('th-TH', { maximumFractionDigits: 2 }) : '');
// เตือนเลขแปลก (ไม่บล็อก): กิน > 1,500 · อื่นๆ > 5,000
export const isBig = (r) => r.amount > (r.category === 'กิน' ? 1500 : 5000);

let state = null;
const root = () => document.getElementById('logCard');
export const isOpen = () => !!state;

/**
 * @param {{ rows: {item, amount, category, guess}[], type, date: Date, dateGuess, note, raw?, say, onSave(result), onCancel(), onChange?(state) }} opts
 */
export function openCard(opts) {
  state = { ...opts, rows: opts.rows.map((r) => ({ ...r, picked: false })), busy: false };
  render();
  root().hidden = false;
}
export function closeCard() {
  state = null;
  const el = root();
  el.hidden = true;
  el.innerHTML = '';
}
export function setBusy(on) { if (state) { state.busy = on; render(); } }
export function setSay(text) { if (state) { state.say = text; const s = root().querySelector('.lc-say'); if (s) s.textContent = text; } }

export function cardState() { return state; }

function valid() {
  return state.rows.length > 0 && state.rows.every((r) => String(r.item).trim() && r.amount > 0 && (state.type === 'รายรับ' || r.category));
}

function dateOptions() {
  const now = new Date();
  const cur = iso(state.date);
  let html = '';
  for (let i = 0; i <= MAX_BACK_DAYS; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    html += `<option value="${iso(d)}"${iso(d) === cur ? ' selected' : ''}>${esc(dateText(d, now))}${i > 1 ? '' : ` ${d.getDate()}`}</option>`;
  }
  return html;
}

function render() {
  const el = root();
  if (!state) return;
  const income = state.type === 'รายรับ';
  const missingCat = !income && state.rows.some((r) => !r.category);
  const total = state.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  el.innerHTML = `<div class="lc glass" role="dialog" aria-label="ยืนยันการจด">
    <div class="lc-head"><i class="al-face"><img src="/assets/alpha-character.png" alt=""></i><p class="lc-say">${esc(state.say)}</p></div>
    <button type="button" class="lc-type ${income ? 'in' : 'out'}" data-lc="type">${income ? 'รายรับ' : 'รายจ่าย'} ⇄</button>
    ${state.rows.map((r, i) => `<div class="lc-row" data-i="${i}">
      <div class="lc-line">
        <input class="lc-item" data-lc="item" value="${esc(r.item)}" placeholder="รายการ" autocomplete="off">
        <span class="lc-amt${isBig(r) ? ' big' : ''}"><input data-lc="amount" inputmode="decimal" value="${esc(r.amount || '')}" placeholder="0" autocomplete="off"><small>฿</small></span>
        ${state.rows.length > 1 ? `<button type="button" class="lc-del" data-lc="del" aria-label="เอาแถวนี้ออก">✕</button>` : ''}
      </div>
      ${income ? '' : `<div class="lc-cats${r.guess && r.category ? ' guess' : ''}">${CATEGORIES.map((c) => `<button type="button" class="lc-chip${c === r.category ? ' on' : ''}" data-lc="cat" data-cat="${c}">${c}</button>`).join('')}${r.guess && r.category ? '<em>หนูเดา</em>' : ''}</div>`}
    </div>`).join('')}
    ${state.rows.length > 1 ? `<div class="lc-total">รวม ${fmt(total)} ฿</div>` : ''}
    <div class="lc-meta">
      <label class="lc-date${state.dateGuess ? ' guess' : ''}">📅 <select data-lc="date">${dateOptions()}</select>${state.dateGuess ? '<em>หนูเดา</em>' : ''}</label>
      <input class="lc-note" data-lc="note" value="${esc(state.note)}" placeholder="#หมายเหตุ" autocomplete="off">
    </div>
    ${state.cycleText ? `<p class="lc-hint">ลง${esc(state.cycleText)}</p>` : ''}
    ${state.raw ? `<p class="lc-raw">ได้ยินว่า: “${esc(state.raw)}”</p>` : ''}
    <div class="lc-actions">
      <button type="button" data-lc="cancel">ยกเลิก</button>
      <button type="button" class="primary" data-lc="save"${valid() && !state.busy ? '' : ' disabled'}>${state.busy ? 'กำลังจด…' : missingCat ? 'เลือกหมวดก่อนนะคะ' : 'จดเลย ✓'}</button>
    </div>
  </div>`;
}

// อัปเดตข้อมูลจากช่องที่พิมพ์ โดยไม่ render ใหม่ (ไม่ให้เคอร์เซอร์หลุด)
function syncButton() {
  const btn = root().querySelector('[data-lc="save"]');
  if (!btn || state.busy) return;
  const missingCat = state.type !== 'รายรับ' && state.rows.some((r) => !r.category);
  btn.disabled = !valid();
  btn.textContent = missingCat ? 'เลือกหมวดก่อนนะคะ' : 'จดเลย ✓';
}

export function bindCard() {
  const el = root();
  el.addEventListener('input', (e) => {
    if (!state) return;
    const t = e.target;
    const row = state.rows[+t.closest('.lc-row')?.dataset.i];
    if (t.dataset.lc === 'item' && row) row.item = t.value;
    if (t.dataset.lc === 'amount' && row) {
      row.amount = Number(String(t.value).replace(/,/g, '')) || 0;
      t.parentElement.classList.toggle('big', isBig(row));
    }
    if (t.dataset.lc === 'note') state.note = t.value;
    syncButton();
  });
  el.addEventListener('change', (e) => {
    if (!state || e.target.dataset.lc !== 'date') return;
    const [y, m, d] = e.target.value.split('-').map(Number);
    state.date = new Date(y, m - 1, d);
    state.dateGuess = false;
    state.onChange?.(state);
    render();
  });
  el.addEventListener('click', (e) => {
    if (!state) return;
    const b = e.target.closest('[data-lc]');
    if (!b) return;
    const row = state.rows[+b.closest('.lc-row')?.dataset.i];
    switch (b.dataset.lc) {
      case 'type': state.type = state.type === 'รายรับ' ? 'รายจ่าย' : 'รายรับ'; render(); break;
      case 'cat': row.category = b.dataset.cat; row.guess = false; row.picked = true; render(); break;
      case 'del': state.rows.splice(+b.closest('.lc-row').dataset.i, 1); render(); break;
      case 'cancel': state.onCancel(); break;
      case 'save': if (valid() && !state.busy) state.onSave(state); break;
      default:
    }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && state && valid() && !state.busy && e.target.tagName === 'INPUT') { e.preventDefault(); state.onSave(state); }
  });
}

// การ์ดถามยืนยันแบบสั้น (ใช้กับ "ลบรายการล่าสุด")
export function openAsk({ say, lines = [], yes = 'ลบเลย', onYes, onNo }) {
  state = { ask: true, say, rows: [], busy: false, onSave: onYes, onCancel: onNo };
  const el = root();
  el.innerHTML = `<div class="lc glass" role="dialog" aria-label="ยืนยัน">
    <div class="lc-head"><i class="al-face"><img src="/assets/alpha-character.png" alt=""></i><p class="lc-say">${esc(say)}</p></div>
    ${lines.map((l) => `<div class="lc-ask-line">${esc(l)}</div>`).join('')}
    <div class="lc-actions"><button type="button" data-ask="no">ไม่ลบ</button><button type="button" class="primary" data-ask="yes">${esc(yes)}</button></div>
  </div>`;
  el.hidden = false;
  el.querySelector('[data-ask="yes"]').onclick = () => { const b = el.querySelector('[data-ask="yes"]'); b.disabled = true; b.textContent = 'กำลังลบ…'; onYes(); };
  el.querySelector('[data-ask="no"]').onclick = () => onNo();
}
