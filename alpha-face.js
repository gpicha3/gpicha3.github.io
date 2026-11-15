// ตัวละคร Alpha มีอารมณ์: วาด SVG ทับรูปเดิม (รูปต้นฉบับไม่ถูกแก้)
// ปิดตา/ปากเดิมด้วยแผ่นสีผิว แล้ววาดใหม่ตามอารมณ์ · หายใจ · กะพริบตาเอง · ปากขยับตอนพูด
//
// เปลี่ยนรูปตัวละครทีหลัง: แก้ FACE ด้านล่างที่เดียว (พิกัดอิงขนาดรูปจริง viewBox)

export const FACE = {
  viewBox: [868, 1200],          // ขนาดรูป assets/alpha-character.png
  skin: '#FFDAC7',               // สีแผ่นปิดตา/ปากเดิม (สีผิว)
  line: '#111',                  // สีเส้น
  stroke: 6,
  eyeL: { x: 361, y: 313.5 },    // จุดกลางตาซ้าย
  eyeR: { x: 517, y: 312.5 },    // จุดกลางตาขวา
  eyePatch: { rx: 21, ry: 25 },  // แผ่นปิดตาเดิม
  mouth: { x: 441, y: 420 },     // จุดกลางปาก (ปากเดิม bbox x395–488 y409–430)
  mouthPatch: { x: 386, y: 400, w: 111, h: 40 },
  cheekL: { x: 336, y: 357 },    // แก้มแดง
  cheekR: { x: 545, y: 357 },
  acc: { x: 730, y: 150 },       // จุดวางของประกอบ (หลอดไฟ หัวใจ ? !) มุมขวาบนของหัว
};

// 11 อารมณ์ (eyes/mouth = null คือใช้ของเดิมในรูป)
export const EMOTIONS = {
  greet: { label: 'ทักทาย', eyes: null, mouth: 'big', acc: ['sparkle'], motion: 'hop' },
  work: { label: 'ทำงาน', eyes: null, mouth: 'focus', acc: ['glasses'], motion: 'nod' },
  advise: { label: 'แนะนำ', eyes: null, mouth: null, acc: ['bulb'], motion: 'tilt' },
  ok: { label: 'โอเค', eyes: 'happy', mouth: 'big', acc: ['heart'], motion: 'hop2' },
  no: { label: 'ไม่เห็นด้วย', eyes: 'half', mouth: 'flat', acc: ['x'], motion: 'shake' },
  unsure: { label: 'ไม่แน่ใจ', eyes: null, mouth: 'wavy', acc: ['q'], motion: 'tiltloop' },
  sorry: { label: 'ขอโทษ', eyes: 'closed', mouth: 'o', acc: ['sweat'], motion: 'bow' },
  tease: { label: 'แซว', eyes: 'wink', mouth: 'smirk', acc: ['hehe'], motion: 'sway' },
  worry: { label: 'เป็นห่วง', eyes: null, mouth: 'frown', acc: ['sweat'], motion: 'slowsway' },
  sulk: { label: 'งอน', eyes: 'half', mouth: 'pout', acc: ['anger', 'blush'], motion: 'turn' },
  interrupt: { label: 'ขอขัด', eyes: 'wide', mouth: 'o', acc: ['excl'], motion: 'lean' },
};

/* ---------- รูปทรง (พิกัดเทียบกับจุดกลางตา/ปาก) ---------- */
const EYE = {
  happy: () => '<path d="M-16 6.5 Q0 -15.5 16 6.5"/>',
  closed: () => '<path d="M-16 -5.5 Q0 10.5 16 -5.5"/>',
  half: (side) => `<path d="M-14 0.5 A14 17 0 0 0 14 0.5 Z" fill="${FACE.line}" stroke="none"/>`
    + (side === 'L' ? '<path d="M-19 -0.5 L19 -2.5"/>' : '<path d="M-19 -1.5 L19 0.5"/>'),
  wide: () => `<ellipse cx="0" cy="-0.5" rx="16" ry="20" fill="${FACE.line}" stroke="none"/><circle cx="5" cy="-8.5" r="5" fill="#fff" stroke="none"/>`,
  blink: () => '<path d="M-15 1.5 Q0 6.5 15 1.5"/>',
};
const MOUTH = {
  big: '<path d="M-38 -10 Q0 32 38 -10 Z" fill="#8a3a36"/><path d="M-21 8 Q0 20 21 8" stroke="#e98b86" stroke-width="7"/>',
  focus: '<path d="M-16 -1 Q0 5 16 -1"/>',
  flat: '<path d="M-27 0 L27 0"/>',
  frown: '<path d="M-27 8 Q0 -10 27 8"/>',
  wavy: '<path d="M-37 1 q9 -8 18 0 t18 0 t18 0 t18 0"/>',
  pout: '<path d="M-9 -8 q12 4 0 9 q12 4 0 9"/>',
  smirk: '<path d="M-33 -3 Q7 13 38 -11"/>',
  o: '<ellipse cx="0" cy="0" rx="8" ry="7"/>',
  talk: '<ellipse cx="0" cy="0" rx="15" ry="12" fill="#8a3a36"/>',
  talk2: '<ellipse cx="0" cy="-1" rx="18" ry="7" fill="#8a3a36"/>',
};
// ของประกอบ: วาดไว้รอบจุด (730,150) ของรูปต้นแบบ แล้วเลื่อนไปที่ FACE.acc
const ACC = {
  sparkle: `<g fill="#f4c542"><path class="fx-twinkle" d="M720 120 l10 26 26 10 -26 10 -10 26 -10 -26 -26 -10 26 -10z"/>
    <path class="fx-twinkle" style="animation-delay:.5s" d="M150 200 l7 18 18 7 -18 7 -7 18 -7 -18 -18 -7 18 -7z"/>
    <path class="fx-twinkle" style="animation-delay:.9s" d="M770 260 l5 12 12 5 -12 5 -5 12 -5 -12 -12 -5 12 -5z"/></g>`,
  glasses: () => `<g class="fx-pop" fill="rgba(200,230,255,.25)" stroke="#2b2b2b" stroke-width="6"><circle cx="${FACE.eyeL.x}" cy="${FACE.eyeL.y}" r="38"/><circle cx="${FACE.eyeR.x}" cy="${FACE.eyeR.y}" r="38"/>
    <path d="M${FACE.eyeL.x + 38} ${FACE.eyeL.y - 1.5} Q${(FACE.eyeL.x + FACE.eyeR.x) / 2} ${FACE.eyeL.y - 15.5} ${FACE.eyeR.x - 38} ${FACE.eyeR.y - 0.5}" fill="none"/></g>`,
  bulb: `<g class="fx-float"><circle cx="730" cy="140" r="34" fill="#ffe27a" stroke="#111" stroke-width="5"/>
    <rect x="714" y="172" width="32" height="20" rx="4" fill="#bbb" stroke="#111" stroke-width="5"/>
    <path d="M730 118 v20 M718 134 l12 8 12 -8" stroke="#c98a00" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M680 100 l-14 -12 M730 84 v-18 M780 100 l14 -12" stroke="#f4c542" stroke-width="6" stroke-linecap="round"/></g>`,
  heart: '<g class="fx-float"><path d="M730 190 C690 160 680 120 705 105 C722 95 730 110 730 118 C730 110 738 95 755 105 C780 120 770 160 730 190Z" fill="#ff7d8f" stroke="#111" stroke-width="5"/></g>',
  x: '<g class="fx-pop"><circle cx="730" cy="150" r="44" fill="#ff6b6b" stroke="#111" stroke-width="5"/><path d="M712 132 l36 36 M748 132 l-36 36" stroke="#fff" stroke-width="11" stroke-linecap="round"/></g>',
  q: '<g class="fx-float"><text x="700" y="190" font-size="130" font-weight="700" fill="#6c8cff" stroke="#111" stroke-width="4" font-family="system-ui">?</text></g>',
  excl: '<g class="fx-float"><text x="705" y="195" font-size="140" font-weight="800" fill="#ff8a3d" stroke="#111" stroke-width="4" font-family="system-ui">!</text></g>',
  sweat: '<g class="fx-drip"><path d="M640 230 C628 252 626 266 640 270 C654 266 652 252 640 230Z" fill="#9fd6ff" stroke="#111" stroke-width="4"/></g>',
  anger: '<g class="fx-pop" stroke="#e23b3b" stroke-width="9" fill="none" stroke-linecap="round"><path d="M690 150 q14 -2 14 -16"/><path d="M730 134 q2 14 16 14"/><path d="M746 174 q-14 2 -14 16"/><path d="M704 190 q-2 -14 -16 -14"/></g>',
  blush: () => `<g fill="#ff8f8f" opacity=".45"><ellipse cx="${FACE.cheekL.x}" cy="${FACE.cheekL.y}" rx="44" ry="20"/><ellipse cx="${FACE.cheekR.x}" cy="${FACE.cheekR.y}" rx="44" ry="20"/></g>`,
  hehe: '<g class="fx-float"><text x="610" y="190" font-size="64" font-weight="700" fill="#b06bff" stroke="#111" stroke-width="2" font-family="system-ui, sans-serif">หึๆ</text></g>',
};
const MOVED = new Set(['bulb', 'heart', 'x', 'q', 'excl', 'sweat', 'anger', 'hehe']); // เลื่อนตาม FACE.acc

function eyes(kind) {
  const p = FACE.eyePatch;
  const one = (side, c) => `<g transform="translate(${c.x} ${c.y})"><ellipse rx="${p.rx}" ry="${p.ry}" fill="${FACE.skin}" stroke="none"/>${EYE[kind](side)}</g>`;
  // ขยิบตา: ตาขวาเป็นตายิ้ม ตาซ้ายใช้ของเดิมในรูป
  if (kind === 'wink') return `<g transform="translate(${FACE.eyeR.x} ${FACE.eyeR.y})"><ellipse rx="${p.rx}" ry="${p.ry}" fill="${FACE.skin}" stroke="none"/>${EYE.happy()}</g>`;
  return one('L', FACE.eyeL) + one('R', FACE.eyeR);
}
function mouth(kind) {
  const r = FACE.mouthPatch;
  return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="10" fill="${FACE.skin}" stroke="none"/>`
    + `<g transform="translate(${FACE.mouth.x} ${FACE.mouth.y})">${MOUTH[kind]}</g>`;
}
function accessory(name) {
  const a = ACC[name];
  const svg = typeof a === 'function' ? a() : a;
  return MOVED.has(name) ? `<g transform="translate(${FACE.acc.x - 730} ${FACE.acc.y - 150})">${svg}</g>` : svg;
}

/**
 * ติดหน้าตาให้ตัวละครหนึ่งตัว: charEl = <span class="char"> ที่มี <img> + .shirt อยู่ข้างใน
 * @returns {{ setEmotion(name: string): void, talk(on: boolean): void }}
 */
export function mountFace(charEl) {
  if (!charEl) return { setEmotion() {}, talk() {} };
  // ห่อของเดิม: .fx-motion (ท่าทาง) > .fx-breath (หายใจ) > img + shirt + svg
  const motion = document.createElement('span');
  motion.className = 'fx-motion';
  const breath = document.createElement('span');
  breath.className = 'fx-breath';
  while (charEl.firstChild) breath.appendChild(charEl.firstChild);
  motion.appendChild(breath);
  charEl.appendChild(motion);
  const [w, h] = FACE.viewBox;
  breath.insertAdjacentHTML('beforeend', `<svg class="fx-face" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <g class="fx-acc-back"></g>
    <g fill="none" stroke="${FACE.line}" stroke-width="${FACE.stroke}" stroke-linecap="round" stroke-linejoin="round">
      <g class="fx-eyes"></g><g class="fx-blink" hidden>${eyes('blink')}</g><g class="fx-mouth"></g>
    </g><g class="fx-acc"></g></svg>`);
  const $ = (s) => breath.querySelector(s);
  let cur = 'greet';
  let flap = null;

  function setMouth(kind) { $('.fx-mouth').innerHTML = kind ? mouth(kind) : ''; }
  function setEmotion(name) {
    const e = EMOTIONS[name] || EMOTIONS.greet;
    cur = EMOTIONS[name] ? name : 'greet';
    $('.fx-eyes').innerHTML = e.eyes ? eyes(e.eyes) : '';
    if (!flap) setMouth(e.mouth);
    $('.fx-acc').innerHTML = e.acc.map(accessory).join('');
    motion.className = 'fx-motion';
    void motion.offsetWidth; // เริ่มท่าใหม่ทุกครั้ง
    motion.classList.add(`m-${e.motion}`);
  }

  // กะพริบตาเองทุก 2–5 วิ (ไม่กะพริบตอนหลับตา/ยิ้มตา/ขยิบ)
  function blink() {
    const e = EMOTIONS[cur];
    if (!e.eyes || e.eyes === 'wide' || e.eyes === 'half') {
      const shown = $('.fx-eyes');
      shown.style.visibility = 'hidden';
      $('.fx-blink').removeAttribute('hidden');
      setTimeout(() => { $('.fx-blink').setAttribute('hidden', ''); shown.style.visibility = ''; }, 130);
    }
    setTimeout(blink, 2000 + Math.random() * 3000);
  }
  setTimeout(blink, 1500 + Math.random() * 1500);

  // ตอนพูด: ปากสลับ 3 แบบทุก 120ms แล้วกลับเป็นปากของอารมณ์เมื่อพูดจบ
  function talk(on) {
    clearInterval(flap);
    flap = null;
    if (!on) { setMouth(EMOTIONS[cur].mouth); return; }
    flap = setInterval(() => {
      const r = Math.random();
      setMouth(r < 0.45 ? 'talk' : r < 0.75 ? 'talk2' : EMOTIONS[cur].mouth || 'o');
    }, 120);
  }

  setEmotion(cur);
  return { setEmotion, talk };
}
