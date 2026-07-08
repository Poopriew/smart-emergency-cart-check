'use client'

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getWorkDateStr } from './dateUtils'

// ---- Types ----
interface Ward {
  id: string
  ward_code: string
  ward_name_th: string
  ward_name_en: string
}

interface ExpiryAlert {
  item_id: string
  item_name_en: string
  item_name_th: string
  expiry_date: string
  days_remaining: number
}

type TapeAnswer = 'yes' | 'no' | null

// ---- Helpers ----
function formatThaiDate(date: Date): string {
  const thaiMonths = [
    'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน',
    'พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม',
    'กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
  ]
  return `${date.getDate()} ${thaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`
}

// ============================================================
// PAGE COMPONENT
// ============================================================
export default function SafeteTapePage() {
  const [ward, setWard] = useState<Ward | null>(null)
  const [alerts, setAlerts] = useState<ExpiryAlert[]>([])
  const [tapeAnswer, setTapeAnswer] = useState<TapeAnswer>(null)
  const [inspectorName, setInspectorName] = useState('')
  const [tapeNote, setTapeNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alertIndex, setAlertIndex] = useState(0)
  const [checkInfo, setCheckInfo] = useState<any>(null)
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false)
  const [deficitItems, setDeficitItems] = useState<any[]>([])
  const [expiryUpdateItem, setExpiryUpdateItem] = useState<ExpiryAlert | null>(null)
  const [newExpiryDate, setNewExpiryDate] = useState('')
  const [expirySaving, setExpirySaving] = useState(false)

  const today = new Date()
  const todayStr = getWorkDateStr()

  // ---- Load ward + expiry alerts ----
  useEffect(() => {
    async function load() {
      const params = new URLSearchParams(window.location.search)
      const wardCode = params.get('ward') || 'SGM1'
      // โหลด ward แรก (ICU1) — production ใช้ auth user เลือก ward
      const { data: wardData } = await supabase
        .from('wards')
        .select('*')
        .eq('ward_code', wardCode)
        .single()
      if (wardData) setWard(wardData)

      // โหลด expiry alerts เฉพาะของวอร์ดตัวเอง
      if (wardData) {
        const { data: alertData } = await supabase
          .from('expiry_alerts')
          .select('*')
          .eq('ward_id', wardData.id)
          .order('days_remaining', { ascending: true })
        if (alertData) setAlerts(alertData)
      }
        // โหลด check วันนี้
if (wardData) {
  const { data: checkData } = await supabase
    .from('daily_checks')
    .select('*')
    .eq('ward_id', wardData.id)
    .eq('check_date', todayStr)
    .single()
  if (checkData) {
    setCheckInfo(checkData)
    const { data: deficitData } = await supabase
      .from('check_results')
      .select(`
        actual_qty, note,
        cart_items ( item_name_en, item_name_th, standard_qty, unit )
      `)
      .eq('check_id', checkData.id)
      .eq('is_deficit', true)
    if (deficitData) setDeficitItems(deficitData)
  }
}
    }
    load()
  }, [])

  // หมุน alert banner ถ้ามีหลายรายการ
  useEffect(() => {
    if (alerts.length <= 1) return
    const t = setInterval(() => {
      setAlertIndex(i => (i + 1) % alerts.length)
    }, 4000)
    return () => clearInterval(t)
  }, [alerts])

  // ---- Save to Supabase ----
  async function handleSave(force = false) {
    if (!inspectorName.trim()) {
      setError('กรุณากรอกชื่อผู้ตรวจสอบ')
      return
    }
    if (tapeAnswer === null) {
      setError('กรุณาตอบคำถามสายคาดก่อน')
      return
    }
    setError(null)

    if (!force && checkInfo && (checkInfo.status === 'submitted' || checkInfo.status === 'confirmed')) {
      setShowDuplicateConfirm(true)
      return
    }

    setSaving(true)
    try {
      if (!ward?.id) {
        setError('ไม่พบข้อมูล Ward กรุณารีเฟรชหน้าแล้วลองใหม่')
        return
      }

      const { data: savedCheck, error: dbError } = await supabase
        .from('daily_checks')
        .upsert({
          ward_id: ward.id,
          check_date: todayStr,
          inspector_name: inspectorName.trim(),
          tape_status: tapeAnswer === 'yes',
          tape_note: tapeNote.trim() || null,
          status: tapeAnswer === 'yes' ? 'submitted' : 'draft',
          submitted_at: tapeAnswer === 'yes' ? new Date().toISOString() : null,
        }, { onConflict: 'ward_id,check_date' })
        .select('id')
        .single()

      if (dbError) throw dbError

      if (tapeAnswer === 'yes' && savedCheck?.id) {
        await supabase.from('check_results').delete().eq('check_id', savedCheck.id)
      }

      setSaved(true)
      setShowDuplicateConfirm(false)
      setTimeout(() => {
        const p = new URLSearchParams(window.location.search)
        const wc = p.get('ward') || 'SGM1'
        if (tapeAnswer === 'yes') {
          window.location.href = `/summary?ward=${wc}`
        } else {
          window.location.href = `/check?ward=${wc}`
        }
      }, 800)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  // ---- อัปเดตวันหมดอายุใหม่ (เอาของใกล้หมดอายุไปแลกของใหม่มาแล้ว) ----
  async function handleUpdateExpiry() {
    if (!expiryUpdateItem || !ward?.id || !newExpiryDate) return
    setExpirySaving(true)
    try {
      const { error: err } = await supabase
        .from('ward_item_expiry')
        .upsert({
          ward_id: ward.id,
          item_id: expiryUpdateItem.item_id,
          expiry_date: newExpiryDate,
        }, { onConflict: 'ward_id,item_id' })
      if (err) throw err
      setAlerts(prev => prev.filter(a => a.item_id !== expiryUpdateItem.item_id))
      setAlertIndex(0)
      setExpiryUpdateItem(null)
      setNewExpiryDate('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setExpirySaving(false)
    }
  }

  // ---- UI ----
  const currentAlert = alerts[alertIndex]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">

      {/* ===== HEADER ===== */}
      <div className="bg-emerald-800 text-white px-4 pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs tracking-widest opacity-75 uppercase font-medium">
            Smart Emergency Cart Check
          </span>
          <span className="text-xs opacity-60">
            {ward?.ward_code ?? '...'}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {/* avatar circle */}
          <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-emerald-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>
            </svg>
          </div>
          <div>
            <p className="text-base font-medium leading-tight">
              หอผู้ป่วย: {ward?.ward_name_en ?? '...'} ({ward?.ward_name_th ?? '...'})
            </p>
            <p className="text-xs opacity-70 mt-0.5">
              วันที่: {formatThaiDate(today)}
            </p>
          </div>
        </div>
      </div>

      {/* ===== ALERT BANNER (กดได้ เพื่ออัปเดตวันหมดอายุใหม่) ===== */}
      {currentAlert && (
        <button
          onClick={() => { setExpiryUpdateItem(currentAlert); setNewExpiryDate(currentAlert.expiry_date) }}
          className="w-full text-left bg-amber-50 border-l-4 border-amber-400 px-4 py-2.5 flex items-start gap-2 active:bg-amber-100 transition-colors"
        >
          <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
          </svg>
          <div className="text-xs text-amber-800 leading-relaxed flex-1">
            <span className="font-semibold">ALERT:</span>{' '}
            อุปกรณ์ใกล้หมดอายุใน {currentAlert.days_remaining} วัน:{' '}
            <span className="font-medium">{currentAlert.item_name_en}</span>
            {currentAlert.item_name_th && (
              <span className="opacity-75"> ({currentAlert.item_name_th})</span>
            )}
            {' '}— Exp:{' '}
            {new Date(currentAlert.expiry_date).toLocaleDateString('th-TH')}
            {alerts.length > 1 && (
              <span className="ml-2 opacity-50">{alertIndex + 1}/{alerts.length}</span>
            )}
            <span className="block text-amber-500 mt-0.5">แตะเพื่ออัปเดตวันหมดอายุใหม่ →</span>
          </div>
        </button>
      )}

      {/* ===== BODY ===== */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-40">

        {/* Inspector name */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-2">
            ผู้ตรวจสอบ
          </p>
          <input
            type="text"
            value={inspectorName}
            onChange={e => setInspectorName(e.target.value)}
            placeholder="กรอกชื่อ-นามสกุล เช่น พว. นวลพรรณ ใจดี"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800
                       placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Safety tape question */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"/>
              </svg>
            </div>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">คำถามประจำวัน</p>
          </div>

          <p className="text-sm text-gray-700 leading-relaxed mt-2 mb-4">
            ขณะนี้ความสมบูรณ์ของ <span className="font-semibold text-gray-900">Safety Tape</span>{' '}
            (สายคาดล้อฉุกเฉิน) <span className="font-semibold text-gray-900">มีหรือไม่?</span>
          </p>

          <div className="flex flex-col gap-3">
            {/* YES */}
            <button
              onClick={() => setTapeAnswer('yes')}
              className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl border-2 transition-all
                ${tapeAnswer === 'yes'
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-md scale-[1.01]'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'}`}
            >
              <span className="text-xl">🟢</span>
              <div className="text-left">
                <p className="font-semibold text-sm">มีสายคาด / สมบูรณ์</p>
                <p className={`text-xs mt-0.5 ${tapeAnswer === 'yes' ? 'text-emerald-100' : 'text-emerald-600'}`}>
                  Safety Tape ครบถ้วน พร้อมใช้งาน
                </p>
              </div>
              {tapeAnswer === 'yes' && (
                <svg className="w-5 h-5 ml-auto text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m4.5 12.75 6 6 9-13.5"/>
                </svg>
              )}
            </button>

            {/* NO */}
            <button
              onClick={() => setTapeAnswer('no')}
              className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl border-2 transition-all
                ${tapeAnswer === 'no'
                  ? 'bg-red-600 border-red-600 text-white shadow-md scale-[1.01]'
                  : 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100'}`}
            >
              <span className="text-xl">🔴</span>
              <div className="text-left">
                <p className="font-semibold text-sm">ไม่มีสายคาด / สายขาด</p>
                <p className={`text-xs mt-0.5 ${tapeAnswer === 'no' ? 'text-red-100' : 'text-red-500'}`}>
                  ต้องตรวจสอบละเอียด และบันทึกหมายเหตุ
                </p>
              </div>
              {tapeAnswer === 'no' && (
                <svg className="w-5 h-5 ml-auto text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m4.5 12.75 6 6 9-13.5"/>
                </svg>
              )}
            </button>
          </div>

          {/* Note field (บังคับถ้าเลือก no) */}
          {tapeAnswer === 'no' && (
            <div className="mt-3 bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-xs text-red-600 font-medium mb-1.5">
                ⚠️ บังคับกรอกหมายเหตุ
              </p>
              <textarea
                value={tapeNote}
                onChange={e => setTapeNote(e.target.value)}
                rows={3}
                placeholder="ระบุสาเหตุ เช่น มีการเปิดตู้ฉุกเฉินเมื่อคืน / สายคาดชำรุด..."
                className="w-full text-xs border border-red-200 rounded-lg px-3 py-2
                           placeholder:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-400
                           bg-white text-gray-800 resize-none"
              />
            </div>
          )}
        </div>

        {/* ===== รายการของที่ขาด + ปุ่มเติมของ ===== */}
        {deficitItems.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⚠️</span>
              <p className="text-sm font-semibold text-red-700">
                มีของไม่ครบ {deficitItems.length} รายการ ต้องเติม
              </p>
            </div>
            <div className="space-y-1.5 mb-3">
              {deficitItems.map((d: any, i: number) => (
                <div key={i} className="flex justify-between text-xs text-red-600">
                  <span>
                    {d.cart_items?.item_name_en}
                    {d.cart_items?.item_name_th ? ` (${d.cart_items.item_name_th})` : ''}
                  </span>
                  <span className="font-medium">
                    {d.actual_qty} / {d.cart_items?.standard_qty} {d.cart_items?.unit}
                  </span>
                </div>
              ))}
            </div>
            <a href={`/check?ward=${ward?.ward_code ?? ''}&refill=1`}
              className="block text-center bg-red-600 text-white text-sm font-medium py-2.5 rounded-xl">
              🔧 เติมของ
            </a>
          </div>
        )}

        {/* Last check info */}
<div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
  <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-2">
    สถานะล่าสุด
  </p>
  <div className="text-xs text-gray-500 space-y-1.5">
    <div className="flex justify-between">
      <span>การตรวจสอบครั้งล่าสุด</span>
      <span className="font-medium text-gray-700">
        {checkInfo
          ? new Date(checkInfo.submitted_at ?? checkInfo.created_at)
              .toLocaleDateString('th-TH')
          : '—'}
      </span>
    </div>
    <div className="flex justify-between">
      <span>ผู้ตรวจสอบ</span>
      <span className="font-medium text-gray-700">
        {checkInfo?.inspector_name ?? '—'}
      </span>
    </div>
    <div className="flex justify-between">
      <span>ผลการตรวจ</span>
      <span className={`font-medium ${
        checkInfo?.tape_status
          ? 'text-emerald-600'
          : checkInfo
          ? 'text-red-600'
          : 'text-gray-400'}`}>
        {checkInfo
          ? checkInfo.tape_status ? 'สมบูรณ์' : 'พบปัญหา'
          : 'ยังไม่ได้ตรวจ'}
      </span>
    </div>
  </div>
</div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Success */}
        {saved && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m4.5 12.75 6 6 9-13.5"/>
            </svg>
            บันทึกสำเร็จแล้ว!
          </div>
        )}

      </div>

      {/* ===== UPDATE EXPIRY MODAL ===== */}
      {expiryUpdateItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🗓️</span>
              <p className="text-sm font-semibold text-gray-800">อัปเดตวันหมดอายุใหม่</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              {expiryUpdateItem.item_name_en}
              {expiryUpdateItem.item_name_th ? ` (${expiryUpdateItem.item_name_th})` : ''}
              <br />ถ้าเอาของเดิมไปแลกของใหม่มาแล้ว กรอกวันหมดอายุใหม่แล้วกดบันทึก
            </p>
            <input type="date" value={newExpiryDate}
              onChange={e => setNewExpiryDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800
                         focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-4"/>
            <div className="flex gap-2">
              <button onClick={() => { setExpiryUpdateItem(null); setNewExpiryDate('') }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600">
                ยกเลิก
              </button>
              <button onClick={handleUpdateExpiry} disabled={expirySaving || !newExpiryDate}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-emerald-700 text-white
                           disabled:opacity-60 disabled:cursor-not-allowed">
                {expirySaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DUPLICATE CHECK CONFIRM MODAL ===== */}
      {showDuplicateConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">⚠️</span>
              <p className="text-sm font-semibold text-gray-800">วันนี้มีการตรวจสอบไปแล้ว</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-4">
              หอผู้ป่วยนี้มีการบันทึกผลตรวจของวันที่ {formatThaiDate(today)} ไปแล้ว
              โดย <span className="font-medium text-gray-700">{checkInfo?.inspector_name ?? '-'}</span>
              {checkInfo?.submitted_at && (
                <> เมื่อเวลา {new Date(checkInfo.submitted_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</>
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

      {/* ===== BOTTOM ACTION BAR ===== */}
      {tapeAnswer !== null && (
        <div className="fixed bottom-16 left-0 right-0 max-w-md mx-auto border-t border-gray-100 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          {tapeAnswer === 'yes' ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 flex-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>
                <span className="text-sm font-medium text-emerald-700">พร้อมใช้งาน</span>
              </div>
              <button
                onClick={() => handleSave()}
                disabled={saving || saved}
                className="flex items-center gap-2 bg-emerald-700 text-white px-5 py-2.5 rounded-xl
                           text-sm font-medium shadow-sm active:scale-95 transition-all
                           disabled:opacity-60 disabled:cursor-not-allowed"
              >
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
                {saved ? 'บันทึกแล้ว' : saving ? 'กำลังบันทึก...' : 'บันทึกผลประจำวัน'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-red-500"/>
                <span className="text-sm font-medium text-red-700">พบปัญหา — ต้องตรวจเช็คละเอียด</span>
              </div>
              <button
                onClick={() => handleSave()}
                disabled={saving || !tapeNote.trim()}
                className="w-full flex items-center justify-center gap-2 bg-red-600 text-white
                           px-4 py-3 rounded-xl text-sm font-medium shadow-sm active:scale-95
                           transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกและไปตรวจเช็คละเอียด →'}
              </button>
              {!tapeNote.trim() && (
                <p className="text-xs text-center text-red-400">กรุณากรอกหมายเหตุก่อนบันทึก</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== BOTTOM NAV ===== */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto flex bg-white border-t border-gray-100 z-40 h-16">
        {[
          { icon: '🏠', label: 'หน้าหลัก', href: '/', active: true },
          { icon: '📋', label: 'ตรวจเช็ค', href: '/check', active: false },
          { icon: '📄', label: 'สรุป', href: '/summary', active: false },
          { icon: '📊', label: 'แดชบอร์ด', href: '/dashboard', active: false },
        ].map(item => (
          <a key={item.href} href={item.href}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-sm border-t-2 transition-colors
              ${item.active
                ? 'border-emerald-700 text-emerald-700'
                : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            <span className="text-2xl leading-none">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>

    </div>
  )
}
