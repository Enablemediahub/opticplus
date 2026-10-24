import { useEffect, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 })
const branchOptions = [{ id: 0, name: 'Merged company' }, { id: 1, name: 'Labadi' }, { id: 2, name: 'Madina' }]

const value = (number) => Number(number || 0)
const total = (values) => values.reduce((sum, item) => sum + value(item), 0)
const money = (number) => currency.format(value(number))
const localDateIso = (date = new Date()) => {
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function extractionPeriodRange(period, today = localDateIso()) {
  const [year, month, day] = today.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const end = localDateIso(date)
  if (period === 'daily') return { from: end, to: end }
  if (period === 'weekly') {
    const mondayOffset = (date.getDay() + 6) % 7
    date.setDate(date.getDate() - mondayOffset)
    return { from: localDateIso(date), to: end }
  }
  date.setDate(1)
  return { from: localDateIso(date), to: end }
}
const excelBorder = '<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7F7F7F"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7F7F7F"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7F7F7F"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7F7F7F"/></Borders>'
const excelStyles = `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="sText">
      ${excelBorder}
      <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
    </Style>
    <Style ss:ID="sNumber">
      ${excelBorder}
      <Alignment ss:Vertical="Center" ss:Horizontal="Right"/>
    </Style>
    <Style ss:ID="sHeader">
      ${excelBorder}
      <Font ss:Bold="1"/>
      <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
      <Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="sSection">
      ${excelBorder}
      <Font ss:Bold="1"/>
      <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
      <Interior ss:Color="#FFE699" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="sTotal">
      ${excelBorder}
      <Font ss:Bold="1"/>
      <Alignment ss:Vertical="Center" ss:Horizontal="Right"/>
      <Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="sTotalLabel">
      ${excelBorder}
      <Font ss:Bold="1"/>
      <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
      <Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/>
    </Style>
  </Styles>`

function excelType(cell) {
  return typeof cell === 'number' && Number.isFinite(cell) ? 'Number' : 'String'
}

function excelStyle(cell, kind, index) {
  if (kind === 'section') return 'sSection'
  if (kind === 'header') return 'sHeader'
  if (kind === 'total') return index === 0 ? 'sTotalLabel' : 'sTotal'
  return typeof cell === 'number' && Number.isFinite(cell) ? 'sNumber' : 'sText'
}

function excelCell(cell, kind, index) {
  const valueCell = cell ?? ''
  return `<Cell ss:StyleID="${excelStyle(valueCell, kind, index)}"><Data ss:Type="${excelType(valueCell)}">${xml(valueCell)}</Data></Cell>`
}

function excelRow(cells, kind = 'data') {
  return `<Row>${cells.map((cell, index) => excelCell(cell, kind, index)).join('')}</Row>`
}

function saveFile(contents, name, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function xml(valueToEscape) {
  return String(valueToEscape ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function workbookXml(report) {
  const data = report || {}
  const extractionRows = data.daily_extraction || []
  const extractionTotal = (key) => total(extractionRows.map((row) => row[key]))
  const rows = [
    ['DAILY CAPITAL EXTRACTION', `${data.branch_name || 'Branch'}`],
    ['DATE', 'LENS SALES', 'LENS COST TO SET ASIDE', 'LENS PROFIT', 'LENS COSTS MISSING', 'FRAMES SOLD', 'FRAME SALES', 'FRAME COST TO SET ASIDE', 'FRAME PROFIT', 'FRAME COSTS MISSING', 'TOTAL COST TO SET ASIDE', 'GROSS PROFIT TO BANK'],
    ...extractionRows.map((row) => [
      row.date, value(row.lens_sales), value(row.lens_cost), value(row.lens_profit), value(row.lens_missing_cost_count),
      value(row.frames_sold_count), value(row.frame_sales), value(row.frame_cost), value(row.frame_profit),
      value(row.frame_missing_cost_count), value(row.total_cost_to_set_aside), value(row.gross_profit_to_bank),
    ]),
    ['TOTAL', extractionTotal('lens_sales'), extractionTotal('lens_cost'), extractionTotal('lens_profit'), extractionTotal('lens_missing_cost_count'),
      extractionTotal('frames_sold_count'), extractionTotal('frame_sales'), extractionTotal('frame_cost'), extractionTotal('frame_profit'),
      extractionTotal('frame_missing_cost_count'), extractionTotal('total_cost_to_set_aside'), extractionTotal('gross_profit_to_bank')],
  ]
  const worksheet = `<Worksheet ss:Name="Daily Extraction"><Table>${rows.map((row) => {
    const kind = row[0] === 'DAILY CAPITAL EXTRACTION' ? 'section'
      : row[0] === 'DATE' ? 'header'
        : row[0] === 'TOTAL' ? 'total'
          : 'data'
    return excelRow(row, kind)
  }).join('')}</Table></Worksheet>`
  return `${excelStyles}${worksheet}</Workbook>`
}

function formatDailyDate(date) {
  const [year, month, day] = String(date || '').split('-')
  return year && month && day ? `${day}/${month}/${year}` : String(date || '')
}

function DailyExtractionSheet({ report, loading, periodLabel }) {
  const rows = report?.daily_extraction || []
  const summed = (key) => total(rows.map((row) => row[key]))
  const frameReserveRows = report?.frame_reserve_breakdown ?? []
  const rentCategory = report?.expense_categories?.find((item) => String(item.label ?? '').trim().toLowerCase() === 'rent')
  const rentMonths = Array.from({ length: 12 }, (_, index) => value(rentCategory?.months?.[index]))
  const rentTotal = total(rentMonths)
  const monthLabels = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  return <div className="monitor-sheet-stack">
    <section className="stats-grid dashboard-stats-grid monitor-dashboard-widgets">
      <StatWidget label="Frame reserve recorded" value={money(report?.frame_reserve_total)} note="All recorded Frame Tracker reservations" icon="inventory" className="seen" />
      <StatWidget label="Frame costs to set aside" value={money(summed('frame_cost'))} note={`Known cost of frames sold • ${periodLabel}`} icon="money" className="total" />
      <StatWidget label="Frame profit to bank" value={money(summed('frame_profit'))} note={`Frame sales less known costs • ${periodLabel}`} icon="finance" className="today" />
      <StatWidget label="Rent recorded this year" value={money(rentTotal)} note={`Expense category RENT • ${report?.year ?? new Date().getFullYear()}`} icon="receipt" className="pending" />
      <StatWidget label="Lens costs to set aside" value={money(summed('lens_cost'))} note={`Known lens costs • ${periodLabel}`} icon="glasses" className="total" />
      <StatWidget label="Gross profit to bank" value={money(summed('gross_profit_to_bank'))} note={`Lens and frame sales less known costs • ${periodLabel}`} icon="finance" className="seen" />
      <StatWidget label="Lens costs missing" value={summed('lens_missing_cost_count')} note={`Lens bills without a cost entry • ${periodLabel}`} icon="alert" className="pending" />
      <StatWidget label="Frame costs missing" value={summed('frame_missing_cost_count')} note={`Sold frames without a product cost • ${periodLabel}`} icon="alert" className="pending" />
    </section>
    <div className="monitor-breakdown-grid">
      <article className="panel monitor-breakdown-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Frame Restocking</p><h3>Recorded frame reserve</h3><p className="muted-copy">Cumulative amounts explicitly set aside in Frame Tracker across recorded dates.</p></div>
          <span className="panel-tag">{money(report?.frame_reserve_total)}</span>
        </div>
        <div className="table-shell">
          <table className="portal-table">
            <thead><tr><th>Frame</th><th>Code</th><th>Units reserved</th><th>Amount set aside</th></tr></thead>
            <tbody>
              {frameReserveRows.map((row) => <tr key={`${row.frame_code}-${row.frame_name}`}><td>{row.frame_name}</td><td>{row.frame_code || '—'}</td><td>{row.reserved_count}</td><td>{money(row.reserved_amount)}</td></tr>)}
              {!frameReserveRows.length ? <tr><td colSpan="4" className="daily-sales-empty">{loading ? 'Loading frame reserves...' : 'No frame cost reservations have been recorded.'}</td></tr> : null}
            </tbody>
            {frameReserveRows.length ? <tfoot><tr><td colSpan="2">Total</td><td>{total(frameReserveRows.map((row) => row.reserved_count))}</td><td>{money(report?.frame_reserve_total)}</td></tr></tfoot> : null}
          </table>
        </div>
        <p className="monitor-breakdown-note">Frame reserve recorded is based on explicit Frame Tracker reservations. “Frame costs to set aside” above is the estimated replacement cost of frames sold in the selected period.</p>
      </article>
      <article className="panel monitor-breakdown-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Expense Tracking</p><h3>Rent recorded by month</h3><p className="muted-copy">Expenses categorized as RENT for {report?.year ?? new Date().getFullYear()}.</p></div>
          <span className="panel-tag">{money(rentTotal)}</span>
        </div>
        <div className="table-shell">
          <table className="portal-table">
            <thead><tr><th>Month</th><th>Rent recorded</th></tr></thead>
            <tbody>{rentMonths.map((amount, index) => <tr key={monthLabels[index]}><td>{monthLabels[index]}</td><td>{money(amount)}</td></tr>)}</tbody>
            <tfoot><tr><td>Total for {report?.year ?? new Date().getFullYear()}</td><td>{money(rentTotal)}</td></tr></tfoot>
          </table>
        </div>
      </article>
    </div>
    <article className="monitor-sheet">
      <div className="monitor-sheet-heading">
        <div><span>{report?.branch_name || 'Branch'} • {periodLabel}</span><h3>Lens and frame extraction</h3></div>
        <span className="monitor-live-dot">Live data</span>
      </div>
      <p className="monitor-extraction-note">
        Set aside the known lens and frame costs from these sales before banking the gross profit. Missing cost entries are excluded from profit until completed.
      </p>
      <div className="monitor-table-scroll">
        <table className="monitor-table daily-extraction-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Lens Sales</th>
              <th>Lens Cost to Set Aside</th>
              <th>Lens Profit</th>
              <th>Missing Lens Costs</th>
              <th>Frames Sold</th>
              <th>Frame Sales</th>
              <th>Frame Cost to Set Aside</th>
              <th>Frame Profit</th>
              <th>Missing Frame Costs</th>
              <th>Total Cost to Set Aside</th>
              <th>Gross Profit to Bank</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date}>
                <td>{formatDailyDate(row.date)}</td>
                <td>{money(row.lens_sales)}</td>
                <td>{money(row.lens_cost)}</td>
                <td>{money(row.lens_profit)}</td>
                <td>{row.lens_missing_cost_count}</td>
                <td>{row.frames_sold_count}</td>
                <td>{money(row.frame_sales)}</td>
                <td>{money(row.frame_cost)}</td>
                <td>{money(row.frame_profit)}</td>
                <td>{row.frame_missing_cost_count}</td>
                <td className="monitor-total">{money(row.total_cost_to_set_aside)}</td>
                <td className="monitor-total">{money(row.gross_profit_to_bank)}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan="12" className="daily-sales-empty">{loading ? 'Loading lens and frame sales...' : `No lens or frame sales were recorded for ${periodLabel.toLowerCase()}.`}</td></tr> : null}
          </tbody>
          {rows.length ? <tfoot><tr>
            <td>Total</td>
            <td>{money(summed('lens_sales'))}</td>
            <td>{money(summed('lens_cost'))}</td>
            <td>{money(summed('lens_profit'))}</td>
            <td>{summed('lens_missing_cost_count')}</td>
            <td>{summed('frames_sold_count')}</td>
            <td>{money(summed('frame_sales'))}</td>
            <td>{money(summed('frame_cost'))}</td>
            <td>{money(summed('frame_profit'))}</td>
            <td>{summed('frame_missing_cost_count')}</td>
            <td>{money(summed('total_cost_to_set_aside'))}</td>
            <td>{money(summed('gross_profit_to_bank'))}</td>
          </tr></tfoot> : null}
        </table>
      </div>
    </article>
  </div>
}

export default function MonitorSection({ apiFetch, token, selectedBranchId, session }) {
  const canViewMonitor = ['manager', 'accountant'].includes(session?.role)
  const [branchSelection, setBranchSelection] = useState(() => ({
    source: selectedBranchId,
    value: String(selectedBranchId ?? 1),
  }))
  const branchId = branchSelection.source === selectedBranchId
    ? branchSelection.value
    : String(selectedBranchId ?? 1)
  const year = String(new Date().getFullYear())
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [extractionPeriod, setExtractionPeriod] = useState('daily')
  const [extractionFrom, setExtractionFrom] = useState(() => localDateIso())
  const [extractionTo, setExtractionTo] = useState(() => localDateIso())
  const [appliedExtractionRange, setAppliedExtractionRange] = useState(() => {
    const today = localDateIso()
    return { from: today, to: today }
  })

  useEffect(() => {
    if (!token || !canViewMonitor) return
    let cancelled = false
    const params = new URLSearchParams({
      branch_id: branchId,
      year,
      extraction_from: appliedExtractionRange.from,
      extraction_to: appliedExtractionRange.to,
    })
    Promise.resolve().then(async () => {
      if (cancelled) return
      setLoading(true)
      setError('')
      setReport(null)
      try {
        const payload = await apiFetch(`/finance/monitor-workbook?${params}`, { token })
        if (!cancelled) setReport(payload)
      } catch (requestError) {
        if (!cancelled) setError(requestError.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [apiFetch, appliedExtractionRange, branchId, canViewMonitor, refreshVersion, session?.role, token, year])
  if (!canViewMonitor) return <section className="finance-section"><div className="message-banner error">The Monitor is not available for this account.</div></section>

  function printReport() { window.print() }
  function exportExcel() { saveFile(workbookXml(report), `bealet-daily-extraction-${report?.branch_name?.toLowerCase().replace(/\s+/g, '-') || 'branch'}.xls`, 'application/vnd.ms-excel') }

  return <section className="finance-section monitor-workspace">
    <div className="monitor-page-heading">
      <div><p className="eyebrow">The Monitor</p><h3>Restocking reserve and operating expenses</h3><p className="header-copy">Track frame reserves, replacement costs, Rent expenses, and the gross profit remaining after known costs.</p></div>
      <div className="header-actions"><button type="button" className="ghost-button" onClick={() => setRefreshVersion((current) => current + 1)} disabled={loading}>Refresh data</button><button type="button" className="ghost-button" onClick={printReport} disabled={!report}>Print / Save PDF</button><button type="button" className="primary-button" onClick={exportExcel} disabled={!report}>Export Excel workbook</button></div>
    </div>
    {error ? <div className="message-banner error">{error}</div> : null}
    <div className="monitor-controls extraction-filter-controls">
      <label>Reporting branch<select value={branchId} onChange={(event) => setBranchSelection({ source: selectedBranchId, value: event.target.value })}>{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label>Period<select
        value={extractionPeriod}
        onChange={(event) => {
          const nextPeriod = event.target.value
          setExtractionPeriod(nextPeriod)
          if (nextPeriod !== 'custom') {
            const nextRange = extractionPeriodRange(nextPeriod)
            setExtractionFrom(nextRange.from)
            setExtractionTo(nextRange.to)
            setAppliedExtractionRange(nextRange)
          }
        }}
      >
        <option value="daily">Daily (today)</option>
        <option value="weekly">Weekly (this week)</option>
        <option value="monthly">Monthly (this month)</option>
        <option value="custom">Custom date range</option>
      </select></label>
      {extractionPeriod === 'custom' ? (
        <form className="extraction-date-filter" onSubmit={(event) => {
          event.preventDefault()
          if (extractionFrom > extractionTo) {
            setError('The start date must be on or before the end date.')
            return
          }
          setError('')
          setAppliedExtractionRange({ from: extractionFrom, to: extractionTo })
        }}>
          <label>From<input type="date" value={extractionFrom} onChange={(event) => setExtractionFrom(event.target.value)} required /></label>
          <label>To<input type="date" value={extractionTo} onChange={(event) => setExtractionTo(event.target.value)} required /></label>
          <button type="submit" className="primary-button">Apply dates</button>
        </form>
      ) : null}
      <span>{loading ? 'Refreshing extraction...' : `Updated ${report ? new Date(report.generated_at).toLocaleString() : '—'}`}</span>
    </div>
    <DailyExtractionSheet
      report={report}
      loading={loading}
      periodLabel={appliedExtractionRange.from === appliedExtractionRange.to
        ? formatDailyDate(appliedExtractionRange.from)
        : `${formatDailyDate(appliedExtractionRange.from)} – ${formatDailyDate(appliedExtractionRange.to)}`}
    />
  </section>
}
