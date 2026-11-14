// Template: summary.js สำหรับแอปใหม่ที่อยากให้มีการ์ดสรุป/แจ้งเตือนใน Hub
// ก๊อปไฟล์นี้ไปไว้ที่ <แอป>/summary.js แล้วแก้ส่วนที่มี TODO
//
// กติกา
// - เป็น ES module ที่ export async function getSummary()
// - ห้ามเขียนสูตรคำนวณซ้ำ: import สูตรตัวเดียวกับที่แอปใช้ (แยกเป็นไฟล์ที่ไม่แตะ DOM เช่น core.js / calc.js)
// - อ่าน setup ของแอปจาก localStorage ได้ แต่ห้ามเขียนทับ key ของแอป
// - ถ้ายังไม่ได้ตั้งค่า ให้คืน { needsSetup: true } แทนการ throw
// - ถ้าโหลดไม่สำเร็จ ให้ throw Error (เช่น 'unauthorized') Hub จะแสดงการ์ด OFFLINE ให้เอง

import './core.js'; // TODO: ไฟล์สูตรของแอป (classic script ที่ตั้ง globalThis.<ชื่อ> ก็ import แบบนี้ได้)

const BASE = new URL('./', import.meta.url).pathname; // เช่น /my-app/
const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
};

export const app = 'my-app'; // TODO: ตรงกับ id ใน config.js ของ Hub

/**
 * @returns {Promise<{
 *   app: string, title: string, needsSetup?: boolean,
 *   stats: { label: string, value: string, unit: string }[],          // 2–3 ค่า ตัวแรกแสดงตัวใหญ่บนการ์ด
 *   alerts: { level: 'urgent'|'soon'|'info', text: string, dueDate: string|null, link: string }[],
 *   brief?: string[]                                                    // บรรทัดสรุปในหน้ารายงาน
 * }>}
 */
export async function getSummary() {
  const setup = read('my-app.setup', null); // TODO: key setup ของแอป
  if (!setup) return { app, title: 'My App', needsSetup: true, stats: [], alerts: [] };

  // TODO: ดึงข้อมูลด้วยฟังก์ชันเดียวกับแอป แล้วคำนวณด้วยสูตรเดียวกับแอป
  // const data = await globalThis.MyCore.apiGet(setup);
  // const total = globalThis.MyCore.total(data);

  return {
    app,
    title: 'My App',
    stats: [
      { label: 'ตัวอย่าง', value: '0', unit: 'ชิ้น' },
    ],
    alerts: [
      // ระดับ: urgent = เลยกำหนดหรือเหลือ ≤ 3 วัน, soon = ≤ 14 วัน, info = แจ้งให้ทราบ
      // { level: 'soon', text: 'ต่ออายุสมาชิก · อีก 5 วัน', dueDate: '2026-11-20', link: `${BASE}#settings` },
    ],
    brief: [],
  };
}
