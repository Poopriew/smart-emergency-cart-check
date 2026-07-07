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
  actual_qty: number
  note: string
  expiryDate: string
}

const TABS = [
  { key: 'top',     label: 'ชั้นบนสุด',  sub: 'ชั้นบนสุด' },
  { key: 'drawer1', label: 'ลิ้นชัก 1',  sub: 'ลิ้นชักที่ 1' },
  { key: 'drawer2', label: 'ลิ้นชัก 2',  sub: 'ลิ้นชักที่ 2' },
  { key: 'drawer3', label: 'ลิ้นชัก 3',  sub: 'ลิ้นชักที่ 3' },
  { key: 'drawer4', label: 'ลิ้นชัก 4',  sub: 'ลิ้นชักที่ 4' },
]

export default function CheckPage() {
  const [activeTab, setActiveTab] = useState(0)
  const [allItems, setAllItems]   = useState<CartItem[]>([])
  const [results, setResults]     = useState<Record<string, ItemResult>>({})
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [wardId, setWardId]       = useState<string | null>(null)
  const [wardName, setWardName]   = useState('...')
  const [checkId, setCheckId]     = useState<string | null>(null)
  const [existingCheck, setExistingCheck] = useState<any>(null)
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false)
  const [refilledItems, setRefilledItems] = useState<Record<string, boolean>>({})

  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function load() {
      // อ่าน ward จาก URL เช่น ?ward=SGM1
      const params = new URLSearchParams(window.location.search)
      const wCode = params.get('ward') || 'SGM1'
      const isRefill = params.get('refill') === '1'

      const { data: ward } = await supabase
        .from('wards')
        .select('id, ward_name_en, ward_name_th')
        .eq('ward_code', wCode)
        .single()

      if (ward) {
        setWardId(ward.id)
        setWardName(`${ward.ward_name_en} (${ward.ward_name_th})`)
      }

      const { data: items } = await supabase
        .from('cart_items').select('*')
        .eq('is_active', true).order('drawer').order('item_name_en')

      const init: Record<string, ItemResult> = {}
      if (items) {
        items.forEach((item: CartItem) => {
          init[item.id] = {
            item_id: item.id,
            actual_qty: item.standard_qty,
            note: '',
            expiryDate: '',
          }
        })
        setAllItems(items)
      }

      let existingResults: any[] | null = null
      if (ward) {
        const { data: check } = await supabase
          .from('daily_checks').select('id, status, inspector_name, submitted_at')
          .eq('ward_id', ward.id).eq('check_date', todayStr).single()
        if (check) {
          setCheckId(check.id)
          setExistingCheck(check)

          // โหลดผลตรวจเดิมของวันนี้มาแทนค่ามาตรฐาน กันจำนวนรีเซ็ตทุกครั้งที่เข้าหน้านี้
          const { data: prevResults } = await supabase
            .from('check_results')
            .select('item_id, actual_qty, note')
            .eq('check_id', check.id)
          existingResults = prevResults
        }
      }

      if (existingResults) {
        existingResults.forEach((r: any) => {
          if (init[r.item_id]) {
            init[r.item_id] = {
              ...init[r.item_id],
              actual_qty: r.actual_qty,
              note: r.note || '',
            }
          }
        })
      }

      setResults(init)

      // มาจากปุ่ม "เติมของ" (?refill=1) -> เลื่อนไปแท็บแรกที่มีของขาดให้อัตโนมัติ
      if (isRefill && items) {
        const deficitItem = items.find((item: CartItem) => {
          const qty = existingResults?.find((r: any) => r.item_id === item.id)?.actual_qty ?? item.standard_qty
          return qty < item.standard_qty
        })
        if (deficitItem) {
          const tabIndex = TABS.findIndex(t => t.key === deficitItem.drawer)
          if (tabIndex >= 0) setActiveTab(tabIndex)
        }
      }
    }
    load()
  }, [])

  const tabItems = allItems.filter(i => i.drawer === TABS[activeTab].key)

  function increment(itemId: string, max: number) {
    setResults(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], actual_qty: Math.min(prev[itemId].actual_qty + 1, max * 2) }
    }))
    setRefilledItems(prev => ({ ...prev, [itemId]: true }))
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
  function updateExpiry(itemId: string, val: string) {
    setResults(prev => ({ ...prev, [itemId]: { ...prev[itemId], expiryDate: val } }))
  }

  function isDeficit(item: CartItem) {
    return (results[item.id]?.actual_qty ?? item.standard_qty) < item.standard_qty
  }

  const deficitCount  = allItems.filter(i => isDeficit(i)).length
  const deficitNoNote = allItems.filter(i => isDeficit(i) && !results[i.id]?.note.trim())

  async function handleSave(force = false) {
    if (!wardId) { setError('ไม่พบข้อมูล Ward กรุณารีเฟรชหน้า'); return }
    if (deficitNoNote.length > 0) {
      setError(`กรุณากรอกหมายเหตุสำหรับรายการที่ขาด ${deficitNoNote.length} รายการ`)
      return
    }

    if (!force && existingCheck && (existingCheck.status === 'submitted' || existingCheck.status === 'confirmed')) {
      setShowDuplicateConfirm(true)
      return
    }

    setError(null)
    setSaving(true)
    try {
      let currentCheckId = checkId
      // บันทึกทุกครั้ง (รวมถึงตอนเติมของหลังยืนยันสรุปไปแล้ว) จะรีเซ็ตสถานะกลับเป็น 'submitted'
      // เพื่อบังคับให้ต้องไปกดยืนยันสรุปข้อมูลใหม่อีกครั้งที่หน้า Summary
      const { data: check, error: err } = await supabase
        .from('daily_checks')
        .upsert({
          ward_id: wardId,
          check_date: todayStr,
          inspector_name: existingCheck?.inspector_name || 'พว. ผู้ตรวจ',
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          confirmed_at: null,
        }, { onConflict: 'ward_id,check_date' })
        .select('id').single()
      if (err) throw err
      currentCheckId = check.id
      setCheckId(check.id)

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

      // บันทึกวันหมดอายุของใหม่ (ถ้ามีการกรอก) แยกตาม ward + item
      const expiryRows = allItems
        .filter(item => results[item.id]?.expiryDate)
        .map(item => ({
          ward_id: wardId,
          item_id: item.id,
          expiry_date: results[item.id].expiryDate,
        }))

      if (expiryRows.length > 0) {
        const { error: expErr } = await supabase
          .from('ward_item_expiry')
          .upsert(expiryRows, { onConflict: 'ward_id,item_id' })
        if (expErr) throw expErr
      }

      setSaved(true)
      setShowDuplicateConfirm(false)
      setTimeout(() => {
        const p = new URLSearchParams(window.location.search)
        const wc = p.get('ward') || 'SGM1'
        window.location.href = `/summary?ward=${wc}`
      }, 800)

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
            <p className="text-base font-medium">{wardName}</p>
            <p className="text-xs opacity-60">{new Date().toLocaleDateString('th-TH')}</p>
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
          const tabItems2  = allItems.filter(x => x.drawer === tab.key)
          const tabDeficit = tabItems2.filter(x => isDeficit(x)).length
          return (
            <button key={tab.key} onClick={() => setActiveTab(i)}
              className={`flex-shrink-0 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors
                whitespace-nowrap
                ${activeTab === i
                  ? 'border-emerald-300 text-white'
                  : 'border-transparent text-emerald-400 hover:text-emerald-200'}`}>
              {tab.label}
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
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100 pb-32">
        {tabItems.map(item => {
          const r      = results[item.id]
          const qty    = r?.actual_qty ?? item.standard_qty
          const deficit = isDeficit(item)

          return (
            <div key={item.id}
              className={`bg-white px-4 py-3 transition-colors
                ${deficit ? 'border-l-4 border-l-red-400' : 'border-l-4 border-l-emerald-400'}`}>

              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 leading-tight truncate">
                    {item.item_name_en}
                  </p>
                  {item.item_name_th && (
                    <p className="text-xs text-gray-400 mt-0.5">{item.item_name_th}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    มาตรฐาน:
                    <span className="font-semibold text-gray-600 ml-1">
                      {item.standard_qty} {item.unit}
                    </span>
                  </p>
                </div>

                {/* STEPPER */}
                <div className="flex items-center flex-shrink-0">
                  <button onClick={() => decrement(item.id)}
                    className={`w-9 h-9 rounded-l-xl flex items-center justify-center
                      text-lg font-bold transition-colors active:scale-95
                      ${deficit ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                    −
                  </button>
                  <div className={`w-12 h-9 flex items-center justify-center text-sm font-bold border-y
                    ${deficit ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                    {qty}
                  </div>
                  <button onClick={() => increment(item.id, item.standard_qty)}
                    className={`w-9 h-9 rounded-r-xl flex items-center justify-center
                      text-lg font-bold transition-colors active:scale-95
                      ${deficit ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                    +
                  </button>
                </div>
              </div>

              {/* Status badge */}
              <div className="mt-2 flex items-center gap-2">
                {deficit ? (
                  <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                    ⚠️ ขาด {item.standard_qty - qty} {item.unit}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    ✓ ครบ {item.unit}
                  </span>
                )}
                {qty > item.standard_qty && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    เกิน +{qty - item.standard_qty}
                  </span>
                )}
              </div>

              {/* Deficit note */}
              {deficit && (
                <div className="mt-2 bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-xs text-red-600 font-medium mb-1.5">⚠️ บังคับกรอกหมายเหตุ</p>
                  <textarea rows={2} value={r?.note ?? ''}
                    onChange={e => updateNote(item.id, e.target.value)}
                    placeholder="เช่น รอกล่องยาเติมจากคลัง / กำลังดำเนินการ..."
                    className="w-full text-xs border border-red-200 rounded-lg px-3 py-2
                               placeholder:text-red-300 focus:outline-none focus:ring-2
                               focus:ring-red-400 bg-white text-gray-800 resize-none"/>
                </div>
              )}

              {/* วันหมดอายุของใหม่ - โชว์เฉพาะตอนกด + เติมของในรอบนี้เท่านั้น ไม่โชว์แค่เพราะขาด (กด -) */}
              {refilledItems[item.id] && (
                <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <p className="text-xs text-gray-500 font-medium mb-1">
                    🗓️ วันหมดอายุของใหม่ (ถ้าเติมของใหม่ ไม่บังคับ)
                  </p>
                  <input type="date" value={r?.expiryDate ?? ''}
                    onChange={e => updateExpiry(item.id, e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-emerald-400
                               bg-white text-gray-800"/>
                </div>
              )}
            </div>
          )
        })}

        {/* Tab nav */}
        <div className="flex justify-between px-4 py-3 bg-gray-50">
          <button onClick={() => setActiveTab(i => Math.max(0, i - 1))}
            disabled={activeTab === 0}
            className="flex items-center gap-1 text-xs text-gray-500 disabled:opacity-30">
            ← {activeTab > 0 ? TABS[activeTab - 1].label : ''}
          </button>
          <span className="text-xs text-gray-400">{activeTab + 1} / {TABS.length}</span>
          <button onClick={() => setActiveTab(i => Math.min(TABS.length - 1, i + 1))}
            disabled={activeTab === TABS.length - 1}
            className="flex items-center gap-1 text-xs text-gray-500 disabled:opacity-30">
            {activeTab < TABS.length - 1 ? TABS[activeTab + 1].label : ''} →
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
                        text-xs text-emerald-700">
          ✓ บันทึกผลการตรวจเช็คสำเร็จแล้ว!
        </div>
      )}

      {/* SAVE BUTTON */}
      <div className="fixed bottom-16 left-0 right-0 max-w-md mx-auto px-4 py-3 bg-white
                      border-t border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] z-30">
        {deficitCount > 0 && deficitNoNote.length > 0 && (
          <p className="text-xs text-center text-red-500 mb-2">
            กรุณากรอกหมายเหตุก่อนบันทึก ({deficitNoNote.length} รายการ)
          </p>
        )}
        <button onClick={() => handleSave()} disabled={saving || saved}
          className="w-full flex items-center justify-center gap-2 bg-emerald-700 text-white
                     py-3.5 rounded-xl text-sm font-medium shadow-sm active:scale-95
                     transition-all disabled:opacity-60 disabled:cursor-not-allowed">
          {saving ? '⏳ กำลังบันทึก...' : saved ? '✓ บันทึกแล้ว' : '📤 บันทึกผลการตรวจเช็คละเอียด'}
        </button>
      </div>

      {/* ===== DUPLICATE CHECK CONFIRM MODAL ===== */}
      {showDuplicateConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">⚠️</span>
              <p className="text-sm font-semibold text-gray-800">วันนี้มีการตรวจสอบไปแล้ว</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-4">
              หอผู้ป่วยนี้มีการบันทึกผลตรวจของวันนี้ไปแล้ว
              โดย <span className="font-medium text-gray-700">{existingCheck?.inspector_name ?? '-'}</span>
              {existingCheck?.submitted_at && (
                <> เมื่อเวลา {new Date(existingCheck.submitted_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</>
              )}
              <br />ต้องการบันทึกข้อมูลซ้ำแทนที่ของเดิมหรือไม่?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowDuplicateConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600">
                ยกเลิก
              </button>
              <button onClick={() => handleSave(true)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white">
                บันทึกซ้ำ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto flex bg-white border-t border-gray-100 z-40 h-16">
        {[
          { icon: '🏠', label: 'หน้าหลัก', href: '/' },
          { icon: '📋', label: 'ตรวจเช็ค', href: '/check', active: true },
          { icon: '📄', label: 'สรุป',      href: '/summary' },
          { icon: '📊', label: 'แดชบอร์ด', href: '/dashboard' },
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
