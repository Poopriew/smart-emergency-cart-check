// เวลาไทย (Asia/Bangkok) - ใช้กำหนด "วันทำงาน" ของระบบ โดยวันใหม่เริ่มตอน 06:00 น.
// เช่น ตรวจตอนตี 3 ของวันอังคาร จะยังนับเป็นของ "วันจันทร์" (เพราะยังไม่ถึง 6 โมงเช้า)
export function getWorkDateStr(): string {
  const now = new Date()
  const bangkokStr = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
  const bangkokNow = new Date(bangkokStr)
  const hour = bangkokNow.getHours()
  const workDate = new Date(bangkokNow)
  if (hour < 6) {
    workDate.setDate(workDate.getDate() - 1)
  }
  const y = workDate.getFullYear()
  const m = String(workDate.getMonth() + 1).padStart(2, '0')
  const d = String(workDate.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// เช็คว่าตอนนี้เลยเวลา 18:00 น. ของ "วันทำงาน" ปัจจุบันหรือยัง (deadline ของเวรเช้า)
export function isPastMorningDeadline(): boolean {
  const now = new Date()
  const bangkokStr = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
  const bangkokNow = new Date(bangkokStr)
  const hour = bangkokNow.getHours()
  return hour >= 18 || hour < 6
}
