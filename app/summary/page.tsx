'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

interface DeficitItem {
  item_name_en: string
  item_name_th: string
  actual_qty: number
  standard_qty: number
  unit: string
  note: string | null
  drawer: string
}

interface CheckInfo {
  id: string
  inspector_name: string
  tape_status: boolean | null
  tape_note: string | null
  submitted_at: string | null
  status: string
  co_inspectors: string[] | null
}

const DRAWER_LABEL: Record<string, string> = {
  top: 'ชั้นบนสุด',
  drawer1: 'ลิ้นชัก 1 (ยาฉุกเฉิน)',
  drawer2: 'ลิ้นชัก 2 (ทางเดินหายใจ)',
  drawer3: 'ลิ้นชัก 3 (น้ำเกลือ)',
  drawer4: 'ลิ้นชัก 4 (เบ็ดเตล็ด)',
}

function formatThaiDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function SummaryPage() {
  const [checkInfo, setCheckInfo]     = useState<CheckInfo | null>(null)
  const [deficits, setDeficits]       = useState<DeficitItem[]>([])
  const [allCount, setAllCount]       = useState(0)
  const [loading, setLoading]         = useState(true)
  const [confirming, setConfirming]   = useState(false)
  const [confirmed, setConfirmed]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [wardName, setWardName]       = useState('ICU 1')

  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // โหลด ward
        const params = new URLSearchParams(window.location.search)
        const wCode = params.get('ward') || 'SGM1'
        const { data: ward } = await supabase
         .from('wards').select('id, ward_name_th, ward_name_en')
          .eq('ward_code', wCode).single()
        if (!ward) return
        setWardName(`${ward.ward_name_en} (${ward.ward_name_th})`)

        // โหลด daily_check วันนี้
        const { data: check } = await supabase
          .from('daily_checks').select('*')
          .eq('ward_id', ward.id).eq('check_date', todayStr).single()
        if (!check) return
        setCheckInfo(check)
        if (check.status === 'confirmed') setConfirmed(true)

        // โหลด check_results พร้อม cart_items
        const { data: results } = await supabase
          .from('check_results')
          .select(`
            actual_qty, note, is_deficit,
            cart_items ( item_name_en, item_name_th, standard_qty, unit, drawer )
          `)
          .eq('check_id', check.id)

        if (results) {
          setAllCount(results.length)
          const defList: DeficitItem[] = results
            .filter((r: any) => r.is_deficit)
            .map((r: any) => ({
              item_name_en:  r.cart_items.item_name_en,
              item_name_th:  r.cart_items.item_name_th,
              actual_qty:    r.actual_qty,
              standard_qty:  r.cart_items.standard_qty,
              unit:          r.cart_items.unit,
              note:          r.note,
              drawer:        r.cart_items.drawer,
            }))
          setDeficits(defList)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleConfirm() {
    if (!checkInfo) return
    setConfirming(true)
    setError(null)
    try {
      const { error: err } = await supabase
        .from('daily_checks')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', checkInfo.id)
      if (err) throw err
      setConfirmed(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setConfirming(false)
    }
  }

  // ---- UI ----
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-3"
            fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-sm text-gray-500">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    )
  }

  if (!checkInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
        <div className="bg-emerald-800 text-white px-4 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <a href="/" className="opacity-70 hover:opacity-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 19.5 8.25 12l7.5-7.5"/>
              </svg>
            </a>
            <div>
              <p className="text-xs opacity-70 uppercase tracking-wider">สรุปรายละเอียด</p>
              <p className="text-base font-medium">{wardName}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
            </svg>
          </div>
          <div>
            <p className="text-gray-800 font-medium">ยังไม่มีข้อมูลการตรวจวันนี้</p>
            <p className="text-sm text-gray-400 mt-1">กรุณาตรวจเช็คก่อน แล้วค่อยดูสรุป</p>
          </div>
          <a href="/check"
            className="bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium">
            ไปหน้าตรวจเช็ค →
          </a>
        </div>
        <BottomNav />
      </div>
    )
  }

  const okCount = allCount - deficits.length
  const pct = allCount > 0 ? Math.round((okCount / allCount) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">

      {/* HEADER */}
      <div className="bg-emerald-800 text-white px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <a href="/" className="opacity-70 hover:opacity-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 19.5 8.25 12l7.5-7.5"/>
            </svg>
          </a>
          <div className="flex-1">
            <p className="text-xs opacity-70 uppercase tracking-wider">สรุปรายละเอียด</p>
            <p className="text-base font-medium">{wardName}</p>
          </div>
          {/* Status chip */}
          <span className={`text-xs px-3 py-1 rounded-full font-medium
            ${confirmed
              ? 'bg-emerald-600 text-white'
              : deficits.length > 0
              ? 'bg-red-500 text-white'
              : 'bg-emerald-600 text-white'}`}>
            {confirmed ? '🔒 ยืนยันแล้ว' : deficits.length > 0 ? '⚠️ มีของขาด' : '✓ สมบูรณ์'}
          </span>
        </div>

        {/* Score bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs opacity-75 mb-1">
            <span>ความสมบูรณ์ของอุปกรณ์</span>
            <span>{okCount} / {allCount} รายการ ({pct}%)</span>
          </div>
          <div className="h-2 bg-emerald-900 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500
                ${pct === 100 ? 'bg-emerald-300' : 'bg-red-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-32">

        {/* ===== ข้อมูลการตรวจ ===== */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>
            </svg>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">ข้อมูลผู้ตรวจ</p>
          </div>
          <div className="px-4 py-3 space-y-2">
            <Row label="ผู้ตรวจสอบ"   value={checkInfo.inspector_name} />
            <Row label="วันที่ตรวจ"    value={formatThaiDateTime(checkInfo.submitted_at ?? new Date().toISOString())} />
            <Row label="สายคาดล้อ"
              value={checkInfo.tape_status === true ? '✅ มีสายคาด / สมบูรณ์'
                : checkInfo.tape_status === false ? '❌ ไม่มีสายคาด / ขาด'
                : '— ไม่ได้ระบุ'}
              valueColor={checkInfo.tape_status ? 'text-emerald-600' : 'text-red-600'}
            />
            {checkInfo.tape_note && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800">
                <span className="font-medium">หมายเหตุสายคาด:</span> {checkInfo.tape_note}
              </div>
            )}
            {checkInfo.co_inspectors && checkInfo.co_inspectors.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-1">ผู้ร่วมตรวจ</p>
                <div className="flex flex-wrap gap-2">
                  {checkInfo.co_inspectors.map((name, i) => (
                    <span key={i} className="text-xs bg-emerald-50 text-emerald-700
                      border border-emerald-100 px-2 py-1 rounded-full">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== รายการขาด ===== */}
        {deficits.length > 0 ? (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
              </svg>
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">
                การบันทึกปัญหา — มีจำนวนไม่ถึงเกณฑ์มาตรฐาน ({deficits.length} รายการ)
              </p>
            </div>
            <div className="divide-y divide-gray-50">
              {deficits.map((d, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{d.item_name_en}</p>
                      {d.item_name_th && (
                        <p className="text-xs text-gray-400">{d.item_name_th}</p>
                      )}
                      <span className="inline-block mt-1 text-xs bg-gray-100 text-gray-500
                        px-2 py-0.5 rounded-full">
                        {DRAWER_LABEL[d.drawer] ?? d.drawer}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-red-600">
                        {d.actual_qty} / {d.standard_qty}
                      </p>
                      <p className="text-xs text-red-400">{d.unit}</p>
                      <p className="text-xs text-red-500 mt-0.5">
                        ขาด {d.standard_qty - d.actual_qty} {d.unit}
                      </p>
                    </div>
                  </div>
                  {d.note && (
                    <div className="mt-2 flex items-start gap-2 bg-amber-50
                      border border-amber-100 rounded-xl px-3 py-2">
                      <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"/>
                      </svg>
                      <p className="text-xs text-amber-800">{d.note}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ทุกรายการครบ */
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-5
            flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-200 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m4.5 12.75 6 6 9-13.5"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">อุปกรณ์ครบทุกรายการ 🎉</p>
              <p className="text-xs text-emerald-600 mt-0.5">ไม่มีรายการขาด พร้อมใช้งานได้ทันที</p>
            </div>
          </div>
        )}

        {/* ===== สถิติ ===== */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="ตรวจแล้ว" value={allCount} unit="รายการ" color="emerald" />
          <StatCard label="ครบ"       value={okCount}       unit="รายการ" color="emerald" />
          <StatCard label="ขาด"       value={deficits.length} unit="รายการ"
            color={deficits.length > 0 ? 'red' : 'emerald'} />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Confirmed message */}
        {confirmed && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3
            flex items-center gap-2 text-sm text-emerald-700">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/>
            </svg>
            ยืนยันสรุปข้อมูลแล้ว — ข้อมูลถูกล็อกไว้เรียบร้อย
          </div>
        )}

      </div>

      {/* CONFIRM BUTTON */}
      {!confirmed && (
        <div className="fixed bottom-16 left-0 right-0 max-w-md mx-auto px-4 py-3 bg-white border-t border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] z-30 border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <button onClick={handleConfirm} disabled={confirming}
            className="w-full flex items-center justify-center gap-2
                       bg-emerald-700 text-white py-3.5 rounded-xl text-sm font-medium
                       shadow-sm active:scale-95 transition-all
                       disabled:opacity-60 disabled:cursor-not-allowed">
            {confirming ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/>
              </svg>
            )}
            {confirming ? 'กำลังยืนยัน...' : '🔒 ยืนยันสรุปข้อมูล'}
          </button>
          <p className="text-xs text-center text-gray-400 mt-2">
            หลังยืนยันแล้ว ข้อมูลจะถูกล็อกและส่งให้ผู้บริหารเห็นทันที
          </p>
        </div>
      )}

      {/* BOTTOM NAV */}
      <BottomNav />
    </div>
  )
}

// ---- Sub components ----
function Row({ label, value, valueColor = 'text-gray-700' }:
  { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-xs font-medium ${valueColor}`}>{value}</span>
    </div>
  )
}

function StatCard({ label, value, unit, color }:
  { label: string; value: number; unit: string; color: 'emerald' | 'red' }) {
  const bg  = color === 'red' && value > 0 ? 'bg-red-50 border-red-100'   : 'bg-emerald-50 border-emerald-100'
  const txt = color === 'red' && value > 0 ? 'text-red-700'                : 'text-emerald-700'
  const sub = color === 'red' && value > 0 ? 'text-red-400'                : 'text-emerald-400'
  return (
    <div className={`rounded-2xl border px-3 py-3 text-center ${bg}`}>
      <p className={`text-xl font-bold ${txt}`}>{value}</p>
      <p className={`text-xs mt-0.5 ${sub}`}>{unit}</p>
      <p className={`text-xs font-medium mt-0.5 ${txt}`}>{label}</p>
    </div>
  )
}

function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto flex bg-white border-t border-gray-100 z-40">
      {[
        { icon: '🏠', label: 'หน้าหลัก', href: '/' },
        { icon: '📋', label: 'ตรวจเช็ค', href: '/check' },
        { icon: '📄', label: 'สรุป',      href: '/summary', active: true },
        { icon: '📊', label: 'แดชบอร์ด', href: '/dashboard' },
      ].map(item => (
        <a key={item.href} href={item.href}
          className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs border-t-2
            ${'active' in item && item.active
              ? 'border-emerald-700 text-emerald-700'
              : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          <span className="text-lg leading-none">{item.icon}</span>
          {item.label}
        </a>
      ))}
    </nav>
  )
}
