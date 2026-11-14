// คำสั่งสำเร็จรูปของช่องสั่งงาน (จับคำสำคัญ ไม่ใช้ AI ข้อมูลไม่ออกจากเครื่อง)
// runCommand คืน { say, sub?, go?, report? }
//   say    ข้อความตอบกลับ (แสดง + อ่านออกเสียงถ้าสั่งด้วยเสียง)
//   go     ลิงก์ที่จะเปิด
//   report true = เปิดหน้ารายงาน

import { M } from './messages.js';

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[?？!.]/g, '');
const stat = (sum, label) => sum?.stats?.find((x) => x.label === label);
const statText = (s) => (s ? `${s.value} ${s.unit}`.trim() : null);

// ctx = { apps, results: { [id]: { status, summary } }, alerts }
export function runCommand(text, ctx) {
  const q = norm(text);
  if (!q) return null;
  const sum = (id) => ctx.results[id]?.summary;
  const fuel = sum('fuel-logger');
  const fin = sum('finance-app');
  const find = (re) => ctx.alerts.filter((a) => re.test(a.text));
  const missing = (name) => ({ say: M.cmd.noData(name), sub: M.cmd.noDataSub });

  const appIn = (s) => ctx.apps.find((a) => s.includes(norm(a.name)) || s.includes(norm(a.id)) || a.keywords?.some((k) => s.includes(norm(k))));

  // "เปิด …" = เปิดแอปตามชื่อก่อนเสมอ
  if (/^(เปิด|ไป|open)/.test(q)) {
    const app = appIn(q.replace(/^(เปิดแอป|เปิด|ไปที่|ไป|open)/, ''));
    if (app) return { say: M.cmd.openApp(app.name), go: app.path };
  }

  // สรุปทั้งหมด
  if (/สรุป|รายงาน|วันนี้มีอะไร|มีอะไรบ้าง|brief|report/.test(q)) return { say: M.cmd.openReport, report: true };

  // เติมน้ำมัน → เปิดฟอร์มในแอป
  if (/เติมน้ำมัน|บันทึกน้ำมัน|เพิ่มน้ำมัน|addfuel|fillup/.test(q)) return { say: M.cmd.openFuelForm, go: '/fuel-logger/#add' };

  // ตั้งค่าแอป
  if (/ตั้งค่า|เชื่อมชีต|setup|settings/.test(q)) {
    const app = ctx.apps.find((a) => a.setupLink && a.keywords?.some((k) => q.includes(norm(k))));
    if (app) return { say: M.cmd.openSetup(app.name), go: app.setupLink };
  }

  // น้ำมัน / ระยะที่วิ่งได้
  if (/น้ำมัน.*(เหลือ|พอ|วิ่ง)|วิ่งได้|ระยะ(ที่)?เหลือ|อีกกี่(กม|กิโล)/.test(q)) {
    if (!fuel) return missing('Fuel Logger');
    const range = fuel.stats?.[0];
    const sub = M.cmd.fuelRateSub(statText(stat(fuel, 'อัตราเฉลี่ย')));
    if (range?.label === 'ถึงเวลาเติมน้ำมันแล้ว') return { say: M.cmd.fuelEmpty, sub, go: '/fuel-logger/#add' };
    return { say: M.cmd.fuelRange(statText(range)), sub };
  }
  if (/กินน้ำมัน|อัตรา|กม\/ล|กิโลต่อลิตร|ประหยัด/.test(q)) {
    if (!fuel) return missing('Fuel Logger');
    return { say: M.cmd.fuelRate(statText(stat(fuel, 'อัตราเฉลี่ย'))), sub: M.cmd.fuelCostSub(statText(stat(fuel, 'ต้นทุน'))) };
  }

  // รถ: เช็กระยะ ภาษี ประกัน พ.ร.บ.
  if (/เช็กระยะ|เช็คระยะ|ภาษี|ประกัน|พรบ|พ\.ร\.บ/.test(q)) {
    if (!fuel) return missing('Fuel Logger');
    const hits = find(/เช็กระยะ|ภาษี|ประกัน|พ\.ร\.บ/);
    return hits.length
      ? { say: hits.map((a) => a.text).join(' · '), go: hits[0].link }
      : { say: M.cmd.carNothingDue, go: '/fuel-logger/#care' };
  }

  // ผ่อน / งวด
  if (/ผ่อน|งวด|หนี้|installment|loan/.test(q)) {
    const hits = find(/ผ่อน|งวด/);
    if (hits.length) return { say: hits.map((a) => a.text).join(' · '), sub: fin ? M.cmd.loanPerMonthSub(statText(stat(fin, 'ผ่อน/เดือน'))) : undefined, go: hits[0].link };
    if (!fin) return missing('Finance');
    return { say: M.cmd.loanPerMonth(statText(stat(fin, 'ผ่อน/เดือน'))), sub: M.cmd.loanNothingDue, go: '/finance-app/#loans' };
  }

  // เงินเดือน
  if (/เงินเดือน|payday|salary/.test(q)) {
    if (!fin) return missing('Finance');
    return { say: M.cmd.payday(statText(stat(fin, 'ถึงเงินเดือน'))) };
  }

  // เงินเหลือ / งบ
  if (/เงิน|งบ|ใช้ไป|budget|money/.test(q)) {
    if (!fin) return missing('Finance');
    return { say: M.cmd.moneyLeft(statText(stat(fin, 'เหลือรอบนี้'))), sub: M.cmd.paydaySub(statText(stat(fin, 'ถึงเงินเดือน'))) };
  }

  // เปิดแอปตามชื่อ / คำสำคัญ
  const app = appIn(q);
  if (app) return { say: M.cmd.openApp(app.name), go: app.path };

  return { say: M.cmd.unknown, sub: M.cmd.unknownSub };
}
