// เลือกหมวดของรายจ่ายจากชื่อรายการ (ไม่แตะ DOM)
// ลำดับ: คำที่บอสเคยเลือกเอง (learned) → ตารางคำ data/categoryWords.th.json (คำยาวก่อน)
// ไม่เข้าหมวดไหน → null (การ์ดให้บอสเลือกเอง ห้ามใส่ "อื่นๆ" เอง)

export const CATEGORIES = ['กิน', 'ของใช้', 'เที่ยว', 'เดินทาง', 'อื่นๆ'];

// คำแรกของรายการ ใช้เป็น key ของคำที่จำไว้
export const learnKey = (item) => String(item || '').trim().toLowerCase().split(/\s+/)[0] || '';

/**
 * @param {string} item
 * @param {{ table: { categories: Record<string, string[]>, guess: string[] }, learned?: Record<string, string> }} ctx
 * @returns {{ category: string|null, guess: boolean, word: string|null }}
 */
export function categorize(item, { table, learned = {} }) {
  const text = String(item || '').toLowerCase();
  const key = learnKey(item);
  if (key && learned[key] && CATEGORIES.includes(learned[key])) return { category: learned[key], guess: false, word: key };
  let best = null;
  for (const [cat, words] of Object.entries(table?.categories || {})) {
    for (const w of words) {
      const lw = w.toLowerCase();
      if (text.includes(lw) && (!best || lw.length > best.word.length)) best = { category: cat, word: lw };
    }
  }
  if (!best) return { category: null, guess: false, word: null };
  const guess = (table.guess || []).some((g) => g.toLowerCase() === best.word);
  return { category: best.category, guess, word: best.word };
}
