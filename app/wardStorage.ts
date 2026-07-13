// จำวอร์ดล่าสุดที่เปิดใช้งานไว้ใน localStorage ของเบราว์เซอร์เครื่องนั้น
// ใช้สำหรับหน้าที่ไม่มี ward ผูกอยู่ (เช่น Dashboard) ให้ปุ่มเมนูยังพาไปวอร์ดที่ถูกต้อง
const KEY = 'lastWardCode'

export function saveLastWard(code: string) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(KEY, code) } catch {}
}

export function getLastWard(): string {
  if (typeof window === 'undefined') return 'SGM1'
  try { return localStorage.getItem(KEY) || 'SGM1' } catch { return 'SGM1' }
}
