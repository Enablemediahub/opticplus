import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const COMMENT_STORAGE_KEY = 'opticplus:lens-orders-comments:v1'
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export default function LensOrdersSection(props) {
  const orders = props.lensOrdersData?.orders ?? []
  const summary = props.lensOrdersData?.summary ?? {}
  const branchName = props.lensOrdersData?.branch_name ?? 'Lens Orders'
  const companyName = props.companyName ?? 'OPTICPLUS'
  const technicianName = props.session?.name ?? 'Technician'
  const today = todayIso()
  const filters = props.lensOrdersFilters ?? {
    month: 'custom',
    date_from: today,
    date_to: today,
    search: '',
    pickup_status: 'all',
  }
  const [commentMap, setCommentMap] = useState(() => loadCommentMap())
  const [selectedOrderKeys, setSelectedOrderKeys] = useState([])
  const displayOrders = useMemo(() => groupOrdersForDisplay(orders), [orders])

  const selectedOrders = useMemo(
    () => displayOrders
      .map((order, index) => ({
        ...order,
        __orderKey: getOrderKey(order, index),
      }))
      .filter((order) => selectedOrderKeys.includes(order.__orderKey)),
    [displayOrders, selectedOrderKeys],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    window.localStorage.setItem(COMMENT_STORAGE_KEY, JSON.stringify(commentMap))
  }, [commentMap])

  const isTodayPreset = filters.date_from === today && filters.date_to === today
  const rangeLabel = useMemo(() => (isTodayPreset ? 'Today' : formatRangeLabel(filters.date_from, filters.date_to)), [filters.date_from, filters.date_to, isTodayPreset])

  function updateFilters(next) {
    props.setLensOrdersFilters((current) => ({
      ...current,
      ...next,
    }))
  }

  function applyPreset(preset) {
    if (preset === 'today') {
      updateFilters({
        month: 'custom',
        date_from: today,
        date_to: today,
      })
      return
    }

    if (preset === 'week') {
      const range = lastSevenDaysRange()
      updateFilters({
        month: 'custom',
        date_from: range.start_date,
        date_to: range.end_date,
      })
      return
    }

    if (preset === 'month') {
      const range = currentMonthRange()
      updateFilters({
        month: currentMonthKey(),
        date_from: range.start_date,
        date_to: range.end_date,
      })
      return
    }

    updateFilters({ month: 'custom' })
  }

  function handleDateChange(field, value) {
    updateFilters({
      [field]: value,
      month: 'custom',
    })
  }

  function handleBulkPickupStatus(action) {
    const pickupIds = selectedOrders
      .map((order, index) => getPickupOrderId(order, index))
      .filter(Boolean)

    if (!pickupIds.length) {
      props.setLensOrdersError?.('Select at least one lens order first.')
      return
    }

    props.updatePickupStatus?.(pickupIds, action)
  }

  function getOrderKey(order, index = 0) {
    const directKey = meaningfulKeyPart(order?.billing_id) || meaningfulKeyPart(order?.prescription_id) || meaningfulKeyPart(order?.form_id)
    if (directKey) {
      return directKey
    }

    return [
      'order',
      meaningfulKeyPart(order?.source) || 'legacy',
      meaningfulKeyPart(order?.patient_id) || meaningfulKeyPart(order?.id) || 'patient',
      meaningfulKeyPart(order?.folder_id) || 'folder',
      meaningfulKeyPart(order?.date) || meaningfulKeyPart(order?.order_date) || 'nodate',
      meaningfulKeyPart(order?.created_at) || meaningfulKeyPart(order?.latest_form_updated_at) || `row-${index}`,
    ].join('-')
  }

  function getPickupOrderId(order, index = 0) {
    return meaningfulKeyPart(order?.billing_id) || meaningfulKeyPart(order?.prescription_id) || meaningfulKeyPart(order?.form_id) || getOrderKey(order, index)
  }

  function updateComment(orderKey, value) {
    setCommentMap((current) => ({
      ...current,
      [orderKey]: value,
    }))
  }

  function toggleOrderSelection(orderKey) {
    setSelectedOrderKeys((current) => current.includes(orderKey)
      ? current.filter((key) => key !== orderKey)
      : [...current, orderKey])
  }

  function toggleAllOrders(checked) {
    setSelectedOrderKeys(checked ? displayOrders.map((order, index) => getOrderKey(order, index)) : [])
  }

  function getSelectedOrders() {
    if (!selectedOrders.length) {
      props.setLensOrdersError?.('Select at least one lens order before exporting.')
      return null
    }

    props.setLensOrdersError?.('')
    return selectedOrders
  }

  async function copyDraft() {
    const exportOrders = getSelectedOrders()
    if (!exportOrders) return

    try {
      const draft = buildWhatsAppDraft({
        companyName,
        branchName,
        rangeLabel,
        technicianName,
        orders: exportOrders,
        commentMap,
      })
      await navigator.clipboard.writeText(draft)
      props.setLensOrdersSuccess?.(`${exportOrders.length} selected lens order${exportOrders.length === 1 ? '' : 's'} copied as a WhatsApp draft.`)
    } catch {
      props.setLensOrdersError?.('Unable to copy the WhatsApp draft. Please copy the preview text manually.')
    }
  }

  function downloadPdf() {
    const exportOrders = getSelectedOrders()
    if (!exportOrders) return

    const reportWindow = window.open('', '_blank', 'width=1280,height=900')
    if (!reportWindow) {
      props.setLensOrdersError?.('Popup blocked. Allow popups to download the PDF preview.')
      return
    }

    reportWindow.document.open()
    reportWindow.document.write(buildPrintableHtml({
      companyName,
      branchName,
      rangeLabel,
      technicianName,
      orders: exportOrders,
      commentMap,
      generatedAt: new Date().toLocaleString(),
    }))
    reportWindow.document.close()
    reportWindow.focus()
    setTimeout(() => {
      reportWindow.print()
    }, 250)
  }

  return (
    <section className="finance-section lens-orders-section">
      <div className="patients-header lens-orders-hero">
        <div>
          <p className="eyebrow">Lens Orders</p>
          <h3>Today's prescriptions ready for production</h3>
          <p className="header-copy">
            The queue opens on the current day so the technician sees the optometrist's prescriptions first, with a built-in comment field for production notes.
          </p>
        </div>
        <div className="lens-orders-hero-chip-row">
          <span className="panel-tag">{companyName}</span>
          <span className="panel-tag">{branchName}</span>
          <span className="panel-tag">{rangeLabel}</span>
        </div>
      </div>

      {props.lensOrdersError ? <div className="message-banner error">{props.lensOrdersError}</div> : null}
      {props.lensOrdersSuccess ? <div className="message-banner success">{props.lensOrdersSuccess}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Total Orders" value={String(summary.total_orders ?? 0)} note="Prescription rows in the selected range" icon="receipt" className="total" />
        <StatWidget label="Ready" value={String(summary.ready_orders ?? 0)} note="Orders ready to send to the factory" icon="check-badge" className="seen" />
        <StatWidget label="Waiting" value={String(summary.pending_orders ?? 0)} note="Orders waiting on seen or completed status" icon="alert" className="pending" />
        <StatWidget label="Optometrists" value={String(summary.assigned_optometrists ?? 0)} note="Assigned staff linked to the orders" icon="support" className="today" />
      </section>

      <article className="panel lens-orders-panel">
        <div className="panel-heading lens-orders-panel-heading">
          <div>
            <p className="eyebrow">Queue Controls</p>
            <h3>{isTodayPreset ? "Today's prescription queue" : 'Prescription queue by date range'}</h3>
          </div>
          <span className="panel-tag">{orders.length} rows</span>
        </div>

        <div className="lens-orders-toolbar">
          <div className="lens-orders-preset-row">
            <button type="button" className={`lens-preset-pill${isTodayPreset ? ' is-active' : ''}`} onClick={() => applyPreset('today')}>
              Today
            </button>
            <button type="button" className={`lens-preset-pill${filters.date_from !== filters.date_to && isRecentWeekRange(filters.date_from, filters.date_to) ? ' is-active' : ''}`} onClick={() => applyPreset('week')}>
              Last 7 Days
            </button>
            <button type="button" className={`lens-preset-pill${filters.date_from === currentMonthRange().start_date && filters.date_to === currentMonthRange().end_date ? ' is-active' : ''}`} onClick={() => applyPreset('month')}>
              This Month
            </button>
            <button type="button" className={`lens-preset-pill${filters.month === 'custom' && !isTodayPreset && !isCurrentMonthRange(filters.date_from, filters.date_to) ? ' is-active' : ''}`} onClick={() => applyPreset('custom')}>
              Custom
            </button>
          </div>

          <div className="lens-orders-filter-grid">
            <label>
              Date from
              <input
                type="date"
                value={filters.date_from}
                onChange={(event) => handleDateChange('date_from', event.target.value)}
              />
            </label>

            <label>
              Date to
              <input
                type="date"
                value={filters.date_to}
                onChange={(event) => handleDateChange('date_to', event.target.value)}
              />
            </label>

            <label>
              Pickup status
              <select
                value={filters.pickup_status ?? 'all'}
                onChange={(event) => updateFilters({ pickup_status: event.target.value })}
              >
                <option value="all">All statuses</option>
                <option value="not_ready">Not ready</option>
                <option value="ready">Ready for pickup</option>
              </select>
            </label>

            <label className="lens-orders-search-field">
              Search
              <input
                value={filters.search}
                onChange={(event) => updateFilters({ search: event.target.value })}
                placeholder="Search by patient or prescription"
              />
            </label>
          </div>

          <div className="filter-actions-row full-span lens-orders-actions">
            <button type="button" className="primary-button" onClick={copyDraft}>
              Copy WhatsApp Draft
            </button>
            <button type="button" className="nav-item" onClick={downloadPdf}>
              Download PDF
            </button>
            <button
              type="button"
              className="nav-item"
              onClick={() => handleBulkPickupStatus('not-ready')}
              disabled={!selectedOrders.length}
            >
              Mark Not Ready
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => handleBulkPickupStatus('ready')}
              disabled={!selectedOrders.length}
            >
              Mark Ready for Pickup
            </button>
            <span className="patient-search-hint">
              {selectedOrders.length ? `${selectedOrders.length} selected` : 'Select rows to export'}
            </span>
          </div>
        </div>

        <div className="panel-heading lens-orders-panel-heading lens-orders-table-heading">
          <div>
            <p className="eyebrow">Lens Order Table</p>
            <h3>Prescriptions, production notes, and technician sign-off</h3>
          </div>
        </div>

        <div className="table-shell lens-orders-table-shell">
          <table className="portal-table lens-orders-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={displayOrders.length > 0 && selectedOrders.length === displayOrders.length}
                    onChange={(event) => toggleAllOrders(event.target.checked)}
                    aria-label="Select all lens orders"
                  />
                </th>
                <th>Name</th>
                <th>Prescription</th>
                <th>Comments</th>
                <th>Pickup readiness</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.length ? displayOrders.map((order, index) => {
                const orderKey = getOrderKey(order, index)
                const pickupStatus = order.pickup_status === 'ready' || order.pickup_status === 'notified'
                  ? 'ready'
                  : 'not_ready'
                const pickupOrderId = order.prescription_id ?? order.billing_id ?? order.form_id ?? orderKey
                return (
                  <tr key={orderKey}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedOrderKeys.includes(orderKey)}
                        onChange={() => toggleOrderSelection(orderKey)}
                        aria-label={`Select ${order.patient_name || 'lens order'}`}
                      />
                    </td>
                    <td>
                      <strong>{order.patient_name || 'Unknown patient'}</strong>
                      <div className="table-inline-meta">
                        {order.order_date || order.date ? formatDisplayDate(order.order_date || order.date) : 'Date not available'}
                      </div>
                    </td>
                    <td>
                      <div className="lens-order-prescription">
                        <strong>{getPrescriptionTitle(order)}</strong>
                        <span>
                          {getPrescriptionSummary(order)
                            || (order.source === 'exam_form'
                              ? 'The examination form was saved without spectacle prescription values.'
                              : 'The prescription record exists, but no lens values were recorded.')}
                        </span>
                      </div>
                    </td>
                    <td>
                      <textarea
                        className="lens-order-comment-input"
                        value={commentMap[orderKey] ?? ''}
                        onChange={(event) => updateComment(orderKey, event.target.value)}
                        placeholder="Add fabrication notes, lens checks, or follow-up comments..."
                        rows={4}
                      />
                    </td>
                    <td>
                      <select
                        value={pickupStatus}
                        onChange={(event) => props.updatePickupStatus?.(pickupOrderId, event.target.value === 'ready' ? 'ready' : 'not-ready')}
                        disabled={props.pickupBusyIds?.includes(pickupOrderId) || order.pickup_status === 'picked_up'}
                      >
                        <option value="not_ready">Not ready</option>
                        <option value="ready">Ready for pickup</option>
                      </select>
                      {order.pickup_status === 'picked_up' ? <div className="table-inline-meta">Picked up</div> : null}
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan="5">
                    <div className="empty-state">
                      <h4>No lens orders in this period</h4>
                      <p>When the optometrist saves a prescription for the day, the technician queue will populate here automatically.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="lens-orders-signoff">
          <div className="lens-signoff-block">
            <span>Technician Name</span>
            <strong>{technicianName}</strong>
          </div>
          <div className="lens-signoff-block">
            <span>Signature</span>
            <div className="lens-signature-line" aria-hidden="true" />
          </div>
        </div>
      </article>
    </section>
  )
}

function groupOrdersForDisplay(orders) {
  const grouped = new Map()
  const orderKeys = []

  orders.forEach((order, index) => {
    const patientKey = normalizePatientName(order?.patient_name) || `__order_${index}`
    if (!grouped.has(patientKey)) {
      grouped.set(patientKey, [])
      orderKeys.push(patientKey)
    }

    grouped.get(patientKey).push(order)
  })

  return orderKeys.flatMap((patientKey) => grouped.get(patientKey) ?? [])
}

function normalizePatientName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function getPrescriptionTitle(order) {
  if (cleanDraftLine(order?.lens_type ?? '')) {
    return order.lens_type
  }

  if (hasPrescriptionValues(order)) {
    return 'Recorded prescription values'
  }

  return 'Lens type not set'
}

function getPrescriptionSummary(order) {
  const summary = cleanDraftLine(order?.prescription_summary ?? '')
  if (summary) {
    return summary
  }

  const odSphere = cleanDraftLine(order?.sph_od ?? '') || 'Plano'
  const odCylinder = cleanDraftLine(order?.cyl_od ?? '') || '0.00'
  const odAxis = cleanDraftLine(order?.axis_od ?? '') || '-'
  const osSphere = cleanDraftLine(order?.sph_os ?? '') || 'Plano'
  const osCylinder = cleanDraftLine(order?.cyl_os ?? '') || '0.00'
  const osAxis = cleanDraftLine(order?.axis_os ?? '') || '-'
  const addOd = cleanDraftLine(order?.add_od ?? '') || '-'
  const addOs = cleanDraftLine(order?.add_os ?? '') || '-'
  const ipd = cleanDraftLine(order?.ipd ?? '') || 'N/A'

  const lines = [
    `OD: ${odSphere} / ${odCylinder} x ${odAxis}`,
    `OS: ${osSphere} / ${osCylinder} x ${osAxis}`,
    `ADD: ${addOd} / ${addOs}`,
    `IPD: ${ipd}`,
  ]

  if (cleanDraftLine(order?.lens_type ?? '')) {
    lines.unshift(`Lens: ${order.lens_type}`)
  }

  if (cleanDraftLine(order?.lens_material ?? '')) {
    lines.push(`Material: ${order.lens_material}`)
  }

  if (cleanDraftLine(order?.color ?? '')) {
    lines.push(`Color: ${order.color}`)
  }

  if (cleanDraftLine(order?.notes ?? '')) {
    lines.push(`Notes: ${order.notes}`)
  }

  return lines.join(' | ')
}

function hasPrescriptionValues(order) {
  return [
    order?.sph_od,
    order?.cyl_od,
    order?.axis_od,
    order?.add_od,
    order?.sph_os,
    order?.cyl_os,
    order?.axis_os,
    order?.add_os,
    order?.lens_type,
    order?.prescription_summary,
  ].some((value) => cleanDraftLine(value ?? '') !== '')
}

function loadCommentMap() {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(COMMENT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function buildWhatsAppDraft({ companyName, branchName, rangeLabel, technicianName, orders, commentMap }) {
  const header = [
    companyName,
    `Branch: ${branchName}`,
    `Range: ${rangeLabel}`,
    `Technician Name: ${technicianName}`,
    '',
  ]

  const lines = orders.length
    ? orders.map((order, index) => {
      const key = order.__orderKey ?? getOrderKey(order, index)
      const patient = order.patient_name || 'Unknown patient'
      const prescription = order.prescription_summary || 'Prescription details unavailable'
      const comments = cleanDraftLine(commentMap[key] ?? '')

      return [
        `${index + 1}. Name: ${patient}`,
        `Prescription: ${cleanDraftLine(prescription)}`,
        `Comments: ${comments || 'No comments added'}`,
        '',
      ].join('\n')
    })
    : ['No lens orders found for this period.', '']

  return [...header, ...lines, `Technician Name: ${technicianName}`, 'Signature: __________________', '', 'Prepared from OpticPlus technician lens orders.'].join('\n')
}

function buildPrintableHtml({ companyName, branchName, rangeLabel, technicianName, orders, commentMap, generatedAt }) {
  const rows = orders.map((order, index) => {
    const key = order.__orderKey ?? getOrderKey(order, index)
    return `
      <tr>
        <td>${escapeHtml(order.patient_name || 'Unknown patient')}</td>
        <td>${escapeHtml(order.prescription_summary || 'Prescription details unavailable')}</td>
        <td>${escapeHtml(commentMap[key] ?? '') || '&nbsp;'}</td>
      </tr>
    `
  }).join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Lens Orders - ${escapeHtml(companyName)}</title>
        <style>
          :root { color-scheme: light; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #eef2f7;
            color: #111827;
            font-family: "Segoe UI", Arial, sans-serif;
          }
          .page {
            min-height: 100vh;
            padding: 28px 18px 36px;
          }
          .sheet {
            background: #fff;
            border: 1px solid #d1d5db;
            box-shadow: 0 20px 45px rgba(15, 23, 42, 0.14);
            padding: 22px 22px 20px;
          }
          .brand {
            display: grid;
            gap: 6px;
            text-align: center;
            padding-bottom: 14px;
            border-bottom: 1px dashed #cbd5e1;
            margin-bottom: 16px;
          }
          .brand h1 {
            margin: 0;
            font-size: 24px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .brand p {
            margin: 0;
            font-size: 12px;
            color: #374151;
          }
          .meta {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
            margin-bottom: 14px;
            font-size: 12px;
            color: #4b5563;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #d1d5db;
            padding: 10px 10px;
            text-align: left;
            vertical-align: top;
            font-size: 12px;
          }
          th {
            background: #f8fafc;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            font-size: 11px;
          }
          .no-data {
            text-align: center;
            padding: 22px;
            color: #6b7280;
          }
          .signoff {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 18px;
            margin-top: 22px;
            align-items: end;
          }
          .signoff-block {
            display: grid;
            gap: 8px;
          }
          .signoff-block span {
            font-size: 12px;
            color: #4b5563;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }
          .signoff-block strong {
            font-size: 15px;
            color: #111827;
          }
          .signature-line {
            border-bottom: 1px solid #111827;
            height: 24px;
            width: 100%;
          }
          .footer {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-top: 18px;
            padding-top: 12px;
            border-top: 1px dashed #cbd5e1;
            font-size: 11px;
            color: #4b5563;
            flex-wrap: wrap;
          }
          @media print {
            body { background: #fff; }
            .page { padding: 0; }
            .sheet { border: none; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <section class="sheet">
            <header class="brand">
              <h1>${escapeHtml(companyName)}</h1>
              <p>Lens Orders</p>
              <p>${escapeHtml(branchName)} | ${escapeHtml(rangeLabel)}</p>
            </header>

            <div class="meta">
              <span>Technician Name: ${escapeHtml(technicianName)}</span>
              <span>Generated: ${escapeHtml(generatedAt)}</span>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prescription</th>
                  <th>Comments</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td class="no-data" colspan="3">No orders found for this period.</td></tr>'}
              </tbody>
            </table>

            <div class="signoff">
              <div class="signoff-block">
                <span>Technician Name</span>
                <strong>${escapeHtml(technicianName)}</strong>
              </div>
              <div class="signoff-block">
                <span>Signature</span>
                <div class="signature-line"></div>
              </div>
            </div>

            <div class="footer">
              <span>Prepared from the OpticPlus technician lens orders queue.</span>
              <span>Company: ${escapeHtml(companyName)}</span>
            </div>
          </section>
        </div>
      </body>
    </html>
  `
}

function getOrderKey(order, index = 0) {
  const directKey = meaningfulKeyPart(order?.billing_id) || meaningfulKeyPart(order?.prescription_id) || meaningfulKeyPart(order?.form_id)
  if (directKey) {
    return directKey
  }

  return [
    'order',
    meaningfulKeyPart(order?.source) || 'legacy',
    meaningfulKeyPart(order?.patient_id) || meaningfulKeyPart(order?.id) || 'patient',
    meaningfulKeyPart(order?.folder_id) || 'folder',
    meaningfulKeyPart(order?.date) || meaningfulKeyPart(order?.order_date) || 'nodate',
    meaningfulKeyPart(order?.created_at) || meaningfulKeyPart(order?.latest_form_updated_at) || `row-${index}`,
  ].join('-')
}

function meaningfulKeyPart(value) {
  if (value === null || value === undefined) return ''
  const stringValue = String(value).trim()
  return stringValue && stringValue !== '0' ? stringValue : ''
}

function cleanDraftLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function formatRangeLabel(dateFrom, dateTo) {
  if (!dateFrom && !dateTo) {
    return 'Selected range'
  }

  if (dateFrom && dateTo && dateFrom === dateTo) {
    return formatDisplayDate(dateFrom)
  }

  return `${dateFrom || 'N/A'} to ${dateTo || 'N/A'}`
}

function formatDisplayDate(value) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return value || 'N/A'
  }

  return dateFormatter.format(date)
}

function isRecentWeekRange(dateFrom, dateTo) {
  const expected = lastSevenDaysRange()
  return dateFrom === expected.start_date && dateTo === expected.end_date
}

function isCurrentMonthRange(dateFrom, dateTo) {
  const expected = currentMonthRange()
  return dateFrom === expected.start_date && dateTo === expected.end_date
}

function lastSevenDaysRange() {
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() - 6)

  return {
    start_date: todayIso(start),
    end_date: todayIso(today),
  }
}

function currentMonthRange() {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  return {
    start_date: todayIso(start),
    end_date: todayIso(end),
  }
}

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function todayIso(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
