import { useEffect, useState } from 'react'

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

  return <div className="monitor-sheet-stack">
    <section className="monitor-kpis monitor-extraction-kpis">
      <div><span>Cost to set aside</span><strong>{money(summed('total_cost_to_set_aside'))}</strong><small>Known lens and frame cost • {periodLabel}</small></div>
      <div><span>Gross profit to bank</span><strong>{money(summed('gross_profit_to_bank'))}</strong><small>Sales less entered cost prices • {periodLabel}</small></div>
      <div><span>Lens costs missing</span><strong>{summed('lens_missing_cost_count')}</strong><small>Lens bills without a cost entry • {periodLabel}</small></div>
      <div><span>Frame costs missing</span><strong>{summed('frame_missing_cost_count')}</strong><small>Sold frames without a code cost • {periodLabel}</small></div>
    </section>
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
  }, [apiFetch, appliedExtractionRange, branchId, canViewMonitor, session?.role, token, year])
  if (!canViewMonitor) return <section className="finance-section"><div className="message-banner error">The Monitor is not available for this account.</div></section>

  function printReport() { window.print() }
  function exportExcel() { saveFile(workbookXml(report), `bealet-daily-extraction-${report?.branch_name?.toLowerCase().replace(/\s+/g, '-') || 'branch'}.xls`, 'application/vnd.ms-excel') }

  return <section className="finance-section monitor-workspace">
    <header className="monitor-hero">
      <div><p className="eyebrow">The Monitor</p><h3>Daily restocking reserve</h3><p>Track lens and frame costs to set aside from sales, then bank the remaining tracked gross profit.</p></div>
      <div className="monitor-hero-actions"><button type="button" className="ghost-button" onClick={printReport} disabled={!report}>Print / Save PDF</button><button type="button" className="primary-button" onClick={exportExcel} disabled={!report}>Export Excel workbook</button></div>
    </header>
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
