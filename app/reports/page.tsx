'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { getWorkDateStr, enumerateDates, isLateSubmission, isPastMorningDeadline } from '../dateUtils'

interface Ward {
  id: string
  ward_code: string
  ward_name_th: string
  ward_name_en: string
}

interface WardStat {
  ward: Ward
  checkedDays: number
  missedDays: number
  missedDates: string[]
  lateDays: number
  lateDates: string[]
  deficitDays: number
  deficitDates: string[]
  pct: number
}

function currentMonthValue(): string {
  const todayStr = getWorkDateStr()
  return todayStr.slice(0, 7) // YYYY-MM
}

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonthValue())
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<WardStat[]>([])
  const [totalDays, setTotalDays] = useState(0)
  const [expandedWard, setExpandedWard] = useState<string | null>(null)

  useEffect(() => { loadReport() }, [month])

  async function loadReport() {
    setLoading(true)
    try {
      const [y, m] = month.split('-').map(Number)
      const startStr = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDayNum = new Date(y, m, 0).getDate()
      let endStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`

      const todayWork = getWorkDateStr()
      if (endStr > todayWork) {
        endStr = todayWork > startStr ? todayWork : startStr
      }

      let dateList = enumerateDates(startStr, endStr)
      // ถ้าวันสุดท้ายคือ "วันนี้" และยังไม่ถึง deadline 18:00 น. -> ยังไม่ถึงเวลาตัดสิน ตัดออกจากการนับ
      if (dateList.length > 0 && dateList[dateList.length - 1] === todayWork && !isPastMorningDeadline()) {
        dateList = dateList.slice(0, -1)
      }

      const { data: wards } = await supabase
        .from('wards').select('id, ward_code, ward_name_th, ward_name_en')
        .order('ward_code')

      const { data: checks } = await supabase
        .from('daily_checks')
        .select('id, ward_id, check_date, submitted_at')
        .gte('check_date', startStr)
        .lte('check_date', endStr)

      const checkIds = (checks ?? []).map(c => c.id)
      let deficitCheckIds: string[] = []
      if (checkIds.length > 0) {
        const { data: deficitRows } = await supabase
          .from('check_results')
          .select('check_id')
          .eq('is_deficit', true)
          .in('check_id', checkIds)
        deficitCheckIds = (deficitRows ?? []).map((r: any) => r.check_id)
      }
      const deficitCheckIdSet = new Set(deficitCheckIds)

      const wardStats: WardStat[] = (wards ?? []).map((ward: Ward) => {
        const wardChecks = (checks ?? []).filter(c => c.ward_id === ward.id)
        const checkedDates = new Set(wardChecks.map(c => c.check_date))
        const missedDates = dateList.filter(d => !checkedDates.has(d))
        const lateDates = wardChecks
          .filter(c => isLateSubmission(c.submitted_at))
          .map(c => c.check_date)
        const deficitDates = wardChecks
          .filter(c => deficitCheckIdSet.has(c.id))
          .map(c => c.check_date)
        const checkedDays = checkedDates.size
        const pct = dateList.length > 0 ? Math.round((checkedDays / dateList.length) * 100) : 0
        return {
          ward,
          checkedDays,
          missedDays: missedDates.length,
          missedDates,
          lateDays: lateDates.length,
          lateDates,
          deficitDays: deficitDates.length,
          deficitDates,
          pct,
        }
      })

      wardStats.sort((a, b) => a.pct - b.pct)
      setStats(wardStats)
      setTotalDays(dateList.length)
    } finally {
      setLoading(false)
    }
  }

  async function handleExport() {
    const XLSX = await import('xlsx')
    const header = ['หอผู้ป่วย', 'ตรวจแล้ว', 'ทั้งหมด (วัน)', 'ครบ (%)', 'ขาดตรวจ (วัน)', 'ตรวจสาย (ครั้ง)', 'มีของขาด (วัน)']
    const rows = stats.map(s => [
      `${s.ward.ward_name_en} (${s.ward.ward_name_th})`,
      s.checkedDays, totalDays, s.pct, s.missedDays, s.lateDays, s.deficitDays,
    ])
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'สรุปรายเดือน')
    XLSX.writeFile(wb, `emergency-cart-report-${month}.xlsx`)
  }

  const monthLabel = (() => {
    const [y, m] = month.split('-').map(Number)
    const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
      'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
    return `${thaiMonths[m - 1]} ${y + 543}`
  })()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">

      {/* HEADER */}
      <div className="bg-emerald-800 text-white px-4 pt-5 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <a href="/dashboard" className="opacity-70 hover:opacity-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 19.5 8.25 12l7.5-7.5"/>
            </svg>
          </a>
          <div>
            <p className="text-xs opacity-70 uppercase tracking-wider">📈 รายงานสถิติรายเดือน</p>
            <p className="text-base font-medium">สรุปรายเดือน — {monthLabel}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="flex-1 bg-emerald-700 text-white text-sm rounded-xl px-3 py-2
                       border border-emerald-600 focus:outline-none"/>
          <button onClick={handleExport} disabled={stats.length === 0}
            className="bg-white text-emerald-800 text-sm font-medium px-4 py-2 rounded-xl
                       disabled:opacity-50 disabled:cursor-not-allowed">
            📥 Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400">กำลังโหลดข้อมูล...</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-8">

          {/* BAR CHART */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              % ความครบถ้วนการตรวจ
            </p>
            <div className="space-y-2.5">
              {stats.map(s => (
                <div key={s.ward.id}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-gray-600 truncate">{s.ward.ward_name_en}</span>
                    <span className={`font-semibold ${s.pct < 80 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {s.pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${s.pct < 80 ? 'bg-red-400' : 'bg-emerald-400'}`}
                      style={{ width: `${s.pct}%` }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TABLE */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 pt-3 pb-2">
              รายละเอียดรายวอร์ด (ทั้งเดือน {totalDays} วัน)
            </p>
            <div className="divide-y divide-gray-50">
              {stats.map(s => (
                <div key={s.ward.id} className="px-4 py-3">
                  <button
                    onClick={() => setExpandedWard(expandedWard === s.ward.id ? null : s.ward.id)}
                    className="w-full flex items-center justify-between gap-2 text-left">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{s.ward.ward_name_en}</p>
                      <p className="text-xs text-gray-400">{s.ward.ward_name_th}</p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {s.missedDays > 0 && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          ขาด {s.missedDays}
                        </span>
                      )}
                      {s.lateDays > 0 && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          สาย {s.lateDays}
                        </span>
                      )}
                      {s.deficitDays > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                          ของขาด {s.deficitDays}
                        </span>
                      )}
                    </div>
                  </button>
                  {expandedWard === s.ward.id && (
                    <div className="mt-2 space-y-2">
                      {s.missedDates.length > 0 && (
                        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                          <p className="text-xs text-red-600 font-medium mb-1">วันที่ขาดตรวจ:</p>
                          <p className="text-xs text-red-500">{s.missedDates.join(', ')}</p>
                        </div>
                      )}
                      {s.lateDates.length > 0 && (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                          <p className="text-xs text-amber-700 font-medium mb-1">วันที่ตรวจสาย (หลัง 18:00 น.):</p>
                          <p className="text-xs text-amber-600">{s.lateDates.join(', ')}</p>
                        </div>
                      )}
                      {s.deficitDates.length > 0 && (
                        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                          <p className="text-xs text-orange-700 font-medium mb-1">วันที่มีของไม่ครบ:</p>
                          <p className="text-xs text-orange-600">{s.deficitDates.join(', ')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
