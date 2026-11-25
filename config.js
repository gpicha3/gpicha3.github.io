// รายการแอปทั้งหมดใน Hub — เพิ่มแอปใหม่ที่ไฟล์นี้ไฟล์เดียว (ดูขั้นตอนใน CLAUDE.md)
//
// id        ชื่อสั้นไม่ซ้ำ ใช้เป็น key ของ cache
// name      ชื่อที่แสดง
// desc      คำอธิบายสั้น ๆ
// path      ที่อยู่ของแอป (ต้องอยู่ใต้ gpicha3.github.io/<ชื่อแอป>/ ถึงจะเปิดในหน้าต่าง Hub เดิมได้)
// icon      ไอคอนสี่เหลี่ยม (แนะนำ 192×192)
// color     สีประจำแอปบนการ์ด
// summary   (ไม่บังคับ) ไฟล์ที่ export getSummary() ถ้าไม่มี การ์ดจะเป็นลิงก์ธรรมดา
// setupKey  (ไม่บังคับ) key ใน localStorage ที่แอปเก็บ Setup code ({url, k}) — ตั้งค่าได้ที่หน้าตั้งค่าของ Alpha ที่เดียว
// setupLink (ไม่บังคับ) ลิงก์ไปตั้งค่าการเชื่อมต่อ (ตอนนี้ = หน้าตั้งค่าของ Alpha)
// longPress (ไม่บังคับ) กดค้างที่การ์ดแล้วเปิดลิงก์นี้แทน (เช่น ฟอร์มเติมน้ำมัน)
// keywords  (ไม่บังคับ) คำที่ใช้สั่ง "เปิด …" จากช่องสั่งงาน
export default [
  {
    id: 'fuel-logger',
    name: 'Fuel Logger',
    desc: 'บันทึกน้ำมัน · ดูแลรถ',
    path: '/fuel-logger/',
    icon: '/fuel-logger/icons/icon-192.png',
    color: '#9ff0c4',
    summary: '/fuel-logger/summary.js',
    longPress: '/fuel-logger/#add',
    setupKey: 'fl.setup',
    setupLink: '/#settings',
    keywords: ['fuel', 'น้ำมัน', 'รถ'],
  },
  {
    id: 'finance-app',
    name: 'Finance',
    desc: 'รอบเงินเดือน · งบ · ผ่อน',
    path: '/finance-app/',
    icon: '/finance-app/icons/icon-192.png',
    color: '#d2c2ff',
    summary: '/finance-app/summary.js',
    setupKey: 'fa.setup',
    setupLink: '/#settings',
    keywords: ['finance', 'การเงิน', 'เงิน'],
  },
  {
    // หน้าแชตตัวจริงอยู่บน PC (repo alpha → app/) ผ่าน Tailscale · /chat/ ฝังด้วย iframe + ขึ้น "ออฟไลน์" ถ้า PC ปิด
    id: 'chat',
    name: 'แชต',
    desc: 'คุยกับน้องอัลบน PC',
    path: '/chat/',
    icon: '/chat/icon-192.png',
    color: '#ff7ab6',
    keywords: ['chat', 'แชต', 'คุย', 'น้องอัล'],
  },
];
