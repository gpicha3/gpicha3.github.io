// รัน: node --test tests/parse.test.mjs   (ข้อมูลสมมติเท่านั้น)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLog, normalizeSpoken, thaiWordsToNumber, iso } from '../log/parse.js';
import { categorize } from '../log/categories.js';

const table = JSON.parse(readFileSync(new URL('../data/categoryWords.th.json', import.meta.url), 'utf8'));
const NOW = new Date(2026, 10, 15, 14, 0); // 15 พ.ย. 2026 บ่ายสอง
const P = (t, o = {}) => parseLog(t, { now: NOW, ...o });
const items = (r) => r.entries.map((e) => [e.item, e.amount, e.type, categorize(e.item, { table }).category]);

test('ตัวอย่าง 15 แบบในสเปก', () => {
  assert.deepEqual(items(P('ข้าว 60')), [['ข้าว', 60, 'รายจ่าย', 'กิน']]);
  assert.equal(P('ข้าว 60').date.getDate(), 15);
  assert.deepEqual(items(P('จ่ายกาแฟ 45')), [['กาแฟ', 45, 'รายจ่าย', 'กิน']]);
  assert.deepEqual(items(P('ข้าวเย็น 40')), [['ข้าวเย็น', 40, 'รายจ่าย', 'กิน']]);
  assert.deepEqual(items(P('ข้าว 60 กาแฟ 45')), [['ข้าว', 60, 'รายจ่าย', 'กิน'], ['กาแฟ', 45, 'รายจ่าย', 'กิน']]);
  assert.equal(P('ข้าว 60, กาแฟ 45').entries.length, 2);
  assert.equal(P('ข้าว 60\nกาแฟ 45').entries.length, 2);
  assert.deepEqual(items(P('ชานม 2 แก้ว 90')), [['ชานม 2 แก้ว', 90, 'รายจ่าย', 'กิน']]);
  const y = P('เมื่อวาน ข้าว 80');
  assert.deepEqual(items(y), [['ข้าว', 80, 'รายจ่าย', 'กิน']]);
  assert.equal(iso(y.date), '2026-11-14');
  assert.equal(y.dateText, 'เมื่อวาน');
  const d = P('12/11 ส้มตำ 70');
  assert.equal(iso(d.date), '2026-11-12');
  assert.deepEqual(items(d), [['ส้มตำ', 70, 'รายจ่าย', 'กิน']]);
  assert.deepEqual(items(P('grab 120')), [['grab', 120, 'รายจ่าย', 'เดินทาง']]);
  assert.deepEqual(items(P('grab food 189')), [['grab food', 189, 'รายจ่าย', 'กิน']]);
  assert.deepEqual(items(P('bts 47 ค่าจอดรถ 40')), [['bts', 47, 'รายจ่าย', 'เดินทาง'], ['ค่าจอดรถ', 40, 'รายจ่าย', 'เดินทาง']]);
  assert.deepEqual(items(P('เซเว่น 85')), [['เซเว่น', 85, 'รายจ่าย', 'กิน']]);
  assert.equal(categorize('เซเว่น', { table }).guess, true);
  assert.deepEqual(items(P('ผงซักฟอก 129')), [['ผงซักฟอก', 129, 'รายจ่าย', 'ของใช้']]);
  const n = P('หนัง 240 #กับไอซ์');
  assert.deepEqual(items(n), [['หนัง', 240, 'รายจ่าย', 'เที่ยว']]);
  assert.equal(n.note, 'กับไอซ์');
  assert.deepEqual(items(P('รายรับ 500 ขายของ')).map((x) => x.slice(0, 3)), [['ขายของ', 500, 'รายรับ']]);
  assert.deepEqual(items(P('+500 ขายของ')).map((x) => x.slice(0, 3)), [['ขายของ', 500, 'รายรับ']]);
  assert.deepEqual(items(P('ได้เงินคืน 300 จากแบงค์')).map((x) => x.slice(0, 3)), [['ได้เงินคืน จากแบงค์', 300, 'รายรับ']]);
});

test('รูปแบบจำนวนเงิน', () => {
  assert.equal(P('ข้าว 60บ').entries[0].amount, 60);
  assert.equal(P('ข้าว 60 บาท').entries[0].amount, 60);
  assert.equal(P('ข้าว60').entries[0].amount, 60);
  assert.equal(P('ทีวี 1,200').entries[0].amount, 1200);
  assert.equal(P('ทีวี 1.2k').entries[0].amount, 1200);
  assert.equal(P('ทีวี 1k').entries[0].amount, 1000);
  assert.equal(P('กาแฟ 45.50').entries[0].amount, 45.5);
  assert.equal(P('ข้าว ๖๐').entries[0].amount, 60);
});

test('เคสขอบ', () => {
  assert.deepEqual(items(P('60')), [['', 60, 'รายจ่าย', null]]);
  assert.equal(P('ข้าว').intent, 'none');
  assert.deepEqual(items(P('7-11 85')), [['7-11', 85, 'รายจ่าย', 'กิน']]);
  assert.deepEqual(items(P('711 85')), [['711', 85, 'รายจ่าย', 'กิน']]);
  const c = P('เมื่อวาน 12/11 ข้าว 50');
  assert.equal(iso(c.date), '2026-11-12');
  assert.equal(c.dateGuess, true);
  assert.deepEqual(items(P('ข้าว+กาแฟ 105')), [['ข้าว+กาแฟ', 105, 'รายจ่าย', 'กิน']]);
  assert.equal(iso(P('วันที่ 12 ข้าว 50').date), '2026-11-12');
  assert.equal(iso(P('12 ส้มตำ 70').date), '2026-11-12');
  assert.equal(iso(P('วันที่ 20 ข้าว 50').date), '2026-10-20'); // ยังไม่ถึง → เดือนก่อน
  assert.equal(P('20/11 ข้าว 50').dateError, 'future');
  assert.equal(P('1/9 ข้าว 50').dateError, 'old');
  assert.equal(iso(P('12/11/69 ข้าว 50').date), '2069-11-12'); // ปี ค.ศ. 2 หลัก
  assert.equal(iso(P('12/11/2569 ข้าว 50').date), '2026-11-12'); // ปี พ.ศ.
});

test('ลำดับการตีความ', () => {
  assert.equal(P('ยกเลิก').intent, 'undo');
  assert.equal(P('ลบอันล่าสุด').intent, 'undo');
  assert.equal(P('ไม่เอา').intent, 'cancel');
  assert.equal(P('รูดบัตร 500 ข้าว').intent, 'card');
  const f = P('เติมน้ำมัน 1000');
  assert.equal(f.intent, 'fuel');
  assert.equal(f.fuelAmount, 1000);
  assert.equal(P('e20 900').fuelAmount, 900);
  assert.equal(P('95 1200').fuelAmount, 1200);
  assert.equal(P('เติมเกม 100').intent, 'entries'); // ไม่ใช่น้ำมัน
  assert.equal(P('เงินเหลือเท่าไหร่').intent, 'question');
  assert.equal(P('เปิดแอปรถ').intent, 'question');
  assert.equal(P('สรุป').intent, 'none');
  assert.equal(P('จ่ายค่าข้าว').logish, true);
});

test('กฎหลังเที่ยงคืน', () => {
  const late = parseLog('ข้าวเย็น 40', { now: new Date(2026, 10, 15, 1, 0) });
  assert.equal(iso(late.date), '2026-11-14');
  assert.equal(late.lateNight, true);
  assert.equal(late.dateGuess, true);
  assert.equal(iso(parseLog('ข้าวเย็น 40', { now: new Date(2026, 10, 15, 1, 0), cutoff: 0 }).date), '2026-11-15');
  assert.equal(iso(parseLog('วันนี้ ข้าว 40', { now: new Date(2026, 10, 15, 1, 0) }).date), '2026-11-15');
});

test('เสียง: เลขแบบคำ', () => {
  assert.equal(thaiWordsToNumber('หกสิบ'), 60);
  assert.equal(thaiWordsToNumber('ร้อยยี่สิบ'), 120);
  assert.equal(thaiWordsToNumber('พันสอง'), 1200);
  assert.equal(thaiWordsToNumber('สองร้อยห้าสิบ'), 250);
  assert.equal(thaiWordsToNumber('สิบเอ็ด'), 11);
  assert.equal(normalizeSpoken('ข้าวหกสิบบาท'), 'ข้าว 60');
  assert.deepEqual(items(parseLog('แกร็บร้อยยี่สิบบาท', { now: NOW, spoken: true })), [['grab', 120, 'รายจ่าย', 'เดินทาง']]);
  assert.deepEqual(items(parseLog('บีทีเอส สี่สิบเจ็ด', { now: NOW, spoken: true })), [['bts', 47, 'รายจ่าย', 'เดินทาง']]);
});

test('คำที่บอสสอน มาก่อนตาราง และไม่ขึ้นป้ายหนูเดา', () => {
  assert.equal(categorize('ร้านป้าแดง', { table }).category, null);
  const r = categorize('ร้านป้าแดง', { table, learned: { 'ร้านป้าแดง': 'กิน' } });
  assert.deepEqual([r.category, r.guess], ['กิน', false]);
  assert.equal(categorize('เซเว่น', { table, learned: { 'เซเว่น': 'ของใช้' } }).category, 'ของใช้');
});
