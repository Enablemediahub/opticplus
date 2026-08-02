import { useEffect, useMemo, useState } from 'react'

const currency = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 })
const branchOptions = [{ id: 0, name: 'Merged company' }, { id: 1, name: 'Labadi' }, { id: 2, name: 'Madina' }]
const tabs = ['Monthly returns', 'Daily sales', 'Insurance', 'Purchases', 'Working capital']
const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const value = (number) => Number(number || 0)
const total = (values) => values.reduce((sum, item) => sum + value(item), 0)
const money = (number) => currency.format(value(number))

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
  const data = report || { months: [], expense_categories: [], daily_sales: [] }
  const reportRows = receiptRows(data)
  const expenseRows = data.expense_categories || []
  const receiptBase = total(reportRows.filter((row) => !row.isDetail).map((row) => total(row.values)))
  const paymentBase = total(expenseRows.map((row) => total(row.months)))
  const sheets = [
    ['Monthly Returns', [['FINANCIAL DETAILS', `${data.branch_name || 'Branch'} | ${data.year || ''}`], ['RECEIPTS', '%', 'BUDGET', ...months, 'TOTAL'], ...reportRows.map((row) => [row.label, row.isDetail ? '' : (receiptBase ? (total(row.values) / receiptBase) * 100 : 0), value(data.budgets?.[row.key]), ...row.values.map(value), total(row.values)]), [], ['PAYMENTS', '%', 'BUDGET', ...months, 'TOTAL'], ...expenseRows.map((row) => [row.label, paymentBase ? (total(row.months) / paymentBase) * 100 : 0, value(data.budgets?.[`expense:${row.label}`]), ...row.months.map(value), total(row.months)])]],
    ['Daily Sales', [['DAILY SALES', data.branch_name || 'Branch'], [...months.flatMap((month) => [month, ''])], [...months.flatMap(() => ['DATE', 'SALES'])], ...dailySalesMatrix(data), [...dailySalesMonthlyTotals(data).flatMap((amount) => ['TOTAL', amount])]]],
    ['Insurance', [['MONTHLY INSURANCE CLAIMS', data.year || ''], ['DETAILS', ...months, 'TOTAL'], ['Insurance claims', ...data.months.map((row) => value(row.insurance_claimed)), total(data.months.map((row) => row.insurance_claimed))], ['Insurance received', ...data.months.map((row) => value(row.insurance_received)), total(data.months.map((row) => row.insurance_received))]]],
    ['Purchases', [['MONTHLY PURCHASES ANALYSIS', data.year || ''], ['DETAILS', ...months, 'TOTAL'], ['Lens sold', ...data.months.map((row) => value(row.lenses)), total(data.months.map((row) => row.lenses))], ['Lens purchases', ...categoryMonths(data, 'lens'), total(categoryMonths(data, 'lens'))], ['Frame sold', ...data.months.map((row) => value(row.frames)), total(data.months.map((row) => row.frames))], ['Frame purchases', ...categoryMonths(data, 'frame'), total(categoryMonths(data, 'frame'))]]],
    ['Working Capital', [['WORKING CAPITAL STATEMENT', `${data.branch_name || 'Branch'} | calculated operational view`], ['DETAILS', ...months], ['Cash collected less expenses', ...data.months.map((row) => value(row.operating_cash))], ['Trade debtors', ...data.months.map((row) => value(row.debtors))], ['Current working position', ...data.months.map((row) => value(row.operating_cash) + value(row.debtors))]]],
  ]
  const worksheet = ([name, rows]) => `<Worksheet ss:Name="${xml(name)}"><Table>${rows.map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="${typeof cell === 'number' ? 'Number' : 'String'}">${xml(cell)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet>`
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets.map(worksheet).join('')}</Workbook>`
}

function formatDailyDate(date) {
  const [year, month, day] = String(date || '').split('-')
  return year && month && day ? `${day}/${month}/${year}` : String(date || '')
}

function dailySalesMatrix(data) {
  const byMonth = Array.from({ length: 12 }, () => [])
  ;(data.daily_sales || []).forEach((row) => {
    const monthIndex = Number(String(row.date || '').slice(5, 7)) - 1
    if (monthIndex >= 0 && monthIndex < 12) byMonth[monthIndex].push([formatDailyDate(row.date), value(row.total)])
  })
  const rowCount = Math.max(0, ...byMonth.map((items) => items.length))
  return Array.from({ length: rowCount }, (_, rowIndex) => byMonth.flatMap((items) => items[rowIndex] || ['', '']))
}

function dailySalesMonthlyTotals(data) {
  const totals = Array(12).fill(0)
  ;(data.daily_sales || []).forEach((row) => {
    const monthIndex = Number(String(row.date || '').slice(5, 7)) - 1
    if (monthIndex >= 0 && monthIndex < 12) totals[monthIndex] += value(row.total)
  })
  return totals
}

function dailySalesByMonth(data) {
  const byMonth = Array.from({ length: 12 }, () => [])
  ;(data.daily_sales || []).forEach((row) => {
    const monthIndex = Number(String(row.date || '').slice(5, 7)) - 1
    if (monthIndex >= 0 && monthIndex < 12) byMonth[monthIndex].push(row)
  })
  return byMonth
}

function categoryMonths(data, match) {
  return (data.expense_categories || []).filter((row) => row.label.toLowerCase().includes(match)).reduce((sum, row) => sum.map((amount, index) => amount + value(row.months[index])), Array(12).fill(0))
}

function receiptRows(data) {
  const set = data.months || []
  const revenueRows = [
    ['Sales of frames', 'frames'], ['Sales of lenses', 'lenses'], ['Consultation', 'consultation'], ['Insurance received', 'insurance_received'], ['Sale of cases', 'cases'],
  ].map(([label, key]) => ({ key: `receipt:${key}`, label, values: set.map((row) => value(row[key])) }))
  const collectionDetails = (data.collection_sources || []).map((row) => ({ key: `collection:${row.label}`, label: `↳ ${row.label}`, values: row.months, isDetail: true }))
  return [...revenueRows, ...collectionDetails]
}

function MatrixTable({ title, subtitle, columns = months, rows, totalColumn = true, planning = false, budgets = {}, onBudgetChange }) {
  const percentageBase = total(rows.filter((row) => !row.isDetail).map((row) => total(row.values)))
  return <article className="monitor-sheet">
    <div className="monitor-sheet-heading"><div><span>{subtitle}</span><h3>{title}</h3></div><span className="monitor-live-dot">Live data</span></div>
    <div className="monitor-table-scroll"><table className="monitor-table"><thead><tr><th>Details</th>{planning ? <><th>%</th><th>Budget</th></> : null}{columns.map((month) => <th key={month}>{month}</th>)}{totalColumn ? <th>Total</th> : null}</tr></thead><tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}</td>{planning ? <><td>{row.isDetail ? '—' : `${percentageBase ? ((total(row.values) / percentageBase) * 100).toFixed(1) : '0.0'}%`}</td><td><input className="monitor-budget-input" type="number" min="0" step="0.01" value={budgets[row.key] ?? ''} placeholder="Set budget" aria-label={`${row.label} budget`} onChange={(event) => onBudgetChange(row.key, event.target.value)} onBlur={(event) => onBudgetChange(row.key, event.target.value, true)} /></td></> : null}{row.values.map((amount, index) => <td key={index}>{money(amount)}</td>)}{totalColumn ? <td className="monitor-total">{money(total(row.values))}</td> : null}</tr>)}</tbody></table></div>
  </article>
}

function DailySalesSheet({ report, year }) {
  const rows = dailySalesMatrix(report || {})
  const monthlyTotals = dailySalesMonthlyTotals(report || {})
  const salesByMonth = dailySalesByMonth(report || {})
  return <article className="monitor-sheet">
    <div className="monitor-sheet-heading"><div><span>{report?.branch_name || 'Branch'} • {year}</span><h3>Daily sales</h3></div><span className="monitor-live-dot">Live data</span></div>
    <div className="monitor-table-scroll daily-sales-scroll"><table className="daily-sales-horizontal"><thead>
      <tr>{months.map((month) => <th key={month} colSpan="2">{month}</th>)}</tr>
      <tr>{months.flatMap((month) => [<th key={`${month}-date`}>Date</th>, <th key={`${month}-sales`}>Sales</th>])}</tr>
    </thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cellIndex % 2 === 0 ? cell : cell ? money(cell) : ''}</td>)}</tr>)}
      {!report?.daily_sales?.length ? <tr><td colSpan="24" className="daily-sales-empty">No sales posted for this year.</td></tr> : null}
    </tbody><tfoot><tr>{monthlyTotals.flatMap((amount, monthIndex) => [<td key={`${monthIndex}-label`}>Total</td>, <td key={`${monthIndex}-value`}>{money(amount)}</td>])}</tr></tfoot></table></div>
    <div className="monitor-print-daily-ledgers">{months.map((month, monthIndex) => <section className="monitor-print-daily-month" key={month}><h4>{month} {year}</h4><table><thead><tr><th>Date</th><th>Sales</th></tr></thead><tbody>{salesByMonth[monthIndex].map((row) => <tr key={row.date}><td>{formatDailyDate(row.date)}</td><td>{money(row.total)}</td></tr>)}{!salesByMonth[monthIndex].length ? <tr><td colSpan="2">No sales posted</td></tr> : null}</tbody><tfoot><tr><td>Total</td><td>{money(monthlyTotals[monthIndex])}</td></tr></tfoot></table></section>)}</div>
  </article>
}

export default function MonitorSection({ apiFetch, token, selectedBranchId, session }) {
  const [branchId, setBranchId] = useState(String(selectedBranchId ?? 1))
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [report, setReport] = useState(null)
  const [activeTab, setActiveTab] = useState('Monthly returns')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [budgets, setBudgets] = useState({})

  useEffect(() => setBranchId(String(selectedBranchId ?? 1)), [selectedBranchId])
  useEffect(() => {
    if (!token || session?.role !== 'manager') return
    let cancelled = false
    setLoading(true); setError('')
    apiFetch(`/finance/monitor-workbook?branch_id=${branchId}&year=${year}`, { token })
      .then((payload) => { if (!cancelled) setReport(payload) })
      .catch((requestError) => { if (!cancelled) setError(requestError.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [apiFetch, branchId, session?.role, token, year])
  useEffect(() => setBudgets(report?.budgets || {}), [report])

  const receipt = useMemo(() => receiptRows(report || { months: [] }), [report])
  const expenseRows = useMemo(() => (report?.expense_categories || []).map((row) => ({ key: `expense:${row.label}`, label: row.label, values: row.months })), [report])
  const insuranceRows = useMemo(() => [
    { label: 'Insurance claims', values: (report?.months || []).map((row) => row.insurance_claimed) },
    { label: 'Insurance received', values: (report?.months || []).map((row) => row.insurance_received) },
  ], [report])
  const purchaseRows = useMemo(() => {
    const set = report?.months || []
    const lensCost = categoryMonths(report || {}, 'lens'); const frameCost = categoryMonths(report || {}, 'frame')
    return [{ label: 'Lens sold', values: set.map((row) => row.lenses) }, { label: 'Lens purchases', values: lensCost }, { label: 'Lens margin', values: set.map((row, index) => value(row.lenses) - lensCost[index]) }, { label: 'Frames sold', values: set.map((row) => row.frames) }, { label: 'Frame purchases', values: frameCost }, { label: 'Frame margin', values: set.map((row, index) => value(row.frames) - frameCost[index]) }]
  }, [report])
  const capitalRows = useMemo(() => [{ label: 'Cash collected less expenses', values: (report?.months || []).map((row) => row.operating_cash) }, { label: 'Trade debtors', values: (report?.months || []).map((row) => row.debtors) }, { label: 'Current working position', values: (report?.months || []).map((row) => value(row.operating_cash) + value(row.debtors)) }], [report])
  const ytdRevenue = total((report?.months || []).map((row) => row.collected))
  const ytdExpenses = total((report?.months || []).map((row) => row.expenses))

  if (!['manager', 'accountant'].includes(session?.role)) return <section className="finance-section"><div className="message-banner error">Only the General Manager and Accountant can access The Monitor.</div></section>

  function printReport() { window.print() }
  function exportExcel() { saveFile(workbookXml(report), `bealet-monitor-${report?.branch_name?.toLowerCase().replace(/\s+/g, '-') || 'report'}-${year}.xls`, 'application/vnd.ms-excel') }
  async function updateBudget(lineKey, amount, save = false) {
    setBudgets((current) => ({ ...current, [lineKey]: amount }))
    if (!save) return
    try {
      const response = await apiFetch('/finance/monitor-budgets', { method: 'POST', token, body: { branch_id: Number(branchId), year: Number(year), line_key: lineKey, amount: Number(amount || 0) } })
      setBudgets((current) => ({ ...current, [lineKey]: response.amount }))
    } catch (requestError) { setError(requestError.message) }
  }

  return <section className="finance-section monitor-workspace">
    <header className="monitor-hero">
      <div><p className="eyebrow">The Monitor</p><h3>Monthly management and audit workbook</h3><p>Live, export-ready reporting built from OpticPlus sales, collections, insurance and expense records.</p></div>
      <div className="monitor-hero-actions"><button type="button" className="ghost-button" onClick={printReport} disabled={!report}>Print / Save PDF</button><button type="button" className="primary-button" onClick={exportExcel} disabled={!report}>Export Excel workbook</button></div>
    </header>
    {error ? <div className="message-banner error">{error}</div> : null}
    <div className="monitor-controls"><label>Reporting branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Financial year<input type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(event.target.value)} /></label><span>{loading ? 'Refreshing workbook…' : `Updated ${report ? new Date(report.generated_at).toLocaleString() : '—'}`}</span></div>
    <section className="monitor-kpis"><div><span>YTD collected</span><strong>{money(ytdRevenue)}</strong><small>Actual receipts including paid insurance</small></div><div><span>YTD expenses</span><strong>{money(ytdExpenses)}</strong><small>All posted expenses</small></div><div><span>Working position</span><strong>{money(value(report?.months?.[11]?.operating_cash) + value(report?.months?.[11]?.debtors))}</strong><small>Operating cash proxy plus trade debtors</small></div></section>
    <nav className="monitor-tabs" aria-label="Workbook sheets">{tabs.map((tab) => <button type="button" key={tab} className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>
    {activeTab === 'Monthly returns' ? <div className="monitor-sheet-stack"><MatrixTable title="Receipts" subtitle={`${report?.branch_name || 'Branch'} • ${year} • Accountant budgets are saved on exit`} rows={receipt} planning budgets={budgets} onBudgetChange={updateBudget} /><MatrixTable title="Payments" subtitle="Expense categories posted in OpticPlus • Accountant budgets are saved on exit" rows={expenseRows} planning budgets={budgets} onBudgetChange={updateBudget} /></div> : null}
    {activeTab === 'Daily sales' ? <DailySalesSheet report={report} year={year} /> : null}
    {activeTab === 'Insurance' ? <MatrixTable title="Monthly insurance claims" subtitle="Expected claims and paid insurer receipts" rows={insuranceRows} /> : null}
    {activeTab === 'Purchases' ? <MatrixTable title="Monthly purchases analysis" subtitle="Sales, purchases and calculated gross margins" rows={purchaseRows} /> : null}
    {activeTab === 'Working capital' ? <><MatrixTable title="Working capital statement" subtitle="Calculated operational view — not a bank reconciliation" rows={capitalRows} totalColumn={false} /><p className="monitor-disclaimer">Cash is calculated from recorded customer and insurer collections less recorded expenses. Add bank and cash reconciliations separately before relying on it as a statutory balance-sheet figure.</p></> : null}
  </section>
}
