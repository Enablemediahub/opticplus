import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const STORAGE_KEY = 'opticplus-tax-review-decisions'
const SALARY_DECLARATION_STORAGE_KEY = 'opticplus-extract-salary-declarations'
const GRA_ANNUAL_THRESHOLD = 550000

const revenueStatusOptions = [
  { value: 'taxable', label: 'Taxable' },
  { value: 'non_taxable', label: 'Non-taxable' },
  { value: 'review', label: 'Needs review' },
]

const expenseStatusOptions = [
  { value: 'deductible', label: 'Deductible' },
  { value: 'non_deductible', label: 'Non-deductible' },
  { value: 'review', label: 'Needs review' },
]

function readStoredDecisions() {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function readSalaryDeclarations() {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(window.localStorage.getItem(SALARY_DECLARATION_STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function buildRevenueKey(record) {
  return `sales-${record.id}`
}

function buildExpenseKey(record) {
  return `expense-${record.expense_id}`
}

function buildDefaultDecision(type) {
  return {
    classification: type === 'revenue' ? 'taxable' : 'deductible',
    includeInAudit: true,
    reason: '',
    reviewedAt: '',
  }
}

function formatDate(value) {
  if (!value) return 'No date'
  return new Date(value).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatStatus(value) {
  return String(value ?? '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function sumBy(items, selector) {
  return items.reduce((total, item) => total + Number(selector(item) ?? 0), 0)
}

function isSalaryExpense(expense) {
  const category = String(expense.category ?? '').toLowerCase()
  const description = String(expense.description ?? '').toLowerCase()
  return category.includes('salary') || description.includes('salary')
}

function sanitizeNumber(value) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function createExtractAuditorReportHtml({ companyName, branchName, taxableRevenue, deductibleExpenses, thresholdHeadroom, salaryDeclaredTotal, salaryCoverage, rows, includeNotes }) {
  const showNotes = includeNotes && rows.some((row) => row.reason)
  const rowsHtml = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(row.type === 'revenue' ? 'Revenue' : 'Expense')}</td>
      <td>${escapeHtml(row.label)}</td>
      <td>${escapeHtml(row.reference)}</td>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(formatDate(row.date))}</td>
      <td>${escapeHtml(currency.format(row.amount))}</td>
      ${showNotes ? `<td>${escapeHtml(row.reason || '')}</td>` : ''}
    </tr>
  `).join('')

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Auditor Financial Extract</title>
      <style>
        body { font-family: Calibri, Arial, sans-serif; margin: 24px; color: #122033; }
        h1, h2, h3, p { margin: 0; }
        .header { text-align: center; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 18px 0 24px; }
        .summary-card { border: 1px solid #c7d7e6; border-radius: 12px; padding: 12px 14px; }
        .summary-card span { color: #516072; font-size: 12px; display: block; }
        .summary-card strong { display: block; margin-top: 8px; font-size: 18px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #c7d7e6; padding: 8px 10px; vertical-align: top; font-size: 12px; }
        th { background: #eaf3fb; text-align: left; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${escapeHtml(companyName)}</h1>
        <h2>Auditor Financial Extract</h2>
        <p>${escapeHtml(branchName)}</p>
      </div>
      <div class="summary">
        <div class="summary-card"><span>Taxable Revenue</span><strong>${escapeHtml(currency.format(taxableRevenue))}</strong></div>
        <div class="summary-card"><span>Deductible Expenses</span><strong>${escapeHtml(currency.format(deductibleExpenses))}</strong></div>
        <div class="summary-card"><span>GRA Threshold Headroom</span><strong>${escapeHtml(currency.format(thresholdHeadroom))}</strong></div>
        <div class="summary-card"><span>Declared Salaries</span><strong>${escapeHtml(currency.format(salaryDeclaredTotal))}</strong></div>
        <div class="summary-card"><span>Coverage After Expenses</span><strong>${escapeHtml(currency.format(salaryCoverage))}</strong></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>SN</th>
            <th>Type</th>
            <th>Description</th>
            <th>Reference</th>
            <th>Category</th>
            <th>Date</th>
            <th>Declared Amount</th>
            ${showNotes ? '<th>Accountant Note</th>' : ''}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body>
  </html>`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export default function ExtractSection(props) {
  const salesRecords = props.financeSales?.records ?? []
  const expenseRecords = props.financeExpenses?.records ?? []
  const [activeTab, setActiveTab] = useState('revenue')
  const [decisions, setDecisions] = useState(() => readStoredDecisions())
  const [salaryDeclarations, setSalaryDeclarations] = useState(() => readSalaryDeclarations())
  const [selectedRevenueKeys, setSelectedRevenueKeys] = useState([])
  const [selectedExpenseKeys, setSelectedExpenseKeys] = useState([])
  const [salaryModalRow, setSalaryModalRow] = useState(null)
  const [salaryDraft, setSalaryDraft] = useState({ gross: '', allowance: '', declared: '', note: '' })
  const [auditorPreviewHtml, setAuditorPreviewHtml] = useState('')

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions))
  }, [decisions])

  useEffect(() => {
    window.localStorage.setItem(SALARY_DECLARATION_STORAGE_KEY, JSON.stringify(salaryDeclarations))
  }, [salaryDeclarations])

  useEffect(() => {
    if ((props.financeSalesFilters?.per_page ?? 0) < 50) {
      props.setFinanceSalesFilters((current) => ({ ...current, per_page: 50 }))
      props.setFinanceSalesQuery((current) => ({ ...current, per_page: 50, page: 1 }))
    }

    if ((props.financeExpenseFilters?.per_page ?? 0) < 50) {
      props.setFinanceExpenseFilters((current) => ({ ...current, per_page: 50 }))
      props.setFinanceExpenseQuery((current) => ({ ...current, per_page: 50, page: 1 }))
    }
  }, [])

  const revenueRows = useMemo(() => salesRecords.map((record) => {
    const key = buildRevenueKey(record)
    const decision = { ...buildDefaultDecision('revenue'), ...(decisions[key] ?? {}) }

    return {
      key,
      type: 'revenue',
      id: record.id,
      label: record.name || record.folder_id || 'Revenue entry',
      ref: record.receipt_number || record.folder_id || `Sales #${record.id}`,
      method: record.payment_method || 'Payment',
      date: record.date,
      amount: Number(record.amount_paid ?? 0),
      note: record.reference || record.transaction_id || '',
      decision,
    }
  }), [decisions, salesRecords])

  const expenseRows = useMemo(() => expenseRecords.map((expense) => {
    const key = buildExpenseKey(expense)
    const decision = { ...buildDefaultDecision('expense'), ...(decisions[key] ?? {}) }
    const salaryDeclaration = salaryDeclarations[key] ?? {}
    const baseAmount = Number(expense.amount ?? 0)
    const declaredAmount = salaryDeclaration.declared === '' || salaryDeclaration.declared == null
      ? baseAmount
      : sanitizeNumber(salaryDeclaration.declared)

    return {
      key,
      type: 'expense',
      id: expense.expense_id,
      label: expense.description || `Expense #${expense.expense_id}`,
      ref: expense.expense_id,
      method: expense.category || 'Expense',
      date: expense.date,
      amount: baseAmount,
      declaredAmount,
      note: expense.branch_name || '',
      decision,
      isSalary: isSalaryExpense(expense),
      salaryDeclaration,
    }
  }), [decisions, expenseRecords, salaryDeclarations])

  const allRows = [...revenueRows, ...expenseRows]
  const taxableRevenue = sumBy(revenueRows.filter((row) => row.decision.classification === 'taxable'), (row) => row.amount)
  const nonTaxableRevenue = sumBy(revenueRows.filter((row) => row.decision.classification === 'non_taxable'), (row) => row.amount)
  const deductibleExpenses = sumBy(expenseRows.filter((row) => row.decision.classification === 'deductible'), (row) => row.declaredAmount)
  const nonDeductibleExpenses = sumBy(expenseRows.filter((row) => row.decision.classification === 'non_deductible'), (row) => row.declaredAmount)
  const auditIncludedTotal = sumBy(allRows.filter((row) => row.decision.includeInAudit), (row) => row.amount)
  const reviewCount = allRows.filter((row) => row.decision.classification === 'review').length
  const incompleteReasons = allRows.filter((row) => !row.decision.reason.trim()).length
  const visibleRows = activeTab === 'revenue' ? revenueRows : expenseRows
  const selectedKeys = activeTab === 'revenue' ? selectedRevenueKeys : selectedExpenseKeys
  const selectedCount = selectedKeys.length
  const salesFilters = props.financeSalesFilters
  const expenseFilters = props.financeExpenseFilters
  const salaryDeclaredTotal = sumBy(expenseRows.filter((row) => row.isSalary && row.decision.classification === 'deductible'), (row) => row.declaredAmount)
  const thresholdHeadroom = GRA_ANNUAL_THRESHOLD - taxableRevenue
  const salaryCoverage = taxableRevenue - deductibleExpenses
  const auditorRows = [
    ...revenueRows
      .filter((row) => row.decision.classification === 'taxable' && row.decision.includeInAudit)
      .map((row) => ({
        type: 'revenue',
        label: row.label,
        reference: row.ref,
        category: row.method,
        date: row.date,
        amount: row.amount,
        reason: row.decision.reason,
      })),
    ...expenseRows
      .filter((row) => row.decision.classification === 'deductible' && row.decision.includeInAudit)
      .map((row) => ({
        type: 'expense',
        label: row.label,
        reference: row.ref,
        category: row.method,
        date: row.date,
        amount: row.declaredAmount,
        reason: row.decision.reason,
      })),
  ]

  function updateDecision(key, patch) {
    setDecisions((current) => {
      const base = {
        ...(key.startsWith('sales-') ? buildDefaultDecision('revenue') : buildDefaultDecision('expense')),
        ...(current[key] ?? {}),
      }

      return {
        ...current,
        [key]: {
          ...base,
          ...patch,
          reviewedAt: new Date().toISOString(),
        },
      }
    })
  }

  function bulkApply(type, patch) {
    const rows = type === 'revenue' ? revenueRows : expenseRows

    setDecisions((current) => {
      const next = { ...current }
      rows.forEach((row) => {
        next[row.key] = {
          ...buildDefaultDecision(type),
          ...(next[row.key] ?? {}),
          ...patch,
          reviewedAt: new Date().toISOString(),
        }
      })
      return next
    })
  }

  function toggleRowSelection(type, key) {
    const setter = type === 'revenue' ? setSelectedRevenueKeys : setSelectedExpenseKeys

    setter((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ))
  }

  function toggleSelectAll(type, checked) {
    const rows = type === 'revenue' ? revenueRows : expenseRows
    const setter = type === 'revenue' ? setSelectedRevenueKeys : setSelectedExpenseKeys
    setter(checked ? rows.map((row) => row.key) : [])
  }

  function bulkApplySelected(type, patch) {
    const selected = type === 'revenue' ? selectedRevenueKeys : selectedExpenseKeys
    if (!selected.length) return

    setDecisions((current) => {
      const next = { ...current }
      selected.forEach((key) => {
        next[key] = {
          ...buildDefaultDecision(type),
          ...(next[key] ?? {}),
          ...patch,
          reviewedAt: new Date().toISOString(),
        }
      })
      return next
    })
  }

  function applyRevenueFilters(event) {
    event.preventDefault()
    props.setFinanceSalesQuery({ ...salesFilters, page: 1 })
  }

  function resetRevenueFilters() {
    const next = {
      search: '',
      payment_method: 'all',
      date_from: '',
      date_to: '',
      page: 1,
      per_page: 50,
    }
    props.setFinanceSalesFilters(next)
    props.setFinanceSalesQuery(next)
  }

  function applyExpenseFilters(event) {
    event.preventDefault()
    props.setFinanceExpenseQuery({ ...expenseFilters, page: 1 })
  }

  function resetExpenseFilters() {
    const next = {
      filter: 'all',
      start_date: '',
      end_date: '',
      category: 'all',
      search: '',
      page: 1,
      per_page: 50,
    }
    props.setFinanceExpenseFilters(next)
    props.setFinanceExpenseQuery(next)
  }

  function openSalaryDeclaration(row) {
    const declaration = salaryDeclarations[row.key] ?? {}
    setSalaryModalRow(row)
    setSalaryDraft({
      gross: declaration.gross ?? row.amount,
      allowance: declaration.allowance ?? 0,
      declared: declaration.declared ?? row.declaredAmount ?? row.amount,
      note: declaration.note ?? '',
    })
  }

  function saveSalaryDeclaration() {
    if (!salaryModalRow) return

    setSalaryDeclarations((current) => ({
      ...current,
      [salaryModalRow.key]: {
        gross: sanitizeNumber(salaryDraft.gross),
        allowance: sanitizeNumber(salaryDraft.allowance),
        declared: sanitizeNumber(salaryDraft.declared),
        note: salaryDraft.note,
      },
    }))
    setSalaryModalRow(null)
  }

  function previewAuditorReport() {
    setAuditorPreviewHtml(createExtractAuditorReportHtml({
      companyName: props.companyProfile?.company_name || 'Bealet Optical Center',
      branchName: props.branchName || 'Active branch',
      taxableRevenue,
      deductibleExpenses,
      thresholdHeadroom,
      salaryDeclaredTotal,
      salaryCoverage,
      rows: auditorRows,
      includeNotes: auditorRows.some((row) => String(row.reason ?? '').trim()),
    }))
  }

  function printAuditorReport() {
    if (!auditorPreviewHtml) return
    const printWindow = window.open('', '_blank', 'width=1200,height=900')
    if (!printWindow) return
    printWindow.document.open()
    printWindow.document.write(auditorPreviewHtml)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 300)
  }

  function exportAuditorExcel() {
    if (!auditorPreviewHtml) return
    const blob = new Blob([auditorPreviewHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `auditor-extract-${(props.branchName || 'branch').toLowerCase().replace(/\s+/g, '-')}.xls`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Extract</p>
          <h3>Tax classification and audit extract workspace</h3>
          <p className="header-copy">
            Review visible revenue and expense entries, classify their tax treatment, and decide whether each record belongs in the audit pack.
          </p>
        </div>
      </div>

      {props.financeError ? <div className="message-banner error">{props.financeError}</div> : null}
      <div className="message-banner">
        This workspace supports accountant review for lawful tax classification. Each decision is stored locally in this browser until backend persistence is added.
      </div>

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Taxable Revenue" value={currency.format(taxableRevenue)} note="Revenue currently marked for statutory declaration" icon="money" className="seen" />
        <StatWidget label="Non-taxable Revenue" value={currency.format(nonTaxableRevenue)} note="Revenue marked exempt or outside taxable scope" icon="shield" className="today" />
        <StatWidget label="Deductible Expenses" value={currency.format(deductibleExpenses)} note="Expenses currently allowed in the working tax view" icon="finance" className="total" />
        <StatWidget label="Needs Review" value={String(reviewCount)} note={`${incompleteReasons} entries still have no supporting reason`} icon="alert" className="pending" />
      </section>

      <section className="extract-layout">
        <article className="panel extract-command-panel report-command-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Decision Summary</p>
              <h3>Statutory and audit positioning for the current extract scope</h3>
            </div>
            <span className="panel-tag">{allRows.length} visible rows</span>
          </div>

          <div className="report-snapshot-bar">
            <div className="report-snapshot-card">
              <span>Revenue Review</span>
              <strong>{currency.format(taxableRevenue + nonTaxableRevenue)}</strong>
              <p>{revenueRows.length} revenue entries in the current working set.</p>
            </div>
            <div className="report-snapshot-card">
              <span>Expense Review</span>
              <strong>{currency.format(deductibleExpenses + nonDeductibleExpenses)}</strong>
              <p>{expenseRows.length} expense entries currently available for classification.</p>
            </div>
            <div className="report-snapshot-card">
              <span>Audit Pack Value</span>
              <strong>{currency.format(auditIncludedTotal)}</strong>
              <p>Total value of entries currently marked for audit-facing reporting.</p>
            </div>
            <div className="report-snapshot-card">
              <span>Classification Health</span>
              <strong>{reviewCount === 0 ? 'Ready' : `${reviewCount} pending`}</strong>
              <p>Resolve items marked for review and add reasons before final export.</p>
            </div>
            <div className="report-snapshot-card">
              <span>GRA Threshold Headroom</span>
              <strong>{currency.format(thresholdHeadroom)}</strong>
              <p>{thresholdHeadroom >= 0 ? 'Remaining room under the GHS 550,000 threshold.' : 'Current taxable revenue is above the threshold.'}</p>
            </div>
            <div className="report-snapshot-card">
              <span>Salary Coverage</span>
              <strong>{currency.format(salaryCoverage)}</strong>
              <p>Taxable revenue less declared deductible expenses, including salaries.</p>
            </div>
          </div>

          <div className="extract-bulk-actions">
            <button type="button" className={activeTab === 'revenue' ? 'report-type-card is-active' : 'report-type-card'} onClick={() => setActiveTab('revenue')}>
              <span>Revenue</span>
              <strong>Classify sales and collections</strong>
              <p>Mark visible revenue rows as taxable, non-taxable, or needing review.</p>
            </button>
            <button type="button" className={activeTab === 'expense' ? 'report-type-card is-active' : 'report-type-card'} onClick={() => setActiveTab('expense')}>
              <span>Expenses</span>
              <strong>Classify spending treatment</strong>
              <p>Decide whether each expense is deductible, non-deductible, or needs review.</p>
            </button>
          </div>

          <div className="extract-toolbar">
            {activeTab === 'revenue' ? (
              <>
                <button type="button" className="ghost-button" onClick={() => bulkApplySelected('revenue', { classification: 'non_taxable' })} disabled={!selectedRevenueKeys.length}>Mark selected revenue non-taxable</button>
                <button type="button" className="ghost-button" onClick={() => bulkApplySelected('revenue', { classification: 'taxable' })} disabled={!selectedRevenueKeys.length}>Mark selected revenue taxable</button>
                <button type="button" className="ghost-button" onClick={() => bulkApply('revenue', { classification: 'review' })}>Send visible revenue to review</button>
                <button type="button" className="ghost-button" onClick={() => bulkApplySelected('revenue', { includeInAudit: true })} disabled={!selectedRevenueKeys.length}>Include selected revenue in audit pack</button>
              </>
            ) : (
              <>
                <button type="button" className="ghost-button" onClick={() => bulkApplySelected('expense', { classification: 'non_deductible' })} disabled={!selectedExpenseKeys.length}>Mark selected expenses non-deductible</button>
                <button type="button" className="ghost-button" onClick={() => bulkApplySelected('expense', { classification: 'deductible' })} disabled={!selectedExpenseKeys.length}>Mark selected expenses deductible</button>
                <button type="button" className="ghost-button" onClick={() => bulkApply('expense', { classification: 'review' })}>Send visible expenses to review</button>
                <button type="button" className="ghost-button" onClick={() => bulkApplySelected('expense', { includeInAudit: true })} disabled={!selectedExpenseKeys.length}>Include selected expenses in audit pack</button>
              </>
            )}
          </div>

          <div className="extract-auditor-actions">
            <button type="button" className="primary-button" disabled={!auditorRows.length} onClick={previewAuditorReport}>
              Preview Auditor Report
            </button>
            <button type="button" className="ghost-button" disabled={!auditorPreviewHtml} onClick={printAuditorReport}>
              Print / Save PDF
            </button>
            <button type="button" className="ghost-button" disabled={!auditorPreviewHtml} onClick={exportAuditorExcel}>
              Export Excel
            </button>
          </div>

          {auditorPreviewHtml ? (
            <div className="extract-preview-banner">
              Auditor preview is ready. Non-deductible expenses and excluded rows are not included in this version.
            </div>
          ) : null}
        </article>

        <article className="panel extract-table-panel report-sheet">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{activeTab === 'revenue' ? 'Revenue Review' : 'Expense Review'}</p>
              <h3>{activeTab === 'revenue' ? 'Classify sales and collection entries' : 'Classify expense entries for statutory treatment'}</h3>
            </div>
            <span className="panel-tag">{activeTab === 'revenue' ? (props.financeSales?.pagination?.total ?? visibleRows.length) : (props.financeExpenses?.pagination?.total ?? visibleRows.length)} rows</span>
          </div>

          {activeTab === 'revenue' ? (
            <form className="extract-filter-grid" onSubmit={applyRevenueFilters}>
              <label>
                Search
                <input
                  value={salesFilters.search}
                  onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Patient, folder, receipt, reference"
                />
              </label>
              <label>
                Payment method
                <select
                  value={salesFilters.payment_method}
                  onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, payment_method: event.target.value }))}
                >
                  <option value="all">All methods</option>
                  {(props.financeSales?.payment_methods ?? []).map((method) => (
                    <option key={method.payment_method ?? method} value={method.payment_method ?? method}>{method.payment_method ?? method}</option>
                  ))}
                </select>
              </label>
              <label>
                Date from
                <input
                  type="date"
                  value={salesFilters.date_from}
                  onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, date_from: event.target.value }))}
                />
              </label>
              <label>
                Date to
                <input
                  type="date"
                  value={salesFilters.date_to}
                  onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, date_to: event.target.value }))}
                />
              </label>
              <label>
                Rows per page
                <select
                  value={salesFilters.per_page}
                  onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, per_page: Number(event.target.value) }))}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <div className="extract-filter-actions">
                <button type="submit" className="primary-button">Apply filters</button>
                <button type="button" className="ghost-button" onClick={resetRevenueFilters}>Reset</button>
              </div>
            </form>
          ) : (
            <form className="extract-filter-grid" onSubmit={applyExpenseFilters}>
              <label>
                Search
                <input
                  value={expenseFilters.search}
                  onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Description or expense ID"
                />
              </label>
              <label>
                Category
                <select
                  value={expenseFilters.category}
                  onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, category: event.target.value }))}
                >
                  <option value="all">All categories</option>
                  {(props.financeExpenses?.categories ?? []).map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                Window
                <select
                  value={expenseFilters.filter}
                  onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, filter: event.target.value }))}
                >
                  <option value="all">All time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              <label>
                Date from
                <input
                  type="date"
                  value={expenseFilters.start_date}
                  onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, start_date: event.target.value }))}
                />
              </label>
              <label>
                Date to
                <input
                  type="date"
                  value={expenseFilters.end_date}
                  onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, end_date: event.target.value }))}
                />
              </label>
              <label>
                Rows per page
                <select
                  value={expenseFilters.per_page}
                  onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, per_page: Number(event.target.value) }))}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <div className="extract-filter-actions">
                <button type="submit" className="primary-button">Apply filters</button>
                <button type="button" className="ghost-button" onClick={resetExpenseFilters}>Reset</button>
              </div>
            </form>
          )}

          {visibleRows.length ? (
            <>
              <div className="extract-table-toolbar">
                <span>
                  {selectedCount} selected
                  {' '}| Page {activeTab === 'revenue' ? (props.financeSales?.pagination?.page ?? 1) : (props.financeExpenses?.pagination?.page ?? 1)}
                  {' '}of {activeTab === 'revenue' ? (props.financeSales?.pagination?.total_pages ?? 1) : (props.financeExpenses?.pagination?.total_pages ?? 1)}
                </span>
                <label className="extract-select-all">
                  <input
                    type="checkbox"
                    checked={visibleRows.length > 0 && selectedCount === visibleRows.length}
                    onChange={(event) => toggleSelectAll(activeTab, event.target.checked)}
                  />
                  <span>Select all visible rows</span>
                </label>
              </div>

              <div className="table-shell">
                <table className="portal-table extract-table">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>{activeTab === 'revenue' ? 'Patient / Entry' : 'Expense / Entry'}</th>
                      <th>Reference</th>
                      <th>{activeTab === 'revenue' ? 'Method' : 'Category'}</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Classification</th>
                      <th>Audit Pack</th>
                      {activeTab === 'expense' ? <th>Declared Amount</th> : null}
                      <th>Reason by accountant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const statusOptions = row.type === 'revenue' ? revenueStatusOptions : expenseStatusOptions

                      return (
                        <tr key={row.key}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedKeys.includes(row.key)}
                              onChange={() => toggleRowSelection(activeTab, row.key)}
                            />
                          </td>
                          <td>
                            <strong>{row.label}</strong>
                            <div className="extract-cell-subtext">{row.note || 'No additional reference'}</div>
                          </td>
                          <td>{row.ref}</td>
                          <td>{row.method}</td>
                          <td>{formatDate(row.date)}</td>
                          <td>{currency.format(row.amount)}</td>
                          <td>
                            <select value={row.decision.classification} onChange={(event) => updateDecision(row.key, { classification: event.target.value })}>
                              {statusOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select value={row.decision.includeInAudit ? 'yes' : 'no'} onChange={(event) => updateDecision(row.key, { includeInAudit: event.target.value === 'yes' })}>
                              <option value="yes">Include</option>
                              <option value="no">Internal only</option>
                            </select>
                          </td>
                          {activeTab === 'expense' ? (
                            <td>
                              <div className="extract-declared-amount">
                                <strong>{currency.format(row.declaredAmount ?? row.amount)}</strong>
                                {row.isSalary ? (
                                  <button type="button" className="mini-action" onClick={() => openSalaryDeclaration(row)}>
                                    Salary breakdown
                                  </button>
                                ) : (
                                  <span className="extract-cell-subtext">Matches recorded amount</span>
                                )}
                              </div>
                            </td>
                          ) : null}
                          <td>
                            <textarea
                              rows="2"
                              value={row.decision.reason}
                              onChange={(event) => updateDecision(row.key, { reason: event.target.value })}
                              placeholder="Optional note"
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <Pagination
                pagination={activeTab === 'revenue' ? props.financeSales?.pagination : props.financeExpenses?.pagination}
                onPageChange={(page) => (
                  activeTab === 'revenue'
                    ? props.setFinanceSalesQuery((current) => ({ ...current, page }))
                    : props.setFinanceExpenseQuery((current) => ({ ...current, page }))
                )}
              />
            </>
          ) : (
            <div className="message-banner">No rows are available in the current finance data window.</div>
          )}
        </article>
      </section>

      {auditorPreviewHtml ? (
        <section className="panel extract-report-preview-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Auditor Report Preview</p>
              <h3>Deductible-only financial extract</h3>
            </div>
            <span className="panel-tag">{auditorRows.length} included rows</span>
          </div>

          <iframe
            title="Auditor report preview"
            className="extract-report-preview-frame"
            srcDoc={auditorPreviewHtml}
          />
        </section>
      ) : null}

      {salaryModalRow ? (
        <div className="modal-overlay" onClick={() => setSalaryModalRow(null)}>
          <article className="modal-panel extract-salary-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Salary Declaration</p>
                <h3>{salaryModalRow.label}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => setSalaryModalRow(null)}>
                Close
              </button>
            </div>

            <p className="muted-copy">
              Adjust the declared salary amount for reporting only. This does not change the source expense record.
            </p>

            <div className="patient-form-grid">
              <label>
                Gross portion
                <input type="number" step="0.01" value={salaryDraft.gross} onChange={(event) => setSalaryDraft((current) => ({ ...current, gross: event.target.value }))} />
              </label>
              <label>
                Allowance portion
                <input type="number" step="0.01" value={salaryDraft.allowance} onChange={(event) => setSalaryDraft((current) => ({ ...current, allowance: event.target.value }))} />
              </label>
              <label>
                Declared amount
                <input type="number" step="0.01" value={salaryDraft.declared} onChange={(event) => setSalaryDraft((current) => ({ ...current, declared: event.target.value }))} />
              </label>
              <label className="full-span">
                Accountant note
                <textarea rows="3" value={salaryDraft.note} onChange={(event) => setSalaryDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note about declared salary treatment" />
              </label>
            </div>

            <div className="filter-actions-row">
              <button type="button" className="ghost-button" onClick={() => setSalaryModalRow(null)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={saveSalaryDeclaration}>
                Save Declared Salary
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  )
}

function Pagination({ pagination, onPageChange }) {
  if (!pagination) return null

  return (
    <div className="pagination-bar">
      <span className="muted-copy">Page {pagination.page} of {pagination.total_pages || 1}</span>
      <div className="pagination-actions">
        <button type="button" className="mini-action" disabled={pagination.page <= 1} onClick={() => onPageChange(Math.max(pagination.page - 1, 1))}>Previous</button>
        <button type="button" className="mini-action" disabled={pagination.page >= pagination.total_pages} onClick={() => onPageChange(Math.min(pagination.page + 1, pagination.total_pages || pagination.page))}>Next</button>
      </div>
    </div>
  )
}
