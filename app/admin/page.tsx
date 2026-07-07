'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'

interface Ward {
  id: string
  ward_code: string
  ward_name_th: string
  ward_name_en: string
  floor: number | null
  is_active: boolean
}

interface CartItem {
  id: string
  drawer: string
  item_name_en: string
  item_name_th: string
  standard_qty: number
  unit: string
  expiry_date: string | null
  alert_days: number
  is_active: boolean
}

const DRAWER_LABELS: Record<string, string> = {
  top: 'ชั้นบนสุด',
  drawer1: 'ลิ้นชัก 1',
  drawer2: 'ลิ้นชัก 2',
  drawer3: 'ลิ้นชัก 3',
  drawer4: 'ลิ้นชัก 4',
}

type Tab = 'wards' | 'items' | 'expiry'

// ---- Swipeable Row Component ----
function SwipeableRow({
  children,
  onDelete,
}: {
  children: React.ReactNode
  onDelete: () => void
}) {
  const [offsetX, setOffsetX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const startX = useRef(0)
  const currentX = useRef(0)
  const DELETE_THRESHOLD = -70

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX
    currentX.current = e.touches[0].clientX
    setIsDragging(true)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging) return
    currentX.current = e.touches[0].clientX
    const diff = currentX.current - startX.current
    if (diff < 0) {
      setOffsetX(Math.max(diff, -80))
    } else if (showDelete) {
      setOffsetX(Math.min(diff - 80, 0))
    }
  }

  function onTouchEnd() {
    setIsDragging(false)
    if (offsetX < DELETE_THRESHOLD) {
      setOffsetX(-80)
      setShowDelete(true)
    } else {
      setOffsetX(0)
      setShowDelete(false)
    }
  }

  function handleDelete() {
    setOffsetX(0)
    setShowDelete(false)
    onDelete()
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Delete button ด้านหลัง */}
      <div className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center bg-red-500 rounded-r-2xl">
        <button onClick={handleDelete}
          className="flex flex-col items-center gap-1 text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
          </svg>
          <span className="text-xs font-medium">ลบ</span>
        </button>
      </div>

      {/* Content ที่เลื่อนได้ */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease',
        }}
        className="relative z-10"
      >
        {children}
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [tab, setTab]         = useState<Tab>('wards')
  const [wards, setWards]     = useState<Ward[]>([])
  const [items, setItems]     = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; type: 'ward' | 'item' } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [editWard, setEditWard]       = useState<Ward | null>(null)
  const [showWardForm, setShowWardForm] = useState(false)
  const newWard = (): Ward => ({ id: '', ward_code: '', ward_name_th: '', ward_name_en: '', floor: null, is_active: true })

  const [editItem, setEditItem]       = useState<CartItem | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [filterDrawer, setFilterDrawer] = useState<string>('all')
  const newItem = (): CartItem => ({ id: '', drawer: 'drawer1', item_name_en: '', item_name_th: '', standard_qty: 1, unit: 'Amp', expiry_date: null, alert_days: 30, is_active: true })

  const [expiryWardId, setExpiryWardId] = useState<string>('')
  const [expiryMap, setExpiryMap] = useState<Record<string, string>>({})
  const [expiryLoading, setExpiryLoading] = useState(false)
  const [expirySaving, setExpirySaving] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: w }, { data: i }] = await Promise.all([
      supabase.from('wards').select('*').order('ward_code'),
      supabase.from('cart_items').select('*').order('drawer').order('item_name_en'),
    ])
    if (w) setWards(w)
    if (i) setItems(i)
    setLoading(false)
  }

  function showMsg(text: string, type: 'ok' | 'err') {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 3000)
  }

  // ===== DELETE =====
  function friendlyDeleteError(error: any, label: string) {
    if (error.code === '23503') {
      return `ลบ "${label}" ไม่ได้ เพราะมีประวัติการตรวจเช็ค/ข้อมูลอื่นอ้างอิงอยู่แล้ว — แนะนำให้กด "ปิด" แทน เพื่อซ่อนจากการใช้งานใหม่ โดยไม่ลบประวัติเก่าทิ้ง`
    }
    return 'ลบไม่ได้: ' + error.message
  }

  async function deleteWard(id: string) {
    setDeleteError(null)
    const name = confirmDelete?.name ?? ''
    const { error } = await supabase.from('wards').delete().eq('id', id)
    if (error) {
      setDeleteError(friendlyDeleteError(error, name))
    } else {
      showMsg('ลบหอผู้ป่วยแล้ว', 'ok')
      loadAll()
      setConfirmDelete(null)
    }
  }

  async function deleteItem(id: string) {
    setDeleteError(null)
    const name = confirmDelete?.name ?? ''
    const { error } = await supabase.from('cart_items').delete().eq('id', id)
    if (error) {
      setDeleteError(friendlyDeleteError(error, name))
    } else {
      showMsg('ลบอุปกรณ์แล้ว', 'ok')
      loadAll()
      setConfirmDelete(null)
    }
  }

  // ===== WARD CRUD =====
  async function saveWard() {
    if (!editWard) return
    if (!editWard.ward_code || !editWard.ward_name_th) {
      showMsg('กรุณากรอกรหัสและชื่อหอผู้ป่วย', 'err'); return
    }
    setSaving(true)
    try {
      if (editWard.id) {
        const { error } = await supabase.from('wards').update({
          ward_code: editWard.ward_code,
          ward_name_th: editWard.ward_name_th,
          ward_name_en: editWard.ward_name_en,
          floor: editWard.floor,
          is_active: editWard.is_active,
        }).eq('id', editWard.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('wards').insert({
          ward_code: editWard.ward_code,
          ward_name_th: editWard.ward_name_th,
          ward_name_en: editWard.ward_name_en,
          floor: editWard.floor,
          is_active: editWard.is_active,
        })
        if (error) throw error
      }
      showMsg('บันทึกสำเร็จ ✓', 'ok')
      setShowWardForm(false)
      setEditWard(null)
      loadAll()
    } catch (e: any) {
      showMsg(e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  async function toggleWardActive(ward: Ward) {
    await supabase.from('wards').update({ is_active: !ward.is_active }).eq('id', ward.id)
    loadAll()
  }

  // ===== ITEM CRUD =====
  async function saveItem() {
    if (!editItem) return
    if (!editItem.item_name_en || !editItem.drawer) {
      showMsg('กรุณากรอกชื่ออุปกรณ์', 'err'); return
    }
    setSaving(true)
    try {
      if (editItem.id) {
        const { error } = await supabase.from('cart_items').update({
          drawer: editItem.drawer,
          item_name_en: editItem.item_name_en,
          item_name_th: editItem.item_name_th,
          standard_qty: editItem.standard_qty,
          unit: editItem.unit,
          expiry_date: editItem.expiry_date || null,
          alert_days: editItem.alert_days,
          is_active: editItem.is_active,
        }).eq('id', editItem.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('cart_items').insert({
          drawer: editItem.drawer,
          item_name_en: editItem.item_name_en,
          item_name_th: editItem.item_name_th,
          standard_qty: editItem.standard_qty,
          unit: editItem.unit,
          expiry_date: editItem.expiry_date || null,
          alert_days: editItem.alert_days,
          is_active: true,
        })
        if (error) throw error
      }
      showMsg('บันทึกสำเร็จ ✓', 'ok')
      setShowItemForm(false)
      setEditItem(null)
      loadAll()
    } catch (e: any) {
      showMsg(e.message, 'err')
    } finally {
      setSaving(false)
    }
  }

  async function toggleItemActive(item: CartItem) {
    await supabase.from('cart_items').update({ is_active: !item.is_active }).eq('id', item.id)
    loadAll()
  }

  // ===== EXPIRY (per ward) =====
  async function loadExpiryForWard(wardId: string) {
    setExpiryWardId(wardId)
    setExpiryMap({})
    if (!wardId) return
    setExpiryLoading(true)
    const { data } = await supabase
      .from('ward_item_expiry')
      .select('item_id, expiry_date')
      .eq('ward_id', wardId)
    const map: Record<string, string> = {}
    if (data) data.forEach((row: any) => { map[row.item_id] = row.expiry_date })
    setExpiryMap(map)
    setExpiryLoading(false)
  }

  function updateExpiryMap(itemId: string, val: string) {
    setExpiryMap(prev => ({ ...prev, [itemId]: val }))
  }

  async function saveExpiryAll() {
    if (!expiryWardId) return
    setExpirySaving(true)
    try {
      const rows = Object.entries(expiryMap)
        .filter(([, date]) => !!date)
        .map(([itemId, date]) => ({ ward_id: expiryWardId, item_id: itemId, expiry_date: date }))
      if (rows.length > 0) {
        const { error } = await supabase.from('ward_item_expiry').upsert(rows, { onConflict: 'ward_id,item_id' })
        if (error) throw error
      }
      showMsg('บันทึกวันหมดอายุสำเร็จ ✓', 'ok')
    } catch (e: any) {
      showMsg(e.message, 'err')
    } finally {
      setExpirySaving(false)
    }
  }

  const filteredItems = filterDrawer === 'all'
    ? items
    : items.filter(i => i.drawer === filterDrawer)

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <svg className="w-8 h-8 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
    </div>
  )

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
          <div>
            <p className="text-xs opacity-70 uppercase tracking-wider">⚙️ ผู้ดูแลระบบ</p>
            <p className="text-base font-medium">จัดการข้อมูล</p>
          </div>
        </div>
      </div>

      {/* TAB */}
      <div className="flex bg-emerald-900">
        {(['wards', 'items', 'expiry'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors
              ${tab === t ? 'border-emerald-300 text-white' : 'border-transparent text-emerald-400'}`}>
            {t === 'wards' ? '🏥 หอผู้ป่วย' : t === 'items' ? '💊 อุปกรณ์ในล้อ' : '🗓️ วันหมดอายุ'}
          </button>
        ))}
      </div>

      {/* MSG */}
      {msg && (
        <div className={`mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm font-medium
          ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {/* hint สไลด์ */}
      <div className="mx-4 mt-2 flex items-center gap-2 text-xs text-gray-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>
        </svg>
        สไลด์ซ้ายเพื่อลบรายการ
      </div>

      <div className="flex-1 overflow-y-auto pb-24">

        {/* ===== WARDS TAB ===== */}
        {tab === 'wards' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                หอผู้ป่วยทั้งหมด ({wards.length})
              </p>
              <button onClick={() => { setEditWard(newWard()); setShowWardForm(true) }}
                className="flex items-center gap-1 bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-xl">
                + เพิ่มหอผู้ป่วย
              </button>
            </div>

            {wards.map(ward => (
              <SwipeableRow key={ward.id}
                onDelete={() => setConfirmDelete({ id: ward.id, name: ward.ward_name_en, type: 'ward' })}>
                <div className={`bg-white rounded-2xl border p-4 ${!ward.is_active ? 'opacity-50' : 'border-gray-100'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{ward.ward_name_en}</p>
                      <p className="text-xs text-gray-400">{ward.ward_name_th}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{ward.ward_code}</span>
                        {ward.floor && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">ชั้น {ward.floor}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => { setEditWard({...ward}); setShowWardForm(true) }}
                        className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-xl">
                        แก้ไข
                      </button>
                      <button onClick={() => toggleWardActive(ward)}
                        className={`text-xs px-3 py-1.5 rounded-xl border
                          ${ward.is_active ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {ward.is_active ? 'ปิด' : 'เปิด'}
                      </button>
                    </div>
                  </div>
                </div>
              </SwipeableRow>
            ))}
          </div>
        )}

        {/* ===== ITEMS TAB ===== */}
        {tab === 'items' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                อุปกรณ์ ({filteredItems.length})
              </p>
              <button onClick={() => { setEditItem(newItem()); setShowItemForm(true) }}
                className="flex items-center gap-1 bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-xl">
                + เพิ่มอุปกรณ์
              </button>
            </div>

            {/* Filter drawer */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {['all', ...Object.keys(DRAWER_LABELS)].map(d => (
                <button key={d} onClick={() => setFilterDrawer(d)}
                  className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors
                    ${filterDrawer === d ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-gray-500 border-gray-200'}`}>
                  {d === 'all' ? 'ทั้งหมด' : DRAWER_LABELS[d]}
                </button>
              ))}
            </div>

            {filteredItems.map(item => (
              <SwipeableRow key={item.id}
                onDelete={() => setConfirmDelete({ id: item.id, name: item.item_name_en, type: 'item' })}>
                <div className={`bg-white rounded-2xl border p-4 ${!item.is_active ? 'opacity-50' : 'border-gray-100'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{item.item_name_en}</p>
                      {item.item_name_th && <p className="text-xs text-gray-400">{item.item_name_th}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">
                          {DRAWER_LABELS[item.drawer] ?? item.drawer}
                        </span>
                        <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                          {item.standard_qty} {item.unit}
                        </span>

                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => { setEditItem({...item}); setShowItemForm(true) }}
                        className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-xl">
                        แก้ไข
                      </button>
                      <button onClick={() => toggleItemActive(item)}
                        className={`text-xs px-3 py-1.5 rounded-xl border
                          ${item.is_active ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {item.is_active ? 'ปิด' : 'เปิด'}
                      </button>
                    </div>
                  </div>
                </div>
              </SwipeableRow>
            ))}
          </div>
        )}

        {/* ===== EXPIRY TAB ===== */}
        {tab === 'expiry' && (
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-medium">เลือกหอผู้ป่วย</label>
              <select value={expiryWardId}
                onChange={e => loadExpiryForWard(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800
                           focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                <option value="">-- เลือกหอผู้ป่วย --</option>
                {wards.map(w => (
                  <option key={w.id} value={w.id}>{w.ward_name_en} ({w.ward_name_th})</option>
                ))}
              </select>
            </div>

            {!expiryWardId && (
              <p className="text-xs text-gray-400 text-center py-8">
                เลือกหอผู้ป่วยก่อน เพื่อดู/แก้ไขวันหมดอายุของแต่ละรายการ
              </p>
            )}

            {expiryWardId && expiryLoading && (
              <p className="text-xs text-gray-400 text-center py-8">กำลังโหลด...</p>
            )}

            {expiryWardId && !expiryLoading && (
              <>
                <p className="text-xs text-gray-400">
                  รายการทั้งหมด ({items.length}) — กรอกเฉพาะรายการที่ทราบวันหมดอายุ ที่ไม่กรอกจะไม่ถูกบันทึก
                </p>
                {Object.keys(DRAWER_LABELS).map(drawerKey => {
                  const drawerItems = items
                    .filter(i => i.drawer === drawerKey)
                    .sort((a, b) => a.item_name_en.localeCompare(b.item_name_en))
                  if (drawerItems.length === 0) return null
                  return (
                    <div key={drawerKey} className="space-y-2">
                      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider
                        bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 mt-3">
                        {DRAWER_LABELS[drawerKey]} ({drawerItems.length})
                      </p>
                      {drawerItems.map(item => (
                        <div key={item.id} className="bg-white rounded-2xl border border-gray-100 p-3">
                          <p className="text-sm font-medium text-gray-800">{item.item_name_en}</p>
                          {item.item_name_th && <p className="text-xs text-gray-400">{item.item_name_th}</p>}
                          <input type="date" value={expiryMap[item.id] ?? ''}
                            onChange={e => updateExpiryMap(item.id, e.target.value)}
                            className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800
                                       focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
                        </div>
                      ))}
                    </div>
                  )
                })}
                <button onClick={saveExpiryAll} disabled={expirySaving}
                  className="w-full bg-emerald-700 text-white py-3 rounded-xl text-sm font-medium
                             disabled:opacity-60 mt-3">
                  {expirySaving ? 'กำลังบันทึก...' : 'บันทึกวันหมดอายุทั้งหมด'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ===== CONFIRM DELETE MODAL ===== */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
              </svg>
            </div>
            <p className="text-center font-semibold text-gray-800 mb-1">ยืนยันการลบ</p>
            <p className="text-center text-sm text-gray-500 mb-3">
              ต้องการลบ <span className="font-medium text-gray-800">"{confirmDelete.name}"</span> ใช่ไหม?<br/>
              <span className="text-red-500">ไม่สามารถกู้คืนได้</span>
            </p>
            {deleteError && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800 mb-3">
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setConfirmDelete(null); setDeleteError(null) }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600">
                {deleteError ? 'ปิดหน้าต่างนี้' : 'ยกเลิก'}
              </button>
              <button
                onClick={() => confirmDelete.type === 'ward'
                  ? deleteWard(confirmDelete.id)
                  : deleteItem(confirmDelete.id)}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-medium">
                ลบเลย
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== WARD FORM MODAL ===== */}
      {showWardForm && editWard && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">{editWard.id ? 'แก้ไขหอผู้ป่วย' : 'เพิ่มหอผู้ป่วยใหม่'}</p>
              <button onClick={() => { setShowWardForm(false); setEditWard(null) }} className="text-gray-400">✕</button>
            </div>
            {[
              { label: 'รหัส Ward *', key: 'ward_code', placeholder: 'เช่น SGM1, ER' },
              { label: 'ชื่อภาษาไทย *', key: 'ward_name_th', placeholder: 'เช่น ศัลยกรรมชาย 1' },
              { label: 'ชื่อภาษาอังกฤษ', key: 'ward_name_en', placeholder: 'เช่น Surgical Male 1' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 font-medium">{f.label}</label>
                <input type="text" value={(editWard as any)[f.key] ?? ''}
                  onChange={e => setEditWard({ ...editWard, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800
                             focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 font-medium">ชั้น</label>
              <input type="number" value={editWard.floor ?? ''}
                onChange={e => setEditWard({ ...editWard, floor: parseInt(e.target.value) || null })}
                className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800
                           focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
            </div>
            <button onClick={saveWard} disabled={saving}
              className="w-full bg-emerald-700 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-60">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* ===== ITEM FORM MODAL ===== */}
      {showItemForm && editItem && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50 overflow-y-auto">
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-6 space-y-4 mt-auto">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">{editItem.id ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์ใหม่'}</p>
              <button onClick={() => { setShowItemForm(false); setEditItem(null) }} className="text-gray-400">✕</button>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">ลิ้นชัก *</label>
              <select value={editItem.drawer}
                onChange={e => setEditItem({ ...editItem, drawer: e.target.value })}
                className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800
                           focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                {Object.entries(DRAWER_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {[
              { label: 'ชื่อ (อังกฤษ) *', key: 'item_name_en', placeholder: 'เช่น Adrenaline 1mg/ml' },
              { label: 'ชื่อ (ไทย)', key: 'item_name_th', placeholder: 'เช่น อะดรีนาลีน' },
              { label: 'หน่วย', key: 'unit', placeholder: 'เช่น Amp, ชิ้น, ขวด' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 font-medium">{f.label}</label>
                <input type="text" value={(editItem as any)[f.key] ?? ''}
                  onChange={e => setEditItem({ ...editItem, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800
                             focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">จำนวนมาตรฐาน *</label>
                <input type="number" min="1" value={editItem.standard_qty}
                  onChange={e => setEditItem({ ...editItem, standard_qty: parseInt(e.target.value) || 1 })}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800
                             focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">แจ้งเตือนก่อน (วัน)</label>
                <input type="number" min="1" value={editItem.alert_days}
                  onChange={e => setEditItem({ ...editItem, alert_days: parseInt(e.target.value) || 30 })}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800
                             focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
            </div>
            <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
              ℹ️ วันหมดอายุของรายการนี้ ตอนนี้เก็บแยกตามแต่ละหอผู้ป่วยแล้ว
              (ดูได้ที่แท็บ "วันหมดอายุรายวอร์ด")
            </p>
            <button onClick={saveItem} disabled={saving}
              className="w-full bg-emerald-700 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-60">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto flex bg-white border-t border-gray-100 z-40">
        {[
          { icon: '🏠', label: 'หน้าหลัก', href: '/' },
          { icon: '📋', label: 'ตรวจเช็ค', href: '/check' },
          { icon: '📄', label: 'สรุป',      href: '/summary' },
          { icon: '📊', label: 'แดชบอร์ด', href: '/dashboard' },
        ].map(item => (
          <a key={item.href} href={item.href}
            className="flex-1 flex flex-col items-center py-3 gap-1 text-sm border-t-2
                       border-transparent text-gray-400 hover:text-gray-600">
            <span className="text-2xl leading-none">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  )
}
