# Alpha (repo gpicha3.github.io)

หน้ารวมแอปส่วนตัว "Alpha" ที่ https://gpicha3.github.io/ (ชื่อ repo และ URL ยังเป็น gpicha3.github.io) เป็นไอคอนเดียวบนหน้าจอโฮม iPhone แล้วเข้าแต่ละแอปจากที่นี่

- static ล้วน ไม่มี build tool ไม่มี service worker (ตั้งใจ)
- `manifest.webmanifest` ใช้ `start_url: "/"` และ `scope: "/"` แอปใต้ `/<ชื่อแอป>/` จึงเปิดในหน้าต่าง Hub เดิม ไม่เด้งไป Safari
- ทุกแอปใต้โดเมนนี้ใช้ localStorage ร่วมกัน (origin เดียวกัน) → key ของ Hub ขึ้นต้นด้วย `hub.` เสมอ และห้ามเขียนทับ key ของแอปอื่น

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `config.js` | รายการแอปทั้งหมด (แก้ที่นี่ที่เดียวเมื่อเพิ่มแอป) |
| `hub.js` | หน้าแรก, หน้า welcome (HUD), หน้ารายงาน, โหลด summary แบบขนาน + cache + timeout ต่อแอป, จับเวลาทุก request |
| `commands.js` | คำสั่งสำเร็จรูปของช่องสั่งงาน (จับคำสำคัญ ไม่ใช้ AI) |
| `messages.js` | ข้อความบนหน้าจอของ AI (ผู้หญิง ลงท้าย ค่ะ/คะ) |
| `messages/th.json` | ประโยคสรุปแบบพูดทั้งหมด (ตาราง key อยู่ที่ `messages/README.md`) |
| `speech.js` | แต่งประโยคสรุปจาก `facts` ของแต่ละแอป: เลือก key, สุ่มแบบ seed รายวัน, กันซ้ำ, หัว/ท้าย |
| `alpha-face.js` | ตัวละครมีอารมณ์ (SVG วาดทับรูป) · ตำแหน่งตา/ปากอยู่ใน `FACE` ที่เดียว |
| `log/parse.js` | แกะข้อความจดรายรับรายจ่าย (+ เสียง → ตัวเลข) ไม่แตะ DOM · เทสต์: `node --test tests/parse.test.mjs` |
| `log/categories.js` + `data/categoryWords.th.json` | คำ → หมวด (คำยาวก่อน · คำที่บอสสอนใน `alpha.learnedCategory` มาก่อน) |
| `log/card.js` | การ์ดยืนยันก่อนจด / การ์ดถามก่อนลบ |
| `log/sheet.js` | ส่งไป Apps Script (doPost) · คิวตอนเน็ตหลุด `alpha.logQueue` · ประวัติ 5 ชุด `alpha.logHistory` · รหัส `alpha.logWrite` |
| `styles.css` | ธีมออโรร่า ม่วง-ชมพู รองรับ safe-area |
| `templates/summary.template.js` | template สำหรับ summary.js ของแอปใหม่ |

localStorage ที่ Alpha ใช้: `hub.cache.v1` (ผลสรุปล่าสุด) · `hub.tease` / `hub.listens` (แซว) · `alpha.logWrite` / `alpha.logQueue` / `alpha.logHistory` / `alpha.learnedCategory` (จดรายรับรายจ่าย) · `hub.voice` (โหมดเสียง) · `hub.speech.v1` (ประโยคที่ใช้ล่าสุดของแต่ละ key) · `alpha.settings` (ตั้งค่า) · `hub.welcomeDay` (วันที่แสดงหน้า welcome ล่าสุด) · `hub.perf` (เวลาโหลด 30 ครั้งล่าสุด แสดงท้ายหน้าตั้งค่า) ·
`alpha.theme` (ธีมสี — fuel-logger/finance-app อ่าน key นี้ใน theme.js ของตัวเองด้วย ดูตาราง apps ใน `alpha-theme.js`)

ไฟล์อื่น: `alpha-theme.js` (ธีม 6 ชุด โหลดใน head) · `assets/alpha-character.png` (ตัวละคร ห้ามแก้หน้า/ผม) ·
`assets/alpha-shirt-mask.png` (mask เฉพาะเสื้อ ใช้ tint สีตามธีม)

## ขั้นตอนเพิ่มแอปเข้า Hub

1. **เพิ่ม entry ใน `config.js`**: `id`, `name`, `desc`, `path`, `icon`, `color` (+ `keywords` สำหรับสั่ง "เปิด …")
2. **ถ้าต้องการการ์ดสรุป/แจ้งเตือน**: ก๊อป `templates/summary.template.js` ไปเป็น `<แอป>/summary.js` แล้วใส่ `summary` และ `setupLink` ใน config
   - contract: `export async function getSummary()` คืน
     `{ app, title, stats: [{label, value, unit}], alerts: [{level: "urgent"|"soon"|"info", text, dueDate, link}], facts?: {...}, brief?: string[], needsSetup?: true }`
   - `facts` = ข้อมูลดิบ (ตัวเลข/สถานะ) สำหรับสรุปแบบพูด **แอปไม่ส่งประโยค** hub เป็นที่เดียวที่แปลงเป็นประโยค (`speech.js` + `messages/th.json`)
     finance-app: `{ left, perDay, daysToPayday, over, prevOver, prevLeft, installments: [{days, count, total}], lastInstallments: [name],`
       `payday: {days, date, ttb, cc, total, fallback}, makeLeft, makeOutThisCycle, stockValue, stockPnl, savingsTotal, foodActual, foodOver, foodBudget }`
       (payday = ยอดเตรียมวันเงินเข้า จาก Fix cost: ttb + บิลบัตร "CC - …" · fallback = ยังไม่มีบิลบัตร ใช้ยอดจาก Installments)
     fuel-logger: `{ fuelLow, kmPerL, reminders: [{type: service|appt|tax|insurance|act, days, byKm?, leftKm?, near?}] }`
     แอปใหม่ที่อยากมีประโยคพูด: เพิ่ม key ใน `messages/th.json` + ส่วนเลือก key ใน `speech.js` → `compose()` และใส่ id ใน `SPEECH_APPS` (hub.js)
     แอปที่ไม่มี facts: hub อ่าน `alerts[].text` ต่อท้ายเป็น "เรื่องอื่นๆ"
   - ช่องเสริมของ alert: `items: [{text, link}]` = รายการย่อย (Alpha แสดงบรรทัดเดียว กดแล้วกาง) ·
     `kind: "payday", lines: [{label, amount}], total, note?` = ยอดเตรียมวันเงินเข้า (Alpha แสดงทุกบรรทัด + ยอดรวม ไม่ต้องกาง) ·
     `kind: "pace", amount` = Alpha ซ่อนถ้า amount < เกณฑ์ในหน้าตั้งค่า (`alpha.settings.paceMin`, ค่าเริ่มต้น 100)
   - เรื่องเงิน/งวดผ่อนทั้งหมดมาจาก finance-app ที่เดียว (fuel-logger ส่งเฉพาะเรื่องรถ)
   - ใช้สูตรตัวเดียวกับแอป ห้ามเขียนซ้ำ ถ้าสูตรปนอยู่กับโค้ดหน้าจอ ให้แยกเป็นไฟล์ที่ไม่แตะ DOM (เช่น `core.js`) แล้วให้ทั้งแอปและ summary.js ใช้ร่วมกัน
   - ยังไม่ตั้งค่า → คืน `{ needsSetup: true }` · โหลดไม่สำเร็จ → `throw` (Hub แสดงการ์ด OFFLINE ให้เอง หน้าอื่นไม่พัง)
   - `link` ใช้ hash เปิดหน้าในแอปได้ เช่น `/fuel-logger/#loan` (แอปต้องอ่าน `location.hash` ตอนเปิด)
   - ถ้าแอปมี service worker อย่าลืมเพิ่ม `summary.js` และไฟล์สูตรใน ASSETS แล้ว bump ชื่อ cache
3. **เพิ่มปุ่มกลับ Hub ในแอป**: ลิงก์ไป `/` (ดูตัวอย่าง `.hub-back` ใน fuel-logger / finance-app) วางให้กลมกลืนกับ UI เดิม ไม่บังของเดิม
4. **แอปต้อง deploy ใต้ `gpicha3.github.io/<ชื่อแอป>/`** (GitHub Pages ของ repo ชื่อเดียวกัน) ถ้าอยู่โดเมนอื่น ให้เป็นการ์ดลิงก์ธรรมดา ไม่ใส่ `summary` (import ข้ามโดเมนและ localStorage คนละ origin ใช้ไม่ได้)

## ทดสอบในเครื่อง

ต้องเสิร์ฟให้ path เหมือนบน GitHub Pages: Hub อยู่ที่ `/` และแต่ละแอปอยู่ที่ `/<ชื่อแอป>/`
เช่นสร้างโฟลเดอร์ทดสอบที่มี symlink ของไฟล์ Hub + โฟลเดอร์แอป แล้ว `python3 -m http.server`

## หมายเหตุ iPhone

- ไอคอนบนหน้าจอโฮมแต่ละอันมี storage แยกกัน ติดตั้ง Hub ใหม่แล้วต้องวาง setup code ในแต่ละแอป (ผ่าน Hub) อีกครั้ง
- ไมค์ใช้ Web Speech API ถ้าเครื่องไม่รองรับ จะแนะนำให้ใช้ปุ่มไมค์บนคีย์บอร์ดแทน
- เสียงอ่านมี 2 โหมด (เลือกในหน้ารายงาน เก็บใน `hub.voice`): เสียงในเครื่อง (`speechSynthesis`) หรือ Siri ผ่านคำสั่งลัด
  `shortcuts://run-shortcut?name=Alpha พูด&input=text&text=…` คำสั่งลัดต้องมีแอคชัน "พูดข้อความ" ที่รับอินพุตคำสั่งลัด
  (หน้าเว็บใช้เสียง Siri เองไม่ได้) ชื่อคำสั่งลัดตั้งที่ `messages.js` → `voice.shortcutName`
