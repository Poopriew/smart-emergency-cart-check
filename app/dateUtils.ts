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

// หาชั่วโมง (เวลาไทย) ของ timestamp ที่กำหนด
function getBangkokHourOf(iso: string): number {
  const d = new Date(iso)
  const s = d.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
  return new Date(s).getHours()
}

// เช็คว่าการบันทึกครั้งนี้ "สาย" ไหม (หลัง 18:00 น. หรือดึกเกิน 06:00 น.ของวันถัดไป)
export function isLateSubmission(iso: string | null): boolean {
  if (!iso) return false
  const hour = getBangkokHourOf(iso)
  return hour >= 18 || hour < 6
}

// สร้างรายการวันที่ (YYYY-MM-DD) ทั้งหมดตั้งแต่ start ถึง end (รวมทั้งสองวัน)
export function enumerateDates(startStr: string, endStr: string): string[] {
  const dates: string[] = []
  const cur = new Date(startStr + 'T00:00:00')
  const end = new Date(endStr + 'T00:00:00')
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}
