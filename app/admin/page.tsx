'use client'

import { useEffect, useState } from 'react'
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
  drawer1: 'ลิ้นชัก 1 (ยาฉุกเฉิน)',
  drawer2: 'ลิ้นชัก 2 (ทางเดินหายใจ)',
  drawer3: 'ลิ้นชัก 3 (น้ำเกลือ)',
  drawer4: 'ลิ้นชัก 4 (เบ็ดเตล็ด)',
}

type Tab = 'wards' | 'items'

export default function AdminPage() {
  const [tab, setTab]           = useState<Tab>('wards')
  const [wards, setWards]       = useState<Ward[]>([])
  const [items, setItems]       = useState<CartItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  // Ward form
  const [editWard, setEditWard] = useState<Ward | null>(null)
  const [showWardForm, setShowWardForm] = useState(false)
  const newWard = (): Ward => ({ id: '', ward_code: '', ward_name_th: '', ward_name_en: '', floor: null, is_active: true })

  // Item form
  const [editItem, setEditItem] = useState<CartItem | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [filterDrawer, setFilterDrawer] = useState<string>('all')
  const newItem = (): CartItem => ({ id: '', drawer: 'drawer1', item_name_en: '', item_name_th: '', standard_qty: 1, unit: 'Amp', expiry_date: null, alert_days: 30, is_active: true })

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
        {(['wards', 'items'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors
              ${tab === t ? 'border-emerald-300 text-white' : 'border-transparent text-emerald-400'}`}>
            {t === 'wards' ? '🏥 หอผู้ป่วย' : '💊 อุปกรณ์ในล้อ'}
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

      <div className="flex-1 overflow-y-auto">

        {/* ===== WARDS TAB ===== */}
        {tab === 'wards' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                หอผู้ป่วยทั้งหมด ({wards.length})
              </p>
              <button onClick={() => { setEditWard(newWard()); setShowWardForm(true) }}
                className="flex items-center gap-1 bg-emerald-700 text-white text-xs
                           px-3 py-1.5 rounded-xl">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                เพิ่มหอผู้ป่วย
              </button>
            </div>

            {wards.map(ward => (
              <div key={ward.id}
                className={`bg-white rounded-2xl border p-4 ${!ward.is_active ? 'opacity-50' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{ward.ward_name_en}</p>
                    <p className="text-xs text-gray-400">{ward.ward_name_th}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {ward.ward_code}
                      </span>
                      {ward.floor && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          ชั้น {ward.floor}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => { setEditWard(ward); setShowWardForm(true) }}
                      className="text-xs bg-blue-50 text-blue-700 border border-blue-200
                                 px-3 py-1.5 rounded-xl">
                      แก้ไข
                    </button>
                    <button onClick={() => toggleWardActive(ward)}
                      className={`text-xs px-3 py-1.5 rounded-xl border
                        ${ward.is_active
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {ward.is_active ? 'ปิด' : 'เปิด'}
                    </button>
                  </div>
                </div>
              </div>
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
                className="flex items-center gap-1 bg-emerald-700 text-white text-xs
                           px-3 py-1.5 rounded-xl">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                เพิ่มอุปกรณ์
              </button>
            </div>

            {/* Filter drawer */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {['all', ...Object.keys(DRAWER_LABELS)].map(d => (
                <button key={d} onClick={() => setFilterDrawer(d)}
                  className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors
                    ${filterDrawer === d
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white text-gray-500 border-gray-200'}`}>
                  {d === 'all' ? 'ทั้งหมด' : DRAWER_LABELS[d].split(' ')[0]+' '+DRAWER_LABELS[d].split(' ')[1]}
                </button>
              ))}
            </div>

            {filteredItems.map(item => (
              <div key={item.id}
                className={`bg-white rounded-2xl border p-4 ${!item.is_active ? 'opacity-50' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.item_name_en}</p>
                    {item.item_name_th && <p className="text-xs text-gray-400">{item.item_name_th}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">
                        {DRAWER_LABELS[item.drawer] ?? item.drawer}
                      </span>
                      <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                        มาตรฐาน: {item.standard_qty} {item.unit}
                      </span>
                      {item.expiry_date && (
                        <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
                          Exp: {new Date(item.expiry_date).toLocaleDateString('th-TH')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => { setEditItem(item); setShowItemForm(true) }}
                      className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-xl">
                      แก้ไข
                    </button>
                    <button onClick={() => toggleItemActive(item)}
                      className={`text-xs px-3 py-1.5 rounded-xl border
                        ${item.is_active
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {item.is_active ? 'ปิด' : 'เปิด'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== WARD FORM MODAL ===== */}
      {showWardForm && editWard && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-gray-800">
                {editWard.id ? 'แก้ไขหอผู้ป่วย' : 'เพิ่มหอผู้ป่วยใหม่'}
              </p>
              <button onClick={() => { setShowWardForm(false); setEditWard(null) }}
                className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {[
              { label: 'รหัส Ward *', key: 'ward_code', placeholder: 'เช่น ICU1, ER, WARD3A' },
              { label: 'ชื่อภาษาไทย *', key: 'ward_name_th', placeholder: 'เช่น ไอซียู 1' },
              { label: 'ชื่อภาษาอังกฤษ', key: 'ward_name_en', placeholder: 'เช่น ICU 1' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 font-medium">{f.label}</label>
                <input type="text"
                  value={(editWard as any)[f.key] ?? ''}
                  onChange={e => setEditWard({ ...editWard, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
            ))}

            <div>
              <label className="text-xs text-gray-500 font-medium">ชั้น</label>
              <input type="number"
                value={editWard.floor ?? ''}
                onChange={e => setEditWard({ ...editWard, floor: parseInt(e.target.value) || null })}
                placeholder="เช่น 5"
                className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
            </div>

            <button onClick={saveWard} disabled={saving}
              className="w-full bg-emerald-700 text-white py-3 rounded-xl text-sm font-medium
                         disabled:opacity-60">
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
              <p className="text-base font-semibold text-gray-800">
                {editItem.id ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์ใหม่'}
              </p>
              <button onClick={() => { setShowItemForm(false); setEditItem(null) }}
                className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div>
              <label className="text-xs text-gray-500 font-medium">ลิ้นชัก *</label>
              <select value={editItem.drawer}
                onChange={e => setEditItem({ ...editItem, drawer: e.target.value })}
                className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm
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
                <input type="text"
                  value={(editItem as any)[f.key] ?? ''}
                  onChange={e => setEditItem({ ...editItem, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">จำนวนมาตรฐาน *</label>
                <input type="number" min="1"
                  value={editItem.standard_qty}
                  onChange={e => setEditItem({ ...editItem, standard_qty: parseInt(e.target.value) || 1 })}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">แจ้งเตือนก่อน (วัน)</label>
                <input type="number" min="1"
                  value={editItem.alert_days}
                  onChange={e => setEditItem({ ...editItem, alert_days: parseInt(e.target.value) || 30 })}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 font-medium">วันหมดอายุ (ถ้ามี)</label>
              <input type="date"
                value={editItem.expiry_date ?? ''}
                onChange={e => setEditItem({ ...editItem, expiry_date: e.target.value || null })}
                className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
            </div>

            <button onClick={saveItem} disabled={saving}
              className="w-full bg-emerald-700 text-white py-3 rounded-xl text-sm font-medium
                         disabled:opacity-60">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <nav className="flex bg-white border-t border-gray-100">
        {[
          { icon: '🏠', label: 'หน้าหลัก',  href: '/' },
          { icon: '📋', label: 'ตรวจเช็ค',  href: '/check' },
          { icon: '📄', label: 'สรุป',       href: '/summary' },
          { icon: '📊', label: 'แดชบอร์ด',  href: '/dashboard' },
        ].map(item => (
          <a key={item.href} href={item.href}
            className="flex-1 flex flex-col items-center py-2 gap-0.5 text-xs border-t-2
                       border-transparent text-gray-400 hover:text-gray-600">
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  )
}
