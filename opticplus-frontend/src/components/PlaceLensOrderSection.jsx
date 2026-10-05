import { useEffect, useMemo, useState } from 'react'
import PortalIcon from './PortalIcon.jsx'

const storageKey = 'opticplus:place-lens-order:v1'

function normalizeValue(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function buildPrescriptionKey(record) {
  const patientId = normalizeValue(record?.patient_id ?? record?.id)
  const folderId = normalizeValue(record?.folder_id)
  const date = normalizeValue(record?.date ?? record?.updated_at)?.slice(0, 10)
  const source = normalizeValue(record?.source)
  return [source || 'prescription', folderId || patientId || 'unknown', date || 'nodate'].join('-')
}

function buildSourceId(record) {
  if (record?.prescription_id !== undefined && record?.prescription_id !== null && String(record.prescription_id) !== '0') {
    return String(record.prescription_id)
  }

  return [record?.patient_id ?? record?.id ?? '', record?.folder_id ?? '', record?.date ?? record?.updated_at ?? ''].join(':')
}

function buildSummary(record) {
  const lines = []
  const od = [record?.sph_od, record?.cyl_od, record?.axis_od ? `x ${record.axis_od}` : '', record?.add_od ? `ADD ${record.add_od}` : ''].filter(Boolean)
  const os = [record?.sph_os, record?.cyl_os, record?.axis_os ? `x ${record.axis_os}` : '', record?.add_os ? `ADD ${record.add_os}` : ''].filter(Boolean)

  if (od.length) lines.push(`OD: ${od.join(' ')}`)
  if (os.length) lines.push(`OS: ${os.join(' ')}`)
  if (record?.ipd) lines.push(`IPD: ${record.ipd}`)
  if (record?.lens_type) lines.push(`Lens: ${record.lens_type}`)
  if (record?.notes) lines.push(`Notes: ${record.notes}`)

  return lines.join(' | ') || 'Prescription details not available'
}

function findPatientLabel(record) {
  const directName = normalizeValue(record?.name)
  if (directName) return directName

  const parts = [record?.surname, record?.firstname, record?.othernames].map(normalizeValue).filter(Boolean)
  return parts.length ? parts.join(' ') : 'Unknown patient'
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

function defaultTodayRange() {
  const today = new Date()
  return { start: isoDate(today), end: isoDate(today) }
}

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return { start: isoDate(start), end: isoDate(end) }
}

function lastSevenDaysRange(date = new Date()) {
  const end = new Date(date)
  const start = new Date(date)
  start.setDate(start.getDate() - 6)
  return { start: isoDate(start), end: isoDate(end) }
}

export default function PlaceLensOrderSection({ fetchGlassesPrescriptions, placeLensOrder, overturnLensOrder, canOverturn = false, session, placedOrders = [], setPlacedOrders }) {
  const initialRange = defaultTodayRange()
  const [records, setRecords] = useState([])
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(initialRange.start)
  const [dateTo, setDateTo] = useState(initialRange.end)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const today = new Date()
  const todayIso = isoDate(today)

  function applyPreset(preset) {
    if (preset === 'today') {
      setDateFrom(todayIso)
      setDateTo(todayIso)
      return
    }

    if (preset === 'week') {
      const range = lastSevenDaysRange()
      setDateFrom(range.start)
      setDateTo(range.end)
      return
    }

    if (preset === 'month') {
      const range = monthRange()
      setDateFrom(range.start)
      setDateTo(range.end)
      return
    }

    setDateFrom('')
    setDateTo('')
  }

  function resetFilters() {
    setSearch('')
    setDateFrom(initialRange.start)
    setDateTo(initialRange.end)
  }

  useEffect(() => {
    let cancelled = false

    async function loadPrescriptions() {
      setIsLoading(true)
      setError('')

      try {
        const response = await fetchGlassesPrescriptions({ search, page: 1, perPage: 50, dateFrom, dateTo })
        if (!cancelled) {
          const nextRecords = response?.prescriptions ?? []
          setRecords(nextRecords)
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || 'Unable to load optometrist prescriptions.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    const timer = window.setTimeout(loadPrescriptions, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [dateFrom, dateTo, fetchGlassesPrescriptions, search])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, JSON.stringify(placedOrders))
    }
  }, [placedOrders])

  const placedOrderKeys = useMemo(
    () => new Set((placedOrders ?? []).map((item) => String(item.order_key || item.id || item.key || buildPrescriptionKey(item)))),
    [placedOrders],
  )

  async function handlePlaceOrder(record) {
    const key = buildPrescriptionKey(record)
    const source = record?.source === 'exam_form' ? 'exam_form' : 'legacy'
    const sourceId = buildSourceId(record)

    if (sourceId === '::') {
      setError('This prescription has no order reference and cannot be placed.')
      return
    }

    try {
      await placeLensOrder({ source, source_id: String(sourceId) })
    } catch (placeError) {
      setError(placeError?.message || 'Unable to place this lens order.')
      return
    }

    const patientName = findPatientLabel(record)
    const payload = {
      order_key: key,
      id: key,
      patient_id: record?.patient_id ?? record?.id ?? null,
      folder_id: record?.folder_id ?? 'N/A',
      patient_name: patientName,
      order_date: record?.date ?? new Date().toISOString().slice(0, 10),
      date: record?.date ?? new Date().toISOString().slice(0, 10),
      prescription_summary: buildSummary(record),
      pickup_status: 'pending',
      ready_for_order: true,
      status: record?.status ?? 'pending',
      source: 'reception_queue',
      assigned_optometrist_name: record?.assigned_optometrist_name ?? session?.name ?? 'Optometrist',
      placed_by: session?.name ?? 'Receptionist',
      created_at: new Date().toISOString(),
      source_id: sourceId,
    }

    setPlacedOrders((current = []) => {
      const existing = current.some((item) => String(item.order_key || item.id || item.key) === key)
      if (existing) return current
      return [payload, ...current]
    })
    setRecords((current) => current.map((item) => (
      buildPrescriptionKey(item) === key ? { ...item, order_placed: true } : item
    )))
  }

  async function handleOverturnOrder(record) {
    const source = record?.source === 'exam_form' ? 'exam_form' : 'legacy'
    const sourceId = buildSourceId(record)

    try {
      await overturnLensOrder({ source, source_id: String(sourceId) })
      const key = buildPrescriptionKey(record)
      setPlacedOrders((current = []) => current.filter((item) => String(item.order_key || item.id || item.key) !== key))
      setRecords((current) => current.map((item) => (
        buildPrescriptionKey(item) === key ? { ...item, order_placed: false } : item
      )))
    } catch (overturnError) {
      setError(overturnError?.message || 'Unable to overturn this lens order.')
    }
  }

  return (
    <section className="module-section">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Front Desk</p>
          <h3>Place Lens Order</h3>
          <p className="header-copy">
            Review the latest optometrist prescriptions and queue the ones ready for technician processing.
          </p>
        </div>
      </div>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Prescription queue</p>
            <h3>Ready for technician handoff</h3>
          </div>
          <span className="panel-tag">{records.length} records</span>
        </div>

        <div className="filter-actions-row" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div className="lens-orders-preset-row" style={{ flexWrap: 'wrap', marginRight: 'auto' }}>
            <button type="button" className={`lens-preset-pill${dateFrom === todayIso && dateTo === todayIso ? ' is-active' : ''}`} onClick={() => applyPreset('today')}>
              Today
            </button>
            <button type="button" className={`lens-preset-pill${dateFrom && dateTo && dateFrom === lastSevenDaysRange().start && dateTo === lastSevenDaysRange().end ? ' is-active' : ''}`} onClick={() => applyPreset('week')}>
              Last 7 Days
            </button>
            <button type="button" className={`lens-preset-pill${dateFrom && dateTo && dateFrom === monthRange().start && dateTo === monthRange().end ? ' is-active' : ''}`} onClick={() => applyPreset('month')}>
              This Month
            </button>
            <button type="button" className={`lens-preset-pill${!dateFrom && !dateTo ? ' is-active' : ''}`} onClick={() => applyPreset('all')}>
              All Dates
            </button>
          </div>

          <button type="button" className="ghost-button" onClick={resetFilters}>
            Reset
          </button>
        </div>

        <div className="filter-actions-row" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <label className="compact-field">
            <span>From</span>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label className="compact-field">
            <span>To</span>
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
        </div>

        <label className="patient-search-shell" style={{ marginBottom: '1rem' }}>
          <span className="patient-search-icon" aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by patient, folder ID, or lens type"
          />
        </label>

        {error ? <p className="muted-copy" style={{ color: '#b91c1c' }}>{error}</p> : null}

        {isLoading ? (
          <p className="muted-copy">Loading optometrist prescriptions...</p>
        ) : records.length === 0 ? (
          <div className="empty-state-panel">
            <PortalIcon name="glasses" className="module-icon" />
            <h3>No prescriptions ready</h3>
            <p className="muted-copy">The optometrist queue is empty for the current search.</p>
          </div>
        ) : (
          <div className="table-shell">
            <table className="portal-table inventory-table-wide">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Folder ID</th>
                  <th>Prescription</th>
                  <th>Lens Type</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => {
                  const key = buildPrescriptionKey(record)
                  const isPlaced = Object.prototype.hasOwnProperty.call(record, 'order_placed')
                    ? Boolean(record.order_placed)
                    : placedOrderKeys.has(key)

                  return (
                    <tr key={`${key}-${index}`}>
                      <td>{record?.date || '—'}</td>
                      <td><strong>{findPatientLabel(record)}</strong></td>
                      <td>{record?.folder_id || '—'}</td>
                      <td>{buildSummary(record)}</td>
                      <td>{record?.lens_type || '—'}</td>
                      <td>
                        <span className={`status-pill ${isPlaced ? 'status-completed' : 'status-pending'}`}>
                          {isPlaced ? 'Order Placed' : 'Not Placed'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={isPlaced ? 'mini-action success' : 'primary-button'}
                          onClick={() => isPlaced && canOverturn ? handleOverturnOrder(record) : handlePlaceOrder(record)}
                          disabled={isPlaced && !canOverturn}
                        >
                          {isPlaced ? (canOverturn ? 'Overturn Order' : 'Order Placed') : 'Place Order'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

    </section>
  )
}
