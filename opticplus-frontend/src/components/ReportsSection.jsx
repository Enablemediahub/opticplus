import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'
import ReportWorkflowSection from './ReportWorkflowSection.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const TAX_REVIEW_STORAGE_KEY = 'opticplus-tax-review-decisions'
const REPORT_ROW_NOTES_STORAGE_KEY = 'opticplus-report-row-notes'
const REPORT_ROW_OVERRIDES_STORAGE_KEY = 'opticplus-report-row-overrides'

const reportTypeOptions = [
  {
    value: 'standalone',
    label: 'Standalone',
    title: 'Single selected-month report',
    copy: 'Build one report for the selected branch and month without comparison columns.',
  },
  {
    value: 'comparison',
    label: 'Compared',
    title: 'Primary versus comparison report',
    copy: 'Compare one branch or month directly against another and export the variance.',
  },
  {
    value: 'insurance',
    label: 'Insurance',
    title: 'Insurance-focused report',
    copy: 'Focus on insurance paid, claimed, pending, and outstanding customer exposure.',
  },
  {
    value: 'all',
    label: 'All',
    title: 'Full report pack',
    copy: 'Include monthly overview, detailed statement, and comparison where selected.',
  },
  {
    value: 'tax_review',
    label: 'Tax Review',
    title: 'Tax classification extract',
    copy: 'Export the current revenue and expense tax treatment with audit-pack inclusion notes.',
  },
]

const insuranceKeys = new Set([
  'gross_billed_total',
  'insurance_paid',
  'insurance_claimed',
  'insurance_pending',
  'outstanding_balance',
  'total_collections',
  'net_operating_position',
  'net_position_collections',
])

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report'
}

function formatMoney(value) {
  return currency.format(Number(value ?? 0))
}

function formatSignedMoney(value) {
  const amount = Number(value ?? 0)
  if (amount === 0) return formatMoney(0)

  return `${amount > 0 ? '+' : '-'}${formatMoney(Math.abs(amount))}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function flattenSections(report) {
  let sn = 1

  return (report?.sections ?? []).flatMap((section) => ([
    { type: 'section', key: section.key, title: section.title },
    ...(section.rows ?? []).map((row) => ({
      type: 'row',
      section: section.title,
      sn: sn++,
      key: row.key,
      description: row.description,
      amount: Number(row.amount ?? 0),
      note: '',
      systemNote: row.note ?? '',
    })),
  ]))
}

function readTaxReviewDecisions() {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(window.localStorage.getItem(TAX_REVIEW_STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function readReportRowNotes() {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(window.localStorage.getItem(REPORT_ROW_NOTES_STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeReportRowNotes(notes) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(REPORT_ROW_NOTES_STORAGE_KEY, JSON.stringify(notes))
}

function readReportRowOverrides() {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(window.localStorage.getItem(REPORT_ROW_OVERRIDES_STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeReportRowOverrides(overrides) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(REPORT_ROW_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides))
}

function formatStatusLabel(value) {
  return String(value ?? '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildTaxReviewPayload(financeSales, financeExpenses) {
  const decisions = readTaxReviewDecisions()
  const salesRows = (financeSales?.records ?? []).map((record, index) => {
    const decision = {
      classification: 'taxable',
      includeInAudit: true,
      reason: '',
      accountantNote: '',
      ...(decisions[`sales-${record.id}`] ?? {}),
    }

    return {
      type: 'row',
      section: 'Revenue Classification',
      sn: index + 1,
      key: `sales-${record.id}`,
      description: `${record.name || record.folder_id || 'Revenue entry'} | ${record.payment_method || 'Payment'} | ${record.receipt_number || record.folder_id || `Sales #${record.id}`}`,
      amount: Number(record.amount_paid ?? 0),
      note: decision.accountantNote ?? '',
      systemNote: `${formatStatusLabel(decision.classification)} | ${decision.includeInAudit ? 'Audit included' : 'Internal only'}${decision.reason ? ` | ${decision.reason}` : ''}`,
      classification: decision.classification,
      includeInAudit: decision.includeInAudit,
    }
  })

  const expenseRows = (financeExpenses?.records ?? []).map((expense, index) => {
    const decision = {
      classification: 'deductible',
      includeInAudit: true,
      reason: '',
      accountantNote: '',
      ...(decisions[`expense-${expense.expense_id}`] ?? {}),
    }

    return {
      type: 'row',
      section: 'Expense Classification',
      sn: salesRows.length + index + 1,
      key: `expense-${expense.expense_id}`,
      description: `${expense.description || `Expense #${expense.expense_id}`} | ${expense.category || 'Expense'} | ${expense.expense_id}`,
      amount: Number(expense.amount ?? 0),
      note: decision.accountantNote ?? '',
      systemNote: `${formatStatusLabel(decision.classification)} | ${decision.includeInAudit ? 'Audit included' : 'Internal only'}${decision.reason ? ` | ${decision.reason}` : ''}`,
      classification: decision.classification,
      includeInAudit: decision.includeInAudit,
    }
  })

  const rows = [
    { type: 'section', key: 'tax-revenue', title: 'Revenue Classification' },
    ...salesRows,
    { type: 'section', key: 'tax-expenses', title: 'Expense Classification' },
    ...expenseRows,
  ]

  const taxableRevenue = salesRows
    .filter((row) => row.classification === 'taxable')
    .reduce((total, row) => total + row.amount, 0)
  const nonTaxableRevenue = salesRows
    .filter((row) => row.classification === 'non_taxable')
    .reduce((total, row) => total + row.amount, 0)
  const deductibleExpenses = expenseRows
    .filter((row) => row.classification === 'deductible')
    .reduce((total, row) => total + row.amount, 0)
  const nonDeductibleExpenses = expenseRows
    .filter((row) => row.classification === 'non_deductible')
    .reduce((total, row) => total + row.amount, 0)
  const reviewCount = [...salesRows, ...expenseRows].filter((row) => row.classification === 'review').length
  const auditIncludedTotal = [...salesRows, ...expenseRows]
    .filter((row) => row.includeInAudit)
    .reduce((total, row) => total + row.amount, 0)

  return {
    rows,
    summary: {
      taxableRevenue,
      nonTaxableRevenue,
      deductibleExpenses,
      nonDeductibleExpenses,
      reviewCount,
      auditIncludedTotal,
      revenueCount: salesRows.length,
      expenseCount: expenseRows.length,
    },
  }
}

function mergeRows(primary, comparison) {
  const primaryRows = flattenSections(primary)
  const comparisonMap = new Map(
    flattenSections(comparison)
      .filter((item) => item.type === 'row')
      .map((row) => [row.key, row]),
  )

  return primaryRows.map((item) => {
    if (item.type !== 'row') return item
    const comparisonRow = comparisonMap.get(item.key)

    return {
      ...item,
      comparisonAmount: Number(comparisonRow?.amount ?? 0),
      variance: Number(item.amount ?? 0) - Number(comparisonRow?.amount ?? 0),
    }
  })
}

function buildMonthlyRows(reportData) {
  return (reportData?.monthly_overview ?? []).map((row) => ({
    ...row,
    revenue: Number(row.revenue ?? 0),
    expenses: Number(row.expenses ?? 0),
    profit: Number(row.profit ?? 0),
    outstanding_balance: Number(row.outstanding_balance ?? 0),
  }))
}

function filterRowsByType(rows, reportType) {
  if (reportType !== 'insurance') return rows

  const result = []
  let pendingSection = null

  rows.forEach((item) => {
    if (item.type === 'section') {
      pendingSection = item
      return
    }

    const shouldKeep = insuranceKeys.has(item.key) || item.description.toLowerCase().includes('insurance')
    if (!shouldKeep) return

    if (pendingSection) {
      result.push(pendingSection)
      pendingSection = null
    }

    result.push(item)
  })

  return result
}

function filterRowsBySections(rows, includedSections) {
  if (!includedSections?.length) return rows.filter((item) => item.type !== 'section')

  const result = []
  let activeSection = null

  rows.forEach((item) => {
    if (item.type === 'section') {
      activeSection = includedSections.includes(item.key) ? item : null
      if (activeSection) result.push(item)
      return
    }

    if (activeSection) result.push(item)
  })

  return result
}

function applyPresentationOverrides(rows, overrides, notes) {
  const nextRows = []
  let pendingSection = null

  rows.forEach((item) => {
    if (item.type === 'section') {
      pendingSection = item
      return
    }

    const override = overrides[item.key] ?? {}
    if (override.include === false) return

    if (pendingSection) {
      nextRows.push(pendingSection)
      pendingSection = null
    }

    nextRows.push({
      ...item,
      description: override.description?.trim() ? override.description : item.description,
      amount: override.amount === '' || override.amount == null ? item.amount : Number(override.amount),
      note: notes[item.key] ?? item.note ?? '',
    })
  })

  return nextRows
}

function buildSnapshotItems(primary, comparison, reportType, taxReviewSummary = null) {
  const primarySummary = primary?.summary ?? {}
  const comparisonSummary = comparison?.summary ?? {}
  const variance = Number(primarySummary.net_operating ?? 0) - Number(comparisonSummary.net_operating ?? 0)

  if (reportType === 'tax_review') {
    return [
      ['Taxable Revenue', formatMoney(taxReviewSummary?.taxableRevenue), 'Visible revenue marked for statutory declaration'],
      ['Non-taxable Revenue', formatMoney(taxReviewSummary?.nonTaxableRevenue), 'Visible revenue marked exempt or out of scope'],
      ['Deductible Expenses', formatMoney(taxReviewSummary?.deductibleExpenses), 'Visible expenses included in the working tax treatment'],
      ['Needs Review', String(taxReviewSummary?.reviewCount ?? 0), 'Entries still awaiting accountant clarification'],
    ]
  }

  if (reportType === 'insurance') {
    return [
      ['Insurance Pending', formatMoney(primarySummary.insurance_pending), 'Claims still awaiting settlement'],
      ['Outstanding Balance', formatMoney(primarySummary.outstanding_balance), 'Customer exposure still open'],
      ['Collections', formatMoney(primarySummary.total_collections), 'Total recognized collections'],
      ['Gross Billed', formatMoney(primarySummary.gross_billed), 'Total billed value for the selected month'],
    ]
  }

  if (reportType === 'comparison') {
    return [
      ['Primary Profit', formatMoney(primarySummary.net_operating), primary?.month_label ?? 'Selected month'],
      ['Comparison Profit', formatMoney(comparisonSummary.net_operating), comparison?.month_label ?? 'Comparison month'],
      ['Profit Variance', formatSignedMoney(variance), 'Difference between primary and comparison'],
      ['Outstanding', formatMoney(primarySummary.outstanding_balance), 'Outstanding balance on the primary scope'],
    ]
  }

  return [
    ['Prepared For', primary?.branch_name ?? 'Branch', primary?.month_label ?? 'Selected month'],
    ['Report Type', reportTypeOptions.find((option) => option.value === reportType)?.title ?? 'Report', 'Current generator mode'],
    ['Comparison', comparison ? `${comparison.branch_name} | ${comparison.month_label}` : 'Not selected', 'Comparison scope'],
    ['Monthly Profit', formatMoney(primarySummary.net_operating), 'Revenue less operating expenses'],
  ]
}

function buildSummaryCards(primary, comparison, reportType, taxReviewSummary = null) {
  const primarySummary = primary?.summary ?? {}
  const comparisonSummary = comparison?.summary ?? {}
  const variance = Number(primarySummary.net_operating ?? 0) - Number(comparisonSummary.net_operating ?? 0)

  if (reportType === 'tax_review') {
    return [
      ['Taxable Revenue', taxReviewSummary?.taxableRevenue, 'Revenue classified for declaration', 'seen', 'money'],
      ['Non-taxable Revenue', taxReviewSummary?.nonTaxableRevenue, 'Revenue marked exempt or out of scope', 'today', 'shield'],
      ['Deductible Expenses', taxReviewSummary?.deductibleExpenses, 'Expenses marked deductible', 'total', 'finance'],
      ['Audit Pack Value', taxReviewSummary?.auditIncludedTotal, 'Entries currently included in the audit-facing pack', 'pending', 'receipt'],
    ]
  }

  if (reportType === 'insurance') {
    return [
      ['Insurance Pending', primarySummary.insurance_pending, 'Claims still pending', 'pending', 'shield'],
      ['Outstanding Balance', primarySummary.outstanding_balance, 'Open customer balances', 'today', 'receipt'],
      ['Gross Billed', primarySummary.gross_billed, 'Monthly billed value', 'total', 'money'],
      ['Collections', primarySummary.total_collections, 'Recognized collections', 'seen', 'finance'],
    ]
  }

  if (reportType === 'comparison') {
    return [
      ['Primary Profit', primarySummary.net_operating, `${primary?.month_label ?? 'Selected month'} operating position`, 'today', 'finance'],
      ['Comparison Profit', comparisonSummary.net_operating, `${comparison?.month_label ?? 'Comparison month'} operating position`, 'seen', 'money'],
      ['Profit Variance', variance, 'Primary less comparison', variance < 0 ? 'pending' : 'total', 'trend'],
      ['Expenses', primarySummary.total_expenses, 'Operating costs in the primary month', 'pending', 'alert'],
    ]
  }

  return [
    ['Gross Billed', primarySummary.gross_billed, `${primary?.branch_name ?? 'Branch'} | ${primary?.month_label ?? ''}`, 'total', 'receipt'],
    ['Revenue', primarySummary.total_collections, 'Cash, digital, bank, and paid insurance recovery', 'seen', 'money'],
    ['Expenses', primarySummary.total_expenses, 'Operating costs posted in the selected month', 'pending', 'alert'],
    ['Profit', primarySummary.net_operating, 'Revenue less operating expenses', 'today', 'finance'],
  ]
}

function createReportHtml({
  primary,
  comparison,
  rows,
  monthlyRows,
  reportType,
  showComparison,
  showMonthlyOverview,
  taxReviewSummary,
  includeNotes,
}) {
  const comparisonLabel = comparison
    ? `${comparison.branch_name} | ${comparison.month_label}`
    : 'Not selected'
  const title = reportTypeOptions.find((option) => option.value === reportType)?.title ?? 'Financial Report'
  const summaryItems = buildSnapshotItems(primary, comparison, reportType, taxReviewSummary)
  const summaryHtml = summaryItems.map(([label, value, note]) => `
    <div class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(note)}</p>
    </div>
  `).join('')

  const monthlyRowsHtml = monthlyRows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(row.month_label)}</td>
      <td>${escapeHtml(formatMoney(row.revenue))}</td>
      <td>${escapeHtml(formatMoney(row.expenses))}</td>
      <td>${escapeHtml(formatMoney(row.profit))}</td>
      <td>${escapeHtml(formatMoney(row.outstanding_balance))}</td>
    </tr>
  `).join('')

  const showNotesColumn = includeNotes && rows.some((item) => item.type === 'row' && String(item.note ?? '').trim() !== '')
  const rowsHtml = rows.map((item) => {
    if (item.type === 'section') {
      return `<tr class="section-row"><td colspan="${showComparison ? (showNotesColumn ? 6 : 5) : (showNotesColumn ? 4 : 3)}">${escapeHtml(item.title)}</td></tr>`
    }

    if (showComparison) {
      return `
        <tr>
          <td>${item.sn}</td>
          <td>${escapeHtml(item.description)}</td>
          <td>${escapeHtml(formatMoney(item.amount))}</td>
          <td>${escapeHtml(formatMoney(item.comparisonAmount))}</td>
          <td>${escapeHtml(formatSignedMoney(item.variance))}</td>
          ${showNotesColumn ? `<td>${escapeHtml(item.note)}</td>` : ''}
        </tr>
      `
    }

    return `
      <tr>
        <td>${item.sn}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(formatMoney(item.amount))}</td>
        ${showNotesColumn ? `<td>${escapeHtml(item.note)}</td>` : ''}
      </tr>
    `
  }).join('')

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: Calibri, Arial, sans-serif; margin: 24px; color: #122033; }
        h1, h2, h3, p { margin: 0; }
        .header { text-align: center; margin-bottom: 20px; }
        .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0 24px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
        .meta-card, .summary-card { border: 1px solid #c7d7e6; border-radius: 12px; padding: 12px 14px; }
        .summary-card strong { display: block; margin: 8px 0 4px; font-size: 18px; }
        .summary-card span, .summary-card p { color: #516072; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th, td { border: 1px solid #c7d7e6; padding: 8px 10px; vertical-align: top; font-size: 12px; }
        th { background: #eaf3fb; text-align: left; }
        .section-row td { background: #d6e9f8; font-weight: 700; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>BEALET OPTICAL CENTER</h1>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(reportType === 'tax_review' ? 'Current finance extract scope' : `${primary?.branch_name ?? 'Branch'} | ${primary?.month_label ?? ''}`)}</p>
      </div>

      <div class="meta">
        <div class="meta-card"><strong>Primary Scope</strong><p>${escapeHtml(reportType === 'tax_review' ? 'Current finance extract scope' : primary?.branch_name ?? '')}</p><p>${escapeHtml(reportType === 'tax_review' ? 'Revenue and expense classification' : primary?.month_label ?? '')}</p></div>
        <div class="meta-card"><strong>Comparison Scope</strong><p>${escapeHtml(comparisonLabel)}</p></div>
        <div class="meta-card"><strong>Report Type</strong><p>${escapeHtml(title)}</p></div>
        <div class="meta-card"><strong>Export Mode</strong><p>${showComparison ? 'Comparison included' : 'Standalone values only'}</p></div>
      </div>

      <div class="summary">${summaryHtml}</div>

      ${showMonthlyOverview ? `
      <table>
        <thead>
          <tr>
            <th>SN</th>
            <th>Month</th>
            <th>Revenue</th>
            <th>Expenses</th>
            <th>Profit</th>
            <th>Outstanding</th>
          </tr>
        </thead>
        <tbody>${monthlyRowsHtml}</tbody>
      </table>
      ` : ''}

      <table>
        <thead>
          ${showComparison ? `
          <tr>
            <th>SN</th>
            <th>Description</th>
            <th>Primary Amount</th>
            <th>Comparison Amount</th>
            <th>Variance</th>
            ${showNotesColumn ? '<th>Notes</th>' : ''}
          </tr>
          ` : `
          <tr>
            <th>SN</th>
            <th>Description</th>
            <th>Amount</th>
            ${showNotesColumn ? '<th>Notes</th>' : ''}
          </tr>
          `}
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body>
  </html>`
}

export default function ReportsSection({ apiFetch, token, session, selectedBranchId, financeSales, financeExpenses }) {
  const isAccountant = session?.role === 'accountant'
  const isManager = session?.role === 'manager'
  const isExecutive = ['ceo', 'director'].includes(session?.role)
  const canCompareBranches = Boolean(session?.is_admin || ['accountant', 'manager', 'ceo'].includes(session?.role))
  const defaultBranchId = canCompareBranches ? selectedBranchId : session?.branch_id
  const [filters, setFilters] = useState({
    branch_id: String(defaultBranchId ?? 1),
    month: currentMonth(),
    comparison_branch_id: '',
    comparison_month: currentMonth(),
    report_type: 'standalone',
  })
  const [reportData, setReportData] = useState(null)
  const [reportError, setReportError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [rowNotes, setRowNotes] = useState(() => readReportRowNotes())
  const [rowOverrides, setRowOverrides] = useState(() => readReportRowOverrides())
  const [reportConfig, setReportConfig] = useState({
    includedSections: [],
    includeNotes: false,
    includeMonthlyOverview: true,
    includeComparison: true,
  })
  const [previewConfig, setPreviewConfig] = useState(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editorDraft, setEditorDraft] = useState({})

  useEffect(() => {
    if (!canCompareBranches) {
      setFilters((current) => {
        const nextBranchId = String(session?.branch_id ?? 1)
        if (current.branch_id === nextBranchId) {
          return current
        }

        return {
          ...current,
          branch_id: nextBranchId,
        }
      })
    }
  }, [canCompareBranches, session?.branch_id])

  useEffect(() => {
    if (!canCompareBranches || selectedBranchId == null) return

    setFilters((current) => {
      const nextBranchId = String(selectedBranchId)
      if (current.branch_id === nextBranchId) {
        return current
      }

      return {
        ...current,
        branch_id: nextBranchId,
      }
    })
  }, [canCompareBranches, selectedBranchId])

  useEffect(() => {
    let cancelled = false

    async function loadReport() {
      if (!token || filters.report_type === 'tax_review') return
      setIsLoading(true)
      setReportError('')
      try {
        const params = new URLSearchParams({
          branch_id: filters.branch_id,
          month: filters.month,
        })
        if (filters.comparison_branch_id) params.set('comparison_branch_id', filters.comparison_branch_id)
        if (filters.comparison_month) params.set('comparison_month', filters.comparison_month)
        const response = await apiFetch(`/finance/monthly-report?${params.toString()}`, { token })
        if (!cancelled) {
          setReportData(response)
          if (!filters.comparison_month && response.available_months?.[0]?.value) {
            setFilters((current) => ({ ...current, comparison_month: current.month }))
          }
        }
      } catch (error) {
        if (!cancelled) setReportError(error.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadReport()
    return () => {
      cancelled = true
    }
  }, [apiFetch, filters.branch_id, filters.month, filters.comparison_branch_id, filters.comparison_month, filters.report_type, token])

  const primary = reportData?.primary
  const comparison = reportData?.comparison
  const reportType = filters.report_type
  const taxReviewPayload = useMemo(() => buildTaxReviewPayload(financeSales, financeExpenses), [financeExpenses, financeSales])
  const baseRows = useMemo(() => mergeRows(primary, comparison), [primary, comparison])
  const sourceRows = useMemo(() => (
    reportType === 'tax_review'
      ? taxReviewPayload.rows
      : filterRowsByType(baseRows, reportType)
  ), [baseRows, reportType, taxReviewPayload.rows])
  const monthlyRows = useMemo(() => buildMonthlyRows(reportData), [reportData])
  const hasComparison = Boolean(filters.comparison_branch_id && comparison)
  const showComparison = reportType !== 'tax_review' && (reportType === 'comparison' || (reportType === 'all' && hasComparison))
  const showMonthlyOverview = reportType === 'all'
  const reportMode = reportTypeOptions.find((option) => option.value === reportType) ?? reportTypeOptions[0]
  const summaryCards = buildSummaryCards(primary, comparison, reportType, taxReviewPayload.summary)
  const snapshotItems = buildSnapshotItems(primary, comparison, reportType, taxReviewPayload.summary)
  const monthOptions = reportData?.available_months ?? [{ value: currentMonth(), label: currentMonth() }]
  const branchOptions = reportData?.branches ?? [
    { id: 0, name: 'Merged Branches' },
    { id: 1, name: 'Labadi' },
    { id: 2, name: 'Madina' },
  ]
  const sectionOptions = useMemo(() => sourceRows
    .filter((item) => item.type === 'section')
    .map((item) => ({ key: item.key, title: item.title })), [sourceRows])
  const configuredRows = useMemo(() => filterRowsBySections(sourceRows, reportConfig.includedSections), [reportConfig.includedSections, sourceRows])
  const configuredRowsWithNotes = useMemo(
    () => applyPresentationOverrides(configuredRows, rowOverrides, rowNotes),
    [configuredRows, rowNotes, rowOverrides],
  )
  const previewRows = useMemo(() => {
    if (!previewConfig) return []

    return applyPresentationOverrides(
      filterRowsBySections(sourceRows, previewConfig.includedSections),
      rowOverrides,
      rowNotes,
    )
  }, [previewConfig, rowNotes, rowOverrides, sourceRows])
  const editableRows = useMemo(() => sourceRows.filter((item) => item.type === 'row'), [sourceRows])
  const previewShowComparison = showComparison && (previewConfig?.includeComparison ?? true)
  const previewShowMonthlyOverview = showMonthlyOverview && (previewConfig?.includeMonthlyOverview ?? true)
  const hasVisibleRows = configuredRowsWithNotes.some((item) => item.type === 'row')
  const hasPreviewRows = previewRows.some((item) => item.type === 'row')

  useEffect(() => {
    const nextSections = sectionOptions.map((section) => section.key)
    setReportConfig((current) => ({
      ...current,
      includedSections: current.includedSections.length
        ? current.includedSections.filter((key) => nextSections.includes(key))
        : nextSections,
      includeMonthlyOverview: showMonthlyOverview,
      includeComparison: showComparison,
    }))
    setPreviewConfig(null)
  }, [sectionOptions, showComparison, showMonthlyOverview, reportType, filters.branch_id, filters.month, filters.comparison_branch_id, filters.comparison_month])

  useEffect(() => {
    writeReportRowNotes(rowNotes)
  }, [rowNotes])

  useEffect(() => {
    writeReportRowOverrides(rowOverrides)
  }, [rowOverrides])

  function updateFilter(key, value) {
    setFilters((current) => {
      const next = { ...current, [key]: value }

      if (key === 'comparison_branch_id' && !value) {
        next.comparison_month = current.month
      }

      if (key === 'month' && !current.comparison_branch_id) {
        next.comparison_month = value
      }

      return next
    })
  }

  function toggleSection(sectionKey) {
    setReportConfig((current) => ({
      ...current,
      includedSections: current.includedSections.includes(sectionKey)
        ? current.includedSections.filter((key) => key !== sectionKey)
        : [...current.includedSections, sectionKey],
    }))
  }

  function updateRowNote(rowKey, note) {
    setRowNotes((current) => ({
      ...current,
      [rowKey]: note,
    }))
  }

  function openEditor() {
    const nextDraft = {}
    editableRows.forEach((row) => {
      const override = rowOverrides[row.key] ?? {}
      nextDraft[row.key] = {
        include: override.include !== false,
        description: override.description ?? row.description,
        amount: override.amount ?? row.amount,
        note: rowNotes[row.key] ?? '',
        section: row.section,
      }
    })
    setEditorDraft(nextDraft)
    setIsEditorOpen(true)
  }

  function updateEditorDraft(rowKey, field, value) {
    setEditorDraft((current) => ({
      ...current,
      [rowKey]: {
        ...current[rowKey],
        [field]: value,
      },
    }))
  }

  function saveEditorDraft() {
    const nextOverrides = {}
    const nextNotes = {}

    editableRows.forEach((row) => {
      const draft = editorDraft[row.key]
      if (!draft) return

      nextOverrides[row.key] = {
        include: draft.include !== false,
        description: draft.description,
        amount: draft.amount,
      }

      if (String(draft.note ?? '').trim()) {
        nextNotes[row.key] = draft.note
      }
    })

    setRowOverrides(nextOverrides)
    setRowNotes(nextNotes)
    setIsEditorOpen(false)
    setPreviewConfig(null)
  }

  function previewReport() {
    setPreviewConfig({
      includedSections: [...reportConfig.includedSections],
      includeNotes: reportConfig.includeNotes,
      includeMonthlyOverview: reportConfig.includeMonthlyOverview,
      includeComparison: reportConfig.includeComparison,
    })
    setIsPreviewOpen(true)
  }

  function exportExcel() {
    const html = createReportHtml({
      primary,
      comparison,
      rows: previewRows,
      monthlyRows,
      reportType,
      showComparison: previewShowComparison,
      showMonthlyOverview: previewShowMonthlyOverview,
      taxReviewSummary: taxReviewPayload.summary,
      includeNotes: previewConfig?.includeNotes ?? false,
    })
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `monthly-report-${slugify(primary?.branch_name)}-${slugify(reportType)}-${primary?.month ?? currentMonth()}.xls`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  function exportPdf() {
    const html = createReportHtml({
      primary,
      comparison,
      rows: previewRows,
      monthlyRows,
      reportType,
      showComparison: previewShowComparison,
      showMonthlyOverview: previewShowMonthlyOverview,
      taxReviewSummary: taxReviewPayload.summary,
      includeNotes: previewConfig?.includeNotes ?? false,
    })
    const printWindow = window.open('', '_blank', 'width=1200,height=900')
    if (!printWindow) return
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.document.title = `${reportMode.title} - ${primary?.branch_name ?? 'Branch'}`
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 300)
  }

  const exportBlocked = reportType === 'tax_review'
    ? !hasPreviewRows
    : !primary || isLoading || !hasPreviewRows || (reportType === 'comparison' && !hasComparison)

  const submissionPayload = previewConfig && primary ? {
    title: `${reportMode.title} - ${primary?.branch_name ?? 'Branch'} - ${primary?.month_label ?? filters.month}`,
    report_type: reportType,
    month: primary?.month ?? filters.month,
    comparison_branch_id: filters.comparison_branch_id || null,
    comparison_month: filters.comparison_month || null,
    reportMode,
    primary,
    comparison,
    rows: previewRows,
    monthlyRows: previewShowMonthlyOverview ? monthlyRows : [],
    showComparison: previewShowComparison,
    showMonthlyOverview: previewShowMonthlyOverview,
    snapshotItems,
    includeNotes: previewConfig.includeNotes,
  } : null

  if (isExecutive) {
    return (
      <ReportWorkflowSection
        apiFetch={apiFetch}
        token={token}
        session={session}
        selectedBranchId={selectedBranchId}
      />
    )
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h3>{isManager ? 'Report generator and validation workspace' : 'Accountant report generator'}</h3>
          <p className="header-copy">
            {isManager
              ? 'Build the same finance reports available to the accountant, then review and validate submitted reports from the same workspace.'
              : 'Choose the exact report you need, preview it on screen, and export the same output to PDF or Excel.'}
          </p>
        </div>
      </div>

      {reportError ? <div className="message-banner error">{reportError}</div> : null}
      {reportType === 'comparison' && !hasComparison ? (
        <div className="message-banner">Select a comparison branch to generate and export the compared report.</div>
      ) : null}
      {reportType === 'tax_review' ? (
        <div className="message-banner">
          Tax review exports use the classifications captured in the Extract workspace for the revenue and expense rows currently loaded in Finance.
        </div>
      ) : null}

      <section className="stats-grid patient-stats-grid">
        {summaryCards.map(([label, value, note, className, icon]) => (
          <StatWidget key={label} label={label} value={formatMoney(value)} note={note} icon={icon} className={className} />
        ))}
      </section>

      <div className="report-stack">
        <article className="panel report-command-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Selected Period</p>
              <h3>Statement snapshot and report controls</h3>
            </div>
            <span className="panel-tag">{reportMode.label}</span>
          </div>

          <div className="report-snapshot-bar">
            {snapshotItems.map(([label, value, note]) => (
              <div key={label} className="report-snapshot-card">
                <span>{label}</span>
                <strong>{value}</strong>
                <p>{note}</p>
              </div>
            ))}
          </div>

          <div className="report-type-grid">
            {reportTypeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={option.value === reportType ? 'report-type-card is-active' : 'report-type-card'}
                onClick={() => setFilters((current) => ({ ...current, report_type: option.value }))}
              >
                <span>{option.label}</span>
                <strong>{option.title}</strong>
                <p>{option.copy}</p>
              </button>
            ))}
          </div>

          <div className="report-toolbar-grid">
            <label>
              Primary branch
              <select
                value={filters.branch_id}
                disabled={reportType === 'tax_review' || !canCompareBranches}
                onChange={(event) => updateFilter('branch_id', event.target.value)}
              >
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>

            <label>
              Primary month
              <select
                value={filters.month}
                disabled={reportType === 'tax_review'}
                onChange={(event) => updateFilter('month', event.target.value)}
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>
            </label>

            <label>
              Comparison branch
              <select
                value={filters.comparison_branch_id}
                disabled={reportType === 'tax_review' || !canCompareBranches}
                onChange={(event) => updateFilter('comparison_branch_id', event.target.value)}
              >
                <option value="">No comparison</option>
                {branchOptions.map((branch) => (
                  <option key={`compare-${branch.id}`} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>

            <label>
              Comparison month
              <select
                value={filters.comparison_month}
                disabled={reportType === 'tax_review' || !filters.comparison_branch_id}
                onChange={(event) => updateFilter('comparison_month', event.target.value)}
              >
                {monthOptions.map((month) => (
                  <option key={`month-${month.value}`} value={month.value}>{month.label}</option>
                ))}
              </select>
            </label>

            <label>
              Report to generate
              <select
                value={filters.report_type}
                onChange={(event) => updateFilter('report_type', event.target.value)}
              >
                {reportTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.title}</option>
                ))}
              </select>
            </label>

            <article className="report-config-box">
              <span>Preview Options</span>
              <strong>Choose what appears in the report</strong>
              <div className="report-options-list">
                {showMonthlyOverview ? (
                  <label className="report-check">
                    <input
                      type="checkbox"
                      checked={reportConfig.includeMonthlyOverview}
                      onChange={(event) => setReportConfig((current) => ({ ...current, includeMonthlyOverview: event.target.checked }))}
                    />
                    <span>Include monthly overview table</span>
                  </label>
                ) : null}

                {showComparison ? (
                  <label className="report-check">
                    <input
                      type="checkbox"
                      checked={reportConfig.includeComparison}
                      onChange={(event) => setReportConfig((current) => ({ ...current, includeComparison: event.target.checked }))}
                    />
                    <span>Include comparison columns</span>
                  </label>
                ) : null}

                <label className="report-check">
                  <input
                    type="checkbox"
                    checked={reportConfig.includeNotes}
                    onChange={(event) => setReportConfig((current) => ({ ...current, includeNotes: event.target.checked }))}
                  />
                  <span>Include accountant notes in generated report</span>
                </label>
              </div>
            </article>

            <article className="report-config-box report-section-box">
              <span>Sections</span>
              <strong>Select categories to include</strong>
              <div className="report-section-list">
                {sectionOptions.map((section) => (
                  <label key={section.key} className="report-check">
                    <input
                      type="checkbox"
                      checked={reportConfig.includedSections.includes(section.key)}
                      onChange={() => toggleSection(section.key)}
                    />
                    <span>{section.title}</span>
                  </label>
                ))}
              </div>
            </article>

            <div className="report-export-box">
              <span>Preview & Export</span>
              <strong>{reportMode.title}</strong>
              <p>{previewConfig ? 'The preview modal now holds the exact version that will print, export, and route for approval.' : 'Preview the report first, then print or export the approved version.'}</p>
              <div className="filter-actions-row">
                <button type="button" className="ghost-button" disabled={!editableRows.length} onClick={openEditor}>
                  Open Report Editor
                </button>
                <button type="button" className="primary-button" disabled={!hasVisibleRows} onClick={previewReport}>
                  Preview Report
                </button>
                <button type="button" className="ghost-button" disabled={!previewConfig} onClick={() => setIsPreviewOpen(true)}>
                  Open Preview Modal
                </button>
                <button type="button" className="primary-button" disabled={exportBlocked} onClick={exportPdf}>
                  Print / Save PDF
                </button>
                <button type="button" className="ghost-button" disabled={exportBlocked} onClick={exportExcel}>
                  Export Excel
                </button>
              </div>
            </div>
          </div>
        </article>

        <article className="panel report-sheet">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{reportMode.label} Report</p>
              <h3>{previewConfig ? `${reportMode.title} Preview Ready` : reportMode.title}</h3>
            </div>
            <span className="panel-tag">{previewConfig ? 'Preview ready' : (isLoading ? 'Refreshing...' : (primary?.month_label ?? 'Ready'))}</span>
          </div>

          {previewConfig ? (
            <div className="message-banner success">
              Preview ready. Open the popup modal to inspect the final report, add notes, print, or export.
            </div>
          ) : (
            <div className="message-banner">
              Configure the sections to include, then click `Preview Report` to inspect the final report before printing or exporting.
            </div>
          )}
        </article>
      </div>

      {isAccountant ? (
        <ReportWorkflowSection
          apiFetch={apiFetch}
          token={token}
          session={session}
          selectedBranchId={selectedBranchId}
          submissionPayload={submissionPayload}
        />
      ) : null}

      {isManager ? (
        <ReportWorkflowSection
          apiFetch={apiFetch}
          token={token}
          session={session}
          selectedBranchId={selectedBranchId}
        />
      ) : null}

      {isEditorOpen ? (
        <div className="modal-overlay" onClick={() => setIsEditorOpen(false)}>
          <article className="modal-panel report-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Report Editor</p>
                <h3>Presentation-only spreadsheet editor</h3>
              </div>
              <div className="modal-actions">
                <span className="panel-tag">{editableRows.length} editable row{editableRows.length === 1 ? '' : 's'}</span>
                <button type="button" className="ghost-button" onClick={() => setIsEditorOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <p className="muted-copy">
              Changes here only affect how the report is presented. Your real finance records stay untouched.
            </p>

            <div className="table-shell report-editor-shell">
              <table className="portal-table report-editor-table">
                <thead>
                  <tr>
                    <th>Include</th>
                    <th>Section</th>
                    <th>Description</th>
                    <th>Display Amount</th>
                    <th>Accountant Note</th>
                  </tr>
                </thead>
                <tbody>
                  {editableRows.map((row) => {
                    const draft = editorDraft[row.key] ?? {
                      include: true,
                      description: row.description,
                      amount: row.amount,
                      note: '',
                      section: row.section,
                    }

                    return (
                      <tr key={`editor-${row.key}`}>
                        <td>
                          <label className="report-editor-check">
                            <input
                              type="checkbox"
                              checked={draft.include !== false}
                              onChange={(event) => updateEditorDraft(row.key, 'include', event.target.checked)}
                            />
                            <span>{draft.include !== false ? 'Show' : 'Hide'}</span>
                          </label>
                        </td>
                        <td>{draft.section}</td>
                        <td>
                          <textarea
                            className="report-editor-textarea"
                            rows="2"
                            value={draft.description}
                            onChange={(event) => updateEditorDraft(row.key, 'description', event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="report-editor-input"
                            type="number"
                            step="0.01"
                            value={draft.amount}
                            onChange={(event) => updateEditorDraft(row.key, 'amount', event.target.value)}
                          />
                        </td>
                        <td>
                          <textarea
                            className="report-editor-textarea"
                            rows="2"
                            value={draft.note}
                            onChange={(event) => updateEditorDraft(row.key, 'note', event.target.value)}
                            placeholder="Optional presentation note"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="filter-actions-row">
              <button type="button" className="ghost-button" onClick={() => setIsEditorOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={saveEditorDraft}>
                Save Presentation Edits
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {previewConfig && isPreviewOpen ? (
        <div className="modal-overlay" onClick={() => setIsPreviewOpen(false)}>
          <article className="modal-panel report-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{reportMode.label} Preview</p>
                <h3>{reportMode.title}</h3>
              </div>
              <div className="modal-actions">
                <span className="panel-tag">{reportType === 'tax_review' ? 'Finance extract scope' : `${primary?.branch_name ?? 'Branch'} | ${primary?.month_label ?? ''}`}</span>
                <button type="button" className="ghost-button" onClick={exportPdf} disabled={exportBlocked}>
                  Print / Save PDF
                </button>
                <button type="button" className="ghost-button" onClick={exportExcel} disabled={exportBlocked}>
                  Export Excel
                </button>
                <button type="button" className="ghost-button" onClick={() => setIsPreviewOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <ReportPreviewContent
              comparison={comparison}
              hasPreviewRows={hasPreviewRows}
              monthlyRows={monthlyRows}
              previewRows={previewRows}
              previewShowComparison={previewShowComparison}
              previewShowMonthlyOverview={previewShowMonthlyOverview}
              primary={primary}
              reportMode={reportMode}
              reportType={reportType}
              rowNotes={rowNotes}
              snapshotItems={snapshotItems}
              updateRowNote={updateRowNote}
            />
          </article>
        </div>
      ) : null}
    </section>
  )
}

function ReportPreviewContent({
  comparison,
  hasPreviewRows,
  monthlyRows,
  previewRows,
  previewShowComparison,
  previewShowMonthlyOverview,
  primary,
  reportMode,
  reportType,
  rowNotes,
  snapshotItems,
  updateRowNote,
}) {
  return (
    <>
      {previewShowMonthlyOverview ? (
        <article className="panel report-sheet">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Monthly Overview</p>
              <h3>Revenue, expenses, and profit by month</h3>
            </div>
            <span className="panel-tag">{monthlyRows.length} month{monthlyRows.length === 1 ? '' : 's'}</span>
          </div>

          <div className="table-shell">
            <table className="portal-table report-table report-monthly-table">
              <thead>
                <tr>
                  <th>SN</th>
                  <th>Month</th>
                  <th>Revenue</th>
                  <th>Expenses</th>
                  <th>Profit</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.length ? monthlyRows.map((row, index) => (
                  <tr key={row.month}>
                    <td>{index + 1}</td>
                    <td>{row.month_label}</td>
                    <td>{formatMoney(row.revenue)}</td>
                    <td>{formatMoney(row.expenses)}</td>
                    <td className={row.profit < 0 ? 'report-negative' : 'report-positive'}>{formatMoney(row.profit)}</td>
                    <td>{formatMoney(row.outstanding_balance)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="6">No monthly report data is available yet for this branch.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      <article className="panel report-sheet">
        <div className="report-page-header">
          <strong>BEALET OPTICAL CENTER</strong>
          <span>{reportMode.title}</span>
          <span>{reportType === 'tax_review' ? 'Current finance extract scope' : `${primary?.branch_name ?? 'Branch'} | ${primary?.month_label ?? ''}`}</span>
        </div>

        <div className="report-summary-grid">
          {snapshotItems.map(([label, value, note]) => (
            <div key={label} className="report-summary-card">
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </div>
          ))}
        </div>

        <div className="table-shell">
          <table className={previewShowComparison ? 'portal-table report-table report-detail-table' : 'portal-table report-table report-simple-table'}>
            <thead>
              <tr>
                <th>SN</th>
                <th>Description</th>
                <th>{previewShowComparison ? `${primary?.branch_name ?? 'Primary'} Amount` : 'Amount'}</th>
                {previewShowComparison ? <th>{comparison?.branch_name ?? 'Comparison'} Amount</th> : null}
                {previewShowComparison ? <th>Variance</th> : null}
                <th>Accountant Note</th>
              </tr>
            </thead>
            <tbody>
              {hasPreviewRows ? previewRows.map((item) => item.type === 'section' ? (
                <tr key={item.key} className="report-section-row">
                  <td colSpan={previewShowComparison ? 6 : 4}>{item.title}</td>
                </tr>
              ) : (
                <tr key={item.key}>
                  <td>{item.sn}</td>
                  <td>
                    <div className="report-row-copy">
                      <strong>{item.description}</strong>
                      {item.systemNote ? <small>{item.systemNote}</small> : null}
                    </div>
                  </td>
                  <td>{formatMoney(item.amount)}</td>
                  {previewShowComparison ? <td>{formatMoney(item.comparisonAmount)}</td> : null}
                  {previewShowComparison ? <td className={item.variance < 0 ? 'report-negative' : 'report-positive'}>{formatSignedMoney(item.variance)}</td> : null}
                  <td>
                    <textarea
                      className="report-note-input"
                      rows="2"
                      value={rowNotes[item.key] ?? ''}
                      onChange={(event) => updateRowNote(item.key, event.target.value)}
                      placeholder="Optional accountant note"
                    />
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={previewShowComparison ? 6 : 4}>
                    No report rows are available for the current preview selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </>
  )
}
