import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const monthFormatter = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' })

export default function LensOrdersSection(props) {
  const orders = props.lensOrdersData?.orders ?? []
  const summary = props.lensOrdersData?.summary ?? {}
  const filters = props.lensOrdersFilters ?? {
    month: currentMonthKey(),
    date_from: currentMonthRange().start_date,
    date_to: currentMonthRange().end_date,
    search: '',
  }
  const [factoryPhone, setFactoryPhone] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('opticplus-lens-factory-phone') ?? ''
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('opticplus-lens-factory-phone', factoryPhone)
  }, [factoryPhone])

  const monthOptions = useMemo(() => buildMonthOptions(), [])
  const monthLabel = filters.month === 'custom'
    ? 'Custom range'
    : formatMonthLabel(filters.month) || 'Selected month'

  const whatsappDraft = useMemo(() => buildWhatsAppDraft({
    orders,
    branchName: props.lensOrdersData?.branch_name ?? 'Lens Orders',
    monthLabel,
    dateFrom: filters.date_from,
    dateTo: filters.date_to,
  }), [filters.date_from, filters.date_to, monthLabel, orders, props.lensOrdersData?.branch_name])

  function updateFilters(next) {
    props.setLensOrdersFilters((current) => ({
      ...current,
      ...next,
    }))
  }

  function handleMonthChange(monthKey) {
    if (monthKey === 'custom') {
      updateFilters({ month: 'custom' })
      return
    }

    const range = currentMonthRange(monthKey)
    updateFilters({
      month: monthKey,
      date_from: range.start_date,
      date_to: range.end_date,
    })
  }

  function handleDateChange(field, value) {
    updateFilters({
      [field]: value,
      month: 'custom',
    })
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(whatsappDraft)
      props.setLensOrdersSuccess?.('WhatsApp draft copied. Paste it into the factory chat and attach the PDF.')
    } catch {
      props.setLensOrdersError?.('Unable to copy the WhatsApp draft. Please copy the preview text manually.')
    }
  }

  function openWhatsApp() {
    const phone = normalizePhone(factoryPhone)
    if (!phone) {
      props.setLensOrdersError?.('Add the factory WhatsApp number first, or use Copy Draft.')
      return
    }

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappDraft)}`, '_blank', 'noopener,noreferrer')
  }

  function downloadPdf() {
    const reportWindow = window.open('', '_blank', 'width=1280,height=900')
    if (!reportWindow) {
      props.setLensOrdersError?.('Popup blocked. Allow popups to download the PDF preview.')
      return
    }

    reportWindow.document.open()
    reportWindow.document.write(buildPrintableHtml({
      branchName: props.lensOrdersData?.branch_name ?? 'Lens Orders',
      filters,
      monthLabel,
      summary,
      orders,
      generatedAt: new Date().toLocaleString(),
    }))
    reportWindow.document.close()
    reportWindow.focus()
    setTimeout(() => {
      reportWindow.print()
    }, 250)
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Lens Orders</p>
          <h3>Prepare prescriptions for the lens factory</h3>
          <p className="header-copy">
            This queue auto-populates from optometrist prescriptions and can be filtered live by month or by date range.
          </p>
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

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Order Filters</p>
            <h3>Month selection and date range</h3>
          </div>
          <span className="panel-tag">{props.lensOrdersData?.branch_name ?? 'Lens Orders'}</span>
        </div>

        <div
          className="lens-orders-filter-stack"
          style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr' }}
        >
          <label>
            Month
            <select value={filters.month} onChange={(event) => handleMonthChange(event.target.value)}>
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value="custom">Custom range</option>
            </select>
          </label>

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
            Search
            <input
              value={filters.search}
              onChange={(event) => updateFilters({ search: event.target.value })}
              placeholder="Filter by patient, folder, or optometrist"
            />
          </label>

          <label>
            Factory WhatsApp
            <input
              value={factoryPhone}
              onChange={(event) => setFactoryPhone(event.target.value)}
              placeholder="233XXXXXXXXX"
            />
          </label>

          <div className="filter-actions-row full-span">
            <button type="button" className="primary-button" onClick={copyDraft}>
              Copy WhatsApp Draft
            </button>
            <button type="button" className="nav-item" onClick={openWhatsApp}>
              Open WhatsApp
            </button>
            <button type="button" className="nav-item" onClick={downloadPdf}>
              Download PDF
            </button>
          </div>
        </div>

        <div className="panel-heading" style={{ marginTop: '1.25rem' }}>
          <div>
            <p className="eyebrow">Lens Order Table</p>
            <h3>Prescriptions ready for production</h3>
          </div>
          <span className="panel-tag">{orders.length} rows</span>
        </div>

        <div className="table-shell">
          <table className="portal-table inventory-table-wide">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Folder</th>
                <th>Staff ID</th>
                <th>Optometrist</th>
                <th>Date</th>
                <th>Status</th>
                <th>Prescription</th>
              </tr>
            </thead>
            <tbody>
              {orders.length ? orders.map((order) => (
                <tr key={String(order.prescription_id ?? `${order.folder_id}-${order.order_date}`)}>
                  <td>
                    <strong>{order.patient_name || 'Unknown patient'}</strong>
                    <div className="table-inline-meta">{order.ready_for_order ? 'Ready for factory' : 'Waiting for review'}</div>
                  </td>
                  <td>{order.folder_id || 'N/A'}</td>
                  <td>{order.assigned_optometrist_id ?? 'N/A'}</td>
                  <td>{order.assigned_optometrist_name || 'Unassigned'}</td>
                  <td>{order.order_date || order.date || 'N/A'}</td>
                  <td>
                    <strong>{order.ready_for_order ? 'Ready' : 'Pending'}</strong>
                    <div className="table-inline-meta">{order.status || order.patient_status || 'No order status'}</div>
                  </td>
                  <td>
                    <div className="stack-meta">
                      <strong>{order.lens_type || 'Lens pending'}</strong>
                      <span>{order.prescription_summary || 'Prescription details unavailable'}</span>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7">
                    <div className="empty-state">
                      <h4>No lens orders in this period</h4>
                      <p>When the optometrist saves a prescription and marks the patient as seen, the order queue will populate here automatically.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '')
}

function buildMonthOptions() {
  const options = []
  const anchor = new Date()

  for (let index = 0; index < 12; index += 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - index, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    options.push({
      value,
      label: monthFormatter.format(date),
    })
  }

  return options
}

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function currentMonthRange(monthKey = currentMonthKey()) {
  const [year, month] = String(monthKey).split('-').map((value) => Number(value))
  const validYear = Number.isFinite(year) ? year : new Date().getFullYear()
  const validMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : new Date().getMonth() + 1
  const start = new Date(validYear, validMonth - 1, 1)
  const end = new Date(validYear, validMonth, 0)

  return {
    start_date: toIsoDate(start),
    end_date: toIsoDate(end),
  }
}

function formatMonthLabel(monthKey) {
  if (!monthKey || monthKey === 'custom') return ''
  const [year, month] = String(monthKey).split('-').map((value) => Number(value))
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return ''
  return monthFormatter.format(new Date(year, month - 1, 1))
}

function toIsoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildWhatsAppDraft({ orders, branchName, monthLabel, dateFrom, dateTo }) {
  const header = [
    `Lens orders for ${branchName}`,
    `Month: ${monthLabel}`,
    dateFrom && dateTo ? `Range: ${dateFrom} to ${dateTo}` : null,
    '',
  ].filter(Boolean)

  const lines = orders.map((order, index) => {
    const patient = order.patient_name || 'Unknown patient'
    const folder = order.folder_id || 'N/A'
    const staff = order.assigned_optometrist_id ?? 'N/A'
    const optometrist = order.assigned_optometrist_name || 'Unassigned'
    const prescription = order.prescription_summary || 'Prescription details unavailable'
    return `${index + 1}. ${patient} | Folder ${folder} | Staff ${staff} | ${optometrist} | ${prescription}`
  })

  return [...header, ...lines, '', 'Prepared from OpticPlus technician lens orders.'].join('\n')
}

function buildPrintableHtml({ branchName, filters, monthLabel, summary, orders, generatedAt }) {
  const rows = orders.map((order, index) => `
    <tr>
      <td>${escapeHtml(String(index + 1))}</td>
      <td>${escapeHtml(order.patient_name || 'Unknown patient')}</td>
      <td>${escapeHtml(order.folder_id || 'N/A')}</td>
      <td>${escapeHtml(String(order.assigned_optometrist_id ?? 'N/A'))}</td>
      <td>${escapeHtml(order.assigned_optometrist_name || 'Unassigned')}</td>
      <td>${escapeHtml(order.order_date || order.date || 'N/A')}</td>
      <td>${escapeHtml(order.ready_for_order ? 'Ready' : 'Pending')}</td>
      <td>${escapeHtml(order.prescription_summary || 'Prescription details unavailable')}</td>
    </tr>
  `).join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Lens Orders - ${escapeHtml(branchName)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          h1, h2, p { margin: 0 0 10px; }
          .meta { margin-bottom: 18px; font-size: 12px; color: #4b5563; }
          .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
          .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
          .card span { display: block; font-size: 12px; color: #6b7280; }
          .card strong { display: block; font-size: 20px; margin-top: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 18px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; font-size: 11px; }
          th { background: #f3f4f6; }
        </style>
      </head>
      <body>
        <h1>Lens Orders</h1>
        <p class="meta">${escapeHtml(branchName)} | ${escapeHtml(monthLabel)} | Generated ${escapeHtml(generatedAt)}</p>
        <p class="meta">Range: ${escapeHtml(filters.date_from || '')} to ${escapeHtml(filters.date_to || '')}</p>
        <div class="summary">
          <div class="card"><span>Total</span><strong>${escapeHtml(String(summary.total_orders ?? 0))}</strong></div>
          <div class="card"><span>Ready</span><strong>${escapeHtml(String(summary.ready_orders ?? 0))}</strong></div>
          <div class="card"><span>Waiting</span><strong>${escapeHtml(String(summary.pending_orders ?? 0))}</strong></div>
          <div class="card"><span>Optometrists</span><strong>${escapeHtml(String(summary.assigned_optometrists ?? 0))}</strong></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Patient</th>
              <th>Folder</th>
              <th>Staff ID</th>
              <th>Optometrist</th>
              <th>Date</th>
              <th>Status</th>
              <th>Prescription</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="8">No orders found.</td></tr>'}
          </tbody>
        </table>
      </body>
    </html>
  `
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
