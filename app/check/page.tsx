'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

interface CartItem {
  id: string
  drawer: string
  item_name_en: string
  item_name_th: string
  standard_qty: number
  unit: string
}

interface ItemResult {
  item_id: string
  actual_qty: number      // ← เริ่มที่ standard_qty ทันที
  note: string
}

const TABS = [
  { key: 'top',     label: 'ชั้นบนสุด',  sub: 'ชั้นบนสุด (Defibrillator & เครื่องมือหลัก)' },
  { key: 'drawer1', label: 'ลิ้นชัก 1',  sub: 'ลิ้นชักที่ 1 (ยาฉุกเฉิน)' },
  { key: 'drawer2', label: 'ลิ้นชัก 2',  sub: 'ลิ้นชักที่ 2 (อุปกรณ์ทางเดินหายใจ)' },
  { key: 'drawer3', label: 'ลิ้นชัก 3',  sub: 'ลิ้นชักที่ 3 (น้ำเกลือ / Fluid)' },
  { key: 'drawer4', label: 'ลิ้นชัก 4',  sub: 'ลิ้นชักที่ 4 (อุปกรณ์เบ็ดเตล็ด)' },
]

export default function CheckPage() {
  const [activeTab, setActiveTab]   = useState(0)
  const [allItems, setAllItems]     = useState<CartItem[]>([])
  const [results, setResults]       = useState<Record<string, ItemResult>>({})
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [wardId, setWardId]         = useState<string | null>(null)
  const [checkId, setCheckId]       = useState<string | null>(null)

  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function load() {
      const { data: ward } = await supabase
        .from('wards').select('id').eq('ward_code', 'ICU1').single()
      if (ward) setWardId(ward.id)

      const { data: items } = await supabase
        .from('cart_items').select('*')
        .eq('is_active', true).order('drawer').order('item_name_en')

      if (items) {
        setAllItems(items)
        // ★ default = standard_qty ทุกรายการ
        const init: Record<string, ItemResult> = {}
        items.forEach((item: CartItem) => {
          init[item.id] = {
            item_id: item.id,
            actual_qty: item.standard_qty,
            note: '',
          }
        })
        setResults(init)
      }

      if (ward) {
        const { data: check } = await supabase
          .from('daily_checks').select('id')
          .eq('ward_id', ward.id).eq('check_date', todayStr).single()
        if (check) setCheckId(check.id)
      }
    }
    load()
  }, [])

  const tabItems = allItems.filter(i => i.drawer === TABS[activeTab].key)

  // ★ ปุ่ม + / −
  function increment(itemId: string, max: number) {
    setResults(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], actual_qty: Math.min(prev[itemId].actual_qty + 1, max * 2) }
    }))
  }
  function decrement(itemId: string) {
    setResults(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], actual_qty: Math.max(0, prev[itemId].actual_qty - 1) }
    }))
  }
  function updateNote(itemId: string, val: string) {
    setResults(prev => ({ ...prev, [itemId]: { ...prev[itemId], note: val } }))
  }

  function isDeficit(item: CartItem) {
    return (results[item.id]?.actual_qty ?? item.standard_qty) < item.standard_qty
  }

  // progress — นับรายการที่ "แตะแล้ว" คือ qty ≠ standard หรือผ่านแล้วทุกอัน
  const deficitCount  = allItems.filter(i => isDeficit(i)).length
  const deficitNoNote = allItems.filter(i => isDeficit(i) && !results[i.id]?.note.trim())

  async function handleSave() {
    if (!wardId) { setError('ไม่พบข้อมูล Ward'); return }
    if (deficitNoNote.length > 0) {
      setError(`กรุณากรอกหมายเหตุสำหรับรายการที่ขาด ${deficitNoNote.length} รายการ`)
      return
    }
    setError(null)
    setSaving(true)
    try {
      let currentCheckId = checkId
      if (!currentCheckId) {
        const { data: check, error: err } = await supabase
          .from('daily_checks')
          .upsert({
            ward_id: wardId,
            check_date: todayStr,
            inspector_name: 'พว. ผู้ตรวจ',
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          }, { onConflict: 'ward_id,check_date' })
          .select('id').single()
        if (err) throw err
        currentCheckId = check.id
        setCheckId(check.id)
      }

      const rows = allItems.map(item => ({
        check_id: currentCheckId,
        item_id:  item.id,
        actual_qty: results[item.id]?.actual_qty ?? item.standard_qty,
        is_deficit: isDeficit(item),
        note: results[item.id]?.note.trim() || null,
      }))

      const { error: resErr } = await supabase
        .from('check_results')
        .upsert(rows, { onConflict: 'check_id,item_id' })
      if (resErr) throw resErr
      setSaved(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">

      {/* HEADER */}
      <div className="bg-emerald-800 text-white px-4 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <a href="/" className="opacity-70 hover:opacity-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 19.5 8.25 12l7.5-7.5"/>
            </svg>
          </a>
          <div>
            <p className="text-xs opacity-70 uppercase tracking-wider">ตรวจเช็คอุปกรณ์ละเอียด</p>
            <p className="text-base font-medium">
              ICU 1 — {new Date().toLocaleDateString('th-TH')}
            </p>
          </div>
        </div>

        {/* Summary badges */}
        <div className="flex gap-2 mt-3">
          <div className="flex-1 bg-emerald-700 rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-semibold">{allItems.length}</p>
            <p className="text-xs opacity-70">รายการทั้งหมด</p>
          </div>
          <div className={`flex-1 rounded-xl px-3 py-2 text-center
            ${deficitCount > 0 ? 'bg-red-500' : 'bg-emerald-700'}`}>
            <p className="text-lg font-semibold">{deficitCount}</p>
            <p className="text-xs opacity-70">รายการขาด</p>
          </div>
          <div className="flex-1 bg-emerald-700 rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-semibold">{allItems.length - deficitCount}</p>
            <p className="text-xs opacity-70">รายการครบ</p>
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="bg-emerald-900 flex overflow-x-auto">
        {TABS.map((tab, i) => {
          const tabItems2 = allItems.filter(x => x.drawer === tab.key)
          const tabDeficit = tabItems2.filter(x => isDeficit(x)).length
          return (
            <button key={tab.key} onClick={() => setActiveTab(i)}
              className={`flex-shrink-0 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors
                whitespace-nowrap relative
                ${activeTab === i
                  ? 'border-emerald-300 text-white'
                  : 'border-transparent text-emerald-400 hover:text-emerald-200'}`}
            >
              {tab.label}
              {/* แสดง badge ถ้า tab นั้นมีของขาด */}
              {tabDeficit > 0 && (
                <span className="ml-1 bg-red-500 text-white text-xs rounded-full
                                 w-4 h-4 inline-flex items-center justify-center leading-none">
                  {tabDeficit}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* SUB HEADER */}
      <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2">
        <p className="text-xs font-medium text-emerald-800">{TABS[activeTab].sub}</p>
      </div>

      {/* ITEM LIST */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {tabItems.map(item => {
          const r       = results[item.id]
          const qty     = r?.actual_qty ?? item.standard_qty
          const deficit = isDeficit(item)

          return (
            <div key={item.id}
              className={`bg-white px-4 py-3 transition-colors
                ${deficit ? 'border-l-4 border-l-red-400' : 'border-l-4 border-l-emerald-400'}`}
            >
              {/* Top row: name + stepper */}
              <div className="flex items-center gap-3">

                {/* Item info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 leading-tight truncate">
                    {item.item_name_en}
                  </p>
                  {item.item_name_th && (
                    <p className="text-xs text-gray-400 mt-0.5">{item.item_name_th}</p>
                  )}
                  {/* มาตรฐาน */}
                  <p className="text-xs text-gray-400 mt-1">
                    มาตรฐาน:
                    <span className="font-semibold text-gray-600 ml-1">
                      {item.standard_qty} {item.unit}
                    </span>
                  </p>
                </div>

                {/* ★ STEPPER: − [qty] + */}
                <div className="flex items-center gap-0 flex-shrink-0">
                  {/* ปุ่ม − */}
                  <button
                    onClick={() => decrement(item.id)}
                    className={`w-9 h-9 rounded-l-xl flex items-center justify-center
                      text-lg font-bold transition-colors active:scale-95
                      ${deficit
                        ? 'bg-red-100 text-red-600 hover:bg-red-200'
                        : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                  >
                    −
                  </button>

                  {/* แสดงจำนวน */}
                  <div className={`w-12 h-9 flex items-center justify-center
                    text-sm font-bold border-y
                    ${deficit
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}
                  >
                    {qty}
                  </div>

                  {/* ปุ่ม + */}
                  <button
                    onClick={() => increment(item.id, item.standard_qty)}
                    className={`w-9 h-9 rounded-r-xl flex items-center justify-center
                      text-lg font-bold transition-colors active:scale-95
                      ${deficit
                        ? 'bg-red-100 text-red-600 hover:bg-red-200'
                        : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Status badge */}
              <div className="mt-2 flex items-center gap-2">
                {deficit ? (
                  <span className="inline-flex items-center gap-1 text-xs
                    bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.051 3.378c.866-1.5 3.032-1.5 3.898 0l6.354 11.748ZM12 15.75h.007v.008H12v-.008Z"/>
                    </svg>
                    ขาด {item.standard_qty - qty} {item.unit}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs
                    bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m4.5 12.75 6 6 9-13.5"/>
                    </svg>
                    ครบ {item.unit}
                  </span>
                )}
                {qty > item.standard_qty && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    เกินมาตรฐาน +{qty - item.standard_qty}
                  </span>
                )}
              </div>

              {/* Deficit note — บังคับถ้าของขาด */}
              {deficit && (
                <div className="mt-2 bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-xs text-red-600 font-medium mb-1.5 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.051 3.378c.866-1.5 3.032-1.5 3.898 0l6.354 11.748ZM12 15.75h.007v.008H12v-.008Z"/>
                    </svg>
                    บังคับกรอกหมายเหตุ
                  </p>
                  <textarea
                    rows={2}
                    value={r?.note ?? ''}
                    onChange={e => updateNote(item.id, e.target.value)}
                    placeholder="เช่น รอกล่องยาเติมจากคลัง / กำลังดำเนินการ..."
                    className="w-full text-xs border border-red-200 rounded-lg px-3 py-2
                               placeholder:text-red-300 focus:outline-none focus:ring-2
                               focus:ring-red-400 bg-white text-gray-800 resize-none"
                  />
                </div>
              )}
            </div>
          )
        })}

        {/* Tab nav helper */}
        <div className="flex justify-between px-4 py-3 bg-gray-50">
          <button onClick={() => setActiveTab(i => Math.max(0, i - 1))}
            disabled={activeTab === 0}
            className="flex items-center gap-1 text-xs text-gray-500 disabled:opacity-30">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 19.5 8.25 12l7.5-7.5"/>
            </svg>
            {activeTab > 0 ? TABS[activeTab - 1].label : ''}
          </button>
          <span className="text-xs text-gray-400">{activeTab + 1} / {TABS.length}</span>
          <button onClick={() => setActiveTab(i => Math.min(TABS.length - 1, i + 1))}
            disabled={activeTab === TABS.length - 1}
            className="flex items-center gap-1 text-xs text-gray-500 disabled:opacity-30">
            {activeTab < TABS.length - 1 ? TABS[activeTab + 1].label : ''}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m8.25 4.5 7.5 7.5-7.5 7.5"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ERROR / SUCCESS */}
      {error && (
        <div className="mx-4 mb-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="mx-4 mb-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3
                        text-xs text-emerald-700 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m4.5 12.75 6 6 9-13.5"/>
          </svg>
          บันทึกผลการตรวจเช็คสำเร็จแล้ว!
        </div>
      )}

      {/* SAVE BUTTON */}
      <div className="px-4 py-3 bg-white border-t border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        {deficitCount > 0 && deficitNoNote.length > 0 && (
          <p className="text-xs text-center text-red-500 mb-2">
            กรุณากรอกหมายเหตุสำหรับรายการที่ขาดก่อนบันทึก ({deficitNoNote.length} รายการ)
          </p>
        )}
        <button onClick={handleSave} disabled={saving || saved}
          className="w-full flex items-center justify-center gap-2 bg-emerald-700 text-white
                     py-3.5 rounded-xl text-sm font-medium shadow-sm active:scale-95
                     transition-all disabled:opacity-60 disabled:cursor-not-allowed">
          {saving ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/>
            </svg>
          )}
          {saved ? 'บันทึกแล้ว ✓' : saving ? 'กำลังบันทึก...' : 'บันทึกผลการตรวจเช็คละเอียด'}
        </button>
      </div>

      {/* BOTTOM NAV */}
      <nav className="flex bg-white border-t border-gray-100">
        {[
          { icon: '🏠', label: 'หน้าหลัก', href: '/' },
          { icon: '📋', label: 'ตรวจเช็ค', href: '/check', active: true },
          { icon: '📄', label: 'สรุป',      href: '/summary' },
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
    </div>
  )
}
