'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'

interface WardSummary {
  ward_id: string
  ward_code: string
  ward_name_th: string
  ward_name_en: string
  floor: number | null
  check_id: string | null
  status: string | null
  tape_status: boolean | null
  inspector_name: string | null
  submitted_at: string | null
  check_date: string | null
  total_checked: number
  deficit_count: number
}

function getWardStatus(w: WardSummary): 'ok' | 'deficit' | 'pending' {
  if (!w.check_id) return 'pending'
  if (w.deficit_count > 0) return 'deficit'
  return 'ok'
}

function formatTime(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
}

function formatThaiDate(date: Date) {
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ---- Donut Chart (SVG ไม่ต้องติดตั้ง library) ----
function DonutChart({ ok, deficit, pending }: { ok: number; deficit: number; pending: number }) {
  const total = ok + deficit + pending
  if (total === 0) return null

  const r = 54
  const cx = 70
  const cy = 70
  const circ = 2 * Math.PI * r

  function slice(value: number, offset: number, color: string, idx: number) {
    if (value === 0) return null
    const pct = value / total
    const dash = pct * circ
    const gap  = circ - dash
    return (
      <circle key={idx} cx={cx} cy={cy} r={r} fill="none" stroke={color}
        strokeWidth="22" strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
    )
  }

  const okDash      = (ok / total) * circ
  const deficitDash = (deficit / total) * circ

  return (
    <svg viewBox="0 0 140 140" className="w-36 h-36 flex-shrink-0">
      {/* bg ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0fdf4" strokeWidth="22"/>
      {slice(ok,      0,                   '#22c55e', 0)}
      {slice(deficit, okDash,              '#ef4444', 1)}
      {slice(pending, okDash + deficitDash,'#d1d5db', 2)}
      {/* center text */}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="20" fontWeight="600" fill="#1f2937">{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="#6b7280">หอผู้ป่วย</text>
    </svg>
  )
}

export default function DashboardPage() {
  const [wards, setWards]       = useState<WardSummary[]>([])
  const [loading, setLoading]   = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'ok' | 'deficit' | 'pending'>('all')
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  async function fetchData() {
    const { data } = await supabase
      .from('dashboard_summary')
      .select('*')
    if (data) {
      setWards(data)
      setLastUpdate(new Date())
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()

    // ★ Realtime subscription
    channelRef.current = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'daily_checks'
      }, () => fetchData())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'check_results'
      }, () => fetchData())
      .subscribe()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  // Stats
  const okCount      = wards.filter(w => getWardStatus(w) === 'ok').length
  const deficitCount = wards.filter(w => getWardStatus(w) === 'deficit').length
  const pendingCount = wards.filter(w => getWardStatus(w) === 'pending').length

  // Filter + search
  const filtered = wards.filter(w => {
    const matchSearch = w.ward_name_th.includes(search) ||
                        w.ward_name_en.toLowerCase().includes(search.toLowerCase()) ||
                        w.ward_code.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || getWardStatus(w) === filterStatus
    return matchSearch && matchStatus
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-3"
            fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-sm text-gray-500">กำลังโหลดข้อมูล Realtime...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">

      {/* HEADER */}
      <div className="bg-emerald-800 text-white px-4 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs opacity-70 uppercase tracking-wider">📊 แดชบอร์ดสรุป</p>
            <p className="text-base font-medium mt-0.5">
              ภาพรวม {wards.length} หอผู้ป่วย
            </p>
            <p className="text-xs opacity-60 mt-0.5">{formatThaiDate(new Date())}</p>
          </div>
          {/* Realtime indicator */}
          <div className="flex items-center gap-1.5 bg-emerald-700 px-3 py-1.5 rounded-full">
            <div className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse"/>
            <span className="text-xs text-emerald-100">Realtime</span>
          </div>
        </div>

        {/* Last update */}
        <p className="text-xs opacity-50 mt-2">
          อัปเดตล่าสุด: {formatTime(lastUpdate.toISOString())}
        </p>
      </div>

      {/* DONUT + LEGEND */}
      <div className="bg-white px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <DonutChart ok={okCount} deficit={deficitCount} pending={pendingCount} />

          <div className="flex-1 space-y-2.5">
            <LegendItem color="bg-green-500"  label="เช็คสมบูรณ์"      count={okCount}      total={wards.length} />
            <LegendItem color="bg-red-500"    label="ยังไม่ได้เช็ค"    count={pendingCount}  total={wards.length} />
            <LegendItem color="bg-yellow-400" label="ล้อไม่สมบูรณ์" count={deficitCount} total={wards.length} isTriangle />
          </div>
        </div>
      </div>

      {/* STAT BADGES */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
        {[
          { label: 'สมบูรณ์',     count: okCount,      color: 'bg-emerald-50 border-emerald-200 text-emerald-700', active: filterStatus === 'ok',      key: 'ok' },
          { label: 'ยังไม่ตรวจ', count: pendingCount,  color: 'bg-gray-50 border-gray-200 text-gray-600',          active: filterStatus === 'pending', key: 'pending' },
          { label: 'ของไม่ครบ',     count: deficitCount,  color: 'bg-red-50 border-red-200 text-red-700',             active: filterStatus === 'deficit', key: 'deficit' },
          { label: 'ทั้งหมด',    count: wards.length,  color: 'bg-blue-50 border-blue-200 text-blue-700',          active: filterStatus === 'all',     key: 'all' },
        ].map(s => (
          <button key={s.key}
            onClick={() => setFilterStatus(s.key as typeof filterStatus)}
            className={`rounded-xl border px-1 py-2 text-center transition-all
              ${s.color} ${s.active ? 'ring-2 ring-offset-1 ring-emerald-500 scale-105' : ''}`}>
            <p className="text-base font-bold leading-none">{s.count}</p>
            <p className="text-xs mt-0.5 leading-tight">{s.label}</p>
          </button>
        ))}
      </div>

      {/* SEARCH */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <div className="relative">
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>
          </svg>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาหอผู้ป่วย เช่น ICU, ER, Ward..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                       placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500
                       bg-gray-50 text-gray-800"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* WARD LIST */}
      <div className="flex-1 overflow-y-auto pb-16">
        <div className="px-4 py-2 flex items-center justify-between">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
            หอผู้ป่วย (Ward)
          </p>
          <p className="text-xs text-gray-400">
            แสดง {filtered.length} / {wards.length}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400 text-sm">
            ไม่พบหอผู้ป่วยที่ค้นหา
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(ward => {
              const st = getWardStatus(ward)
              const time = formatTime(ward.submitted_at)

              return (
                <div key={ward.ward_id}
                  className="bg-white px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">

                  {/* Color bar */}
                  <div className={`w-1 h-12 rounded-full flex-shrink-0
                    ${st === 'ok' ? 'bg-emerald-500' : st === 'deficit' ? 'bg-red-500' : 'bg-gray-300'}`}
                  />

                  {/* Ward info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">{ward.ward_name_en}</p>
                      {ward.floor && (
                        <span className="text-xs text-gray-400">ชั้น {ward.floor}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{ward.ward_name_th}</p>

                    {/* Details */}
                    {st !== 'pending' && (
                      <div className="flex items-center gap-3 mt-1">
                        {time && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                            </svg>
                            {time}
                          </span>
                        )}
                        {ward.inspector_name && (
                          <span className="text-xs text-gray-400 truncate max-w-[100px]">
                            {ward.inspector_name}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Deficit details */}
                    {st === 'deficit' && ward.deficit_count > 0 && (
                      <p className="text-xs text-red-500 mt-1">
                        ขาด {ward.deficit_count} รายการ จาก {ward.total_checked} รายการ
                      </p>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="flex-shrink-0 text-right">
                    {st === 'ok' && (
                      <span className="inline-flex items-center gap-1 text-xs bg-emerald-100
                        text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m4.5 12.75 6 6 9-13.5"/>
                        </svg>
                        สมบูรณ์
                      </span>
                    )}
                    {st === 'deficit' && (
                      <span className="inline-flex items-center gap-1 text-xs bg-red-100
                        text-red-700 px-2.5 py-1 rounded-full font-medium">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
                        </svg>
                        ของไม่ครบ
                      </span>
                    )}
                    {st === 'pending' && (
                      <span className="inline-flex items-center gap-1 text-xs bg-gray-100
                        text-gray-500 px-2.5 py-1 rounded-full font-medium">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                        </svg>
                        ยังไม่ตรวจ
                      </span>
                    )}

                    {/* Tape status icon */}
                    {st !== 'pending' && ward.tape_status !== null && (
                      <p className="text-xs mt-1 text-right">
                        {ward.tape_status ? '🟢 สายคาด' : '🔴 ไม่มีสายคาด'}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="h-4" />
      </div>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto flex bg-white border-t border-gray-100 z-40 h-16">
        {[
          { icon: '🏠', label: 'หน้าหลัก', href: '/' },
          { icon: '📋', label: 'ตรวจเช็ค', href: '/check' },
          { icon: '📄', label: 'สรุป',      href: '/summary' },
          { icon: '📊', label: 'แดชบอร์ด', href: '/dashboard', active: true },
        ].map(item => (
          <a key={item.href} href={item.href}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-sm border-t-2
              ${'active' in item && item.active
                ? 'border-emerald-700 text-emerald-700'
                : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            <span className="text-2xl leading-none">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  )
}

// ---- Sub components ----
function LegendItem({ color, label, count, total, isTriangle }:
  { color: string; label: string; count: number; total: number; isTriangle?: boolean }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      {isTriangle ? (
        <div className="w-3 h-3 flex-shrink-0 flex items-end justify-center">
          <div style={{
            width: 0, height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderBottom: '10px solid #facc15'
          }}/>
        </div>
      ) : (
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${color}`}/>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600 truncate">{label}</span>
          <span className="text-xs font-semibold text-gray-800 ml-2">{count}</span>
        </div>
        <div className="h-1 bg-gray-100 rounded-full mt-0.5 overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }}/>
        </div>
      </div>
    </div>
  )
}
