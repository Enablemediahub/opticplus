import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx-js-style/dist/xlsx.min.js'
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

function isPayrollProcessedSalaryExpense(expense) {
  const category = String(expense.category ?? '').toLowerCase()
  const description = String(expense.description ?? '').toLowerCase()
  return category.includes('payroll') || description.includes('payroll')
}

function sanitizeNumber(value) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function getExtractRowYear(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.getFullYear()
}

function getExtractRowMonthIndex(value, fallbackYear = null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  if (fallbackYear != null && date.getFullYear() !== Number(fallbackYear)) return null
  return date.getMonth()
}

function getWorkbookYear(rows) {
  const years = rows
    .map((row) => getExtractRowYear(row.date))
    .filter((year) => year != null)

  return years.length ? Math.max(...years) : new Date().getFullYear()
}

function workbookCellAddress(rowIndex, columnIndex) {
  return XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })
}

function cloneWorkbookStyle(style) {
  return JSON.parse(JSON.stringify(style))
}

const WORKBOOK_STYLES = {
  title: {
    font: { bold: true, sz: 16, color: { rgb: '102033' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { patternType: 'solid', fgColor: { rgb: 'EAF3FB' } },
    border: {
      top: { style: 'thin', color: { rgb: 'C7D7E6' } },
      bottom: { style: 'thin', color: { rgb: 'C7D7E6' } },
      left: { style: 'thin', color: { rgb: 'C7D7E6' } },
      right: { style: 'thin', color: { rgb: 'C7D7E6' } },
    },
  },
  subtitle: {
    font: { italic: true, sz: 11, color: { rgb: '516072' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  header: {
    font: { bold: true, sz: 10, color: { rgb: '102033' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    fill: { patternType: 'solid', fgColor: { rgb: 'DCEBF7' } },
    border: {
      top: { style: 'thin', color: { rgb: 'C7D7E6' } },
      bottom: { style: 'thin', color: { rgb: 'C7D7E6' } },
      left: { style: 'thin', color: { rgb: 'C7D7E6' } },
      right: { style: 'thin', color: { rgb: 'C7D7E6' } },
    },
  },
  section: {
    font: { bold: true, sz: 12, color: { rgb: '102033' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F5FAFE' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  dataText: {
    alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'D7E1EA' } },
      bottom: { style: 'thin', color: { rgb: 'D7E1EA' } },
      left: { style: 'thin', color: { rgb: 'D7E1EA' } },
      right: { style: 'thin', color: { rgb: 'D7E1EA' } },
    },
  },
  dataNumber: {
    numFmt: '#,##0.00',
    alignment: { horizontal: 'right', vertical: 'top' },
    border: {
      top: { style: 'thin', color: { rgb: 'D7E1EA' } },
      bottom: { style: 'thin', color: { rgb: 'D7E1EA' } },
      left: { style: 'thin', color: { rgb: 'D7E1EA' } },
      right: { style: 'thin', color: { rgb: 'D7E1EA' } },
    },
  },
  percent: {
    numFmt: '0.0%',
    alignment: { horizontal: 'right', vertical: 'top' },
    border: {
      top: { style: 'thin', color: { rgb: 'D7E1EA' } },
      bottom: { style: 'thin', color: { rgb: 'D7E1EA' } },
      left: { style: 'thin', color: { rgb: 'D7E1EA' } },
      right: { style: 'thin', color: { rgb: 'D7E1EA' } },
    },
  },
  totalLabel: {
    font: { bold: true },
    fill: { patternType: 'solid', fgColor: { rgb: 'EAF3FB' } },
    border: {
      top: { style: 'thin', color: { rgb: 'B7CFE2' } },
      bottom: { style: 'thin', color: { rgb: 'B7CFE2' } },
      left: { style: 'thin', color: { rgb: 'B7CFE2' } },
      right: { style: 'thin', color: { rgb: 'B7CFE2' } },
    },
  },
  total: {
    font: { bold: true },
    fill: { patternType: 'solid', fgColor: { rgb: 'F4F9FD' } },
    numFmt: '#,##0.00',
    alignment: { horizontal: 'right', vertical: 'top' },
    border: {
      top: { style: 'thin', color: { rgb: 'B7CFE2' } },
      bottom: { style: 'thin', color: { rgb: 'B7CFE2' } },
      left: { style: 'thin', color: { rgb: 'B7CFE2' } },
      right: { style: 'thin', color: { rgb: 'B7CFE2' } },
    },
  },
}

function setWorkbookCell(worksheet, rowIndex, columnIndex, style, value) {
  const address = workbookCellAddress(rowIndex, columnIndex)
  const isNumeric = typeof value === 'number' && Number.isFinite(value)
  worksheet[address] = worksheet[address] ?? {}
  worksheet[address].t = isNumeric ? 'n' : 's'
  worksheet[address].v = isNumeric ? value : String(value ?? '')
  worksheet[address].s = cloneWorkbookStyle(style)
}

function sheetSafeName(value) {
  return String(value ?? 'Extract')
    .replace(/[\\/?*\[\]:]/g, ' ')
    .trim()
    .slice(0, 31) || 'Extract'
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'extract'
}

function formatWorkbookDate(value) {
  if (!value) return 'No date'
  return new Date(value).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
}

function buildExtractWorkbookSheets({ companyName, branchName, preparedAt, taxableRevenue, nonTaxableRevenue, deductibleExpenses, nonDeductibleExpenses, thresholdHeadroom, salaryDeclaredTotal, salaryCoverage, auditIncludedTotal, reviewCount, revenueRows, expenseRows }) {
  const allRows = [...revenueRows, ...expenseRows]
  const extractedYear = getWorkbookYear(allRows)
  const monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  ]

  function monthValuesFromRows(rows) {
    return monthNames.map((_, index) => rows
      .filter((row) => (getExtractRowMonthIndex(row.date, extractedYear) ?? 0) === index)
      .reduce((total, row) => total + toNumber(row.amount), 0))
  }

  function buildDetailRows(rows, prefix) {
    return rows.map((row, index) => {
      const rowMonthIndex = getExtractRowMonthIndex(row.date, extractedYear) ?? 0
      const monthlyValues = Array.from({ length: 12 }, (_, monthIndex) => (
        rowMonthIndex === monthIndex ? toNumber(row.amount) : 0
      ))

      return {
        kind: 'data',
        cells: [
          `${prefix}.${index + 1}`,
          row.label,
          ...monthlyValues,
          sumArray(monthlyValues),
        ],
      }
    })
  }

  const receiptRows = buildDetailRows(revenueRows, '1')
  const paymentRows = buildDetailRows(expenseRows, '2')
  const receiptTotals = monthValuesFromRows(revenueRows)
  const paymentTotals = monthValuesFromRows(expenseRows)
  const profitTotals = receiptTotals.map((value, index) => value - paymentTotals[index])

  const recPaymentSheet = {
    key: 'rec-payment',
    title: 'REC & PAYMENT',
    rows: [
      ['BEALET OPTICALS'],
      [`${String(branchName).toUpperCase()} REC & PAYMENT`],
      [`FINANCIAL DETAILS FOR THE PERIOD JANUARY TO DECEMBER ${extractedYear}`],
      [`PREPARED ${preparedAt}`],
      ['SN', 'DETAILS', ...monthNames.map((month) => month.slice(0, 3)), 'TOTAL'],
      ['RECEIPTS'],
      ...receiptRows.map((row) => row.cells),
      ['', 'TOTAL RECEIPTS', ...receiptTotals, sumArray(receiptTotals)],
      ['PAYMENTS'],
      ...paymentRows.map((row) => row.cells),
      ['', 'TOTAL PAYMENTS', ...paymentTotals, sumArray(paymentTotals)],
      ['', 'PROFIT / LOSS', ...profitTotals, sumArray(profitTotals)],
    ],
    columnCount: 15,
    widths: [8, 36, ...Array.from({ length: 12 }, () => 12), 14],
    freeze: { xSplit: 0, ySplit: 5, topLeftCell: 'A6', activePane: 'bottomLeft', state: 'frozen' },
  }

  const summaryRows = [
    ['BEALET OPTICALS'],
    ['AUDITOR EXTRACT WORKBOOK'],
    [`${companyName} | ${branchName}`],
    [`Prepared ${preparedAt}`],
    [''],
    ['SUMMARY METRICS'],
    ['Metric', 'Value', 'Description'],
    ['Revenue marked for filing', taxableRevenue, 'Rows currently classified for declaration'],
    ['Revenue outside filing scope', nonTaxableRevenue, 'Rows currently classified as excluded'],
    ['Expenses marked for filing', deductibleExpenses, 'Rows currently allowed in the working extract'],
    ['Expenses outside filing scope', nonDeductibleExpenses, 'Rows currently excluded from the extract'],
    ['Threshold headroom', thresholdHeadroom, 'Remaining room under the annual benchmark'],
    ['Declared salaries', salaryDeclaredTotal, 'Salary totals included in the extract'],
    ['Coverage after expenses', salaryCoverage, 'Revenue less deductible expenses'],
    ['Audit pack value', auditIncludedTotal, 'Total value currently marked for audit-facing output'],
    ['Rows needing review', reviewCount, 'Entries still awaiting confirmation'],
  ]

  return [
    {
      key: 'summary',
      title: 'Extract Summary',
      rows: summaryRows,
      columnCount: 3,
      widths: [28, 18, 56],
      freeze: { xSplit: 0, ySplit: 6, topLeftCell: 'A7', activePane: 'bottomLeft', state: 'frozen' },
    },
    recPaymentSheet,
  ]
}

function buildExtractWorkbookSheet(sheet) {
  const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows)
  worksheet['!cols'] = sheet.widths.map((wch) => ({ wch }))
  worksheet['!freeze'] = sheet.freeze
  const mergeLimit = Math.max(0, sheet.columnCount - 1)
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: mergeLimit } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: mergeLimit } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: mergeLimit } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: mergeLimit } },
  ]

  for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex += 1) {
    const row = sheet.rows[rowIndex]
    const isTitleRow = rowIndex < 4
    const isHeaderRow = rowIndex === 4
    const isSectionRow = row.length === 1 && typeof row[0] === 'string' && ['RECEIPTS', 'PAYMENTS'].includes(row[0])
    const isSummaryHeader = sheet.key === 'summary' && rowIndex === 6
    const isDataStart = sheet.key === 'summary' ? rowIndex >= 7 : rowIndex >= 6

    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const value = row[colIndex]
      const style = isTitleRow
        ? rowIndex === 0
          ? WORKBOOK_STYLES.title
          : rowIndex === 1
            ? WORKBOOK_STYLES.subtitle
            : WORKBOOK_STYLES.section
        : isHeaderRow || isSummaryHeader
          ? WORKBOOK_STYLES.header
          : rowIndex === 5 && sheet.key === 'summary'
            ? WORKBOOK_STYLES.section
            : isSectionRow
              ? WORKBOOK_STYLES.section
            : isDataStart
              ? (typeof value === 'number' && Number.isFinite(value) ? WORKBOOK_STYLES.dataNumber : WORKBOOK_STYLES.dataText)
              : WORKBOOK_STYLES.dataText

      if (sheet.key === 'summary' && rowIndex >= 7 && colIndex === 1 && typeof value === 'number') {
        setWorkbookCell(worksheet, rowIndex, colIndex, WORKBOOK_STYLES.dataNumber, value)
      } else if (sheet.key === 'summary' && rowIndex >= 7 && colIndex === 0) {
        setWorkbookCell(worksheet, rowIndex, colIndex, WORKBOOK_STYLES.dataText, value)
      } else if (sheet.key === 'rec-payment' && rowIndex >= 6 && colIndex >= 2) {
        setWorkbookCell(worksheet, rowIndex, colIndex, WORKBOOK_STYLES.dataNumber, value)
      } else {
        setWorkbookCell(worksheet, rowIndex, colIndex, style, value)
      }
    }
  }

  if (sheet.key === 'summary') {
    for (let rowIndex = 7; rowIndex < sheet.rows.length; rowIndex += 1) {
      setWorkbookCell(worksheet, rowIndex, 1, WORKBOOK_STYLES.dataNumber, sheet.rows[rowIndex][1])
    }
  }

  return worksheet
}

function extractWorkbookFileName(branchName, preparedAt) {
  return `bealet-extract-${slugify(branchName)}-${slugify(preparedAt)}.xlsx`
}

function exportExtractWorkbook(sheets, branchName, preparedAt) {
  const workbook = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const worksheet = buildExtractWorkbookSheet(sheet)
    worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: sheet.rows.length - 1, c: sheet.columnCount - 1 } }) }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetSafeName(sheet.title))
  }

  workbook.Workbook = {
    Views: [{ activeTab: 0 }],
    CalcPr: { fullCalcOnLoad: true, forceFullCalc: true },
  }

  const fileName = extractWorkbookFileName(branchName, preparedAt)

  if (typeof XLSX.writeFile === 'function') {
    XLSX.writeFile(workbook, fileName, { cellStyles: true, bookType: 'xlsx' })
    return
  }

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true })
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
    anchor.remove()
  }, 1000)
}

function createExtractAuditorReportHtml({ companyName, branchName, taxableRevenue, deductibleExpenses, thresholdHeadroom, salaryDeclaredTotal, salaryCoverage, rows, includeNotes, preparedAt }) {
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
        <p class="meta-line">Prepared ${escapeHtml(preparedAt ?? new Date().toLocaleString())}</p>
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
  const [revenueClassificationFilter, setRevenueClassificationFilter] = useState('all')
  const [expenseClassificationFilter, setExpenseClassificationFilter] = useState('all')
  const [auditorPreviewHtml, setAuditorPreviewHtml] = useState('')
  const [auditorPreviewOpen, setAuditorPreviewOpen] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [exportError, setExportError] = useState('')

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
      isSalary: isPayrollProcessedSalaryExpense(expense),
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
  const visibleRows = (activeTab === 'revenue' ? revenueRows : expenseRows).filter((row) => {
    const classificationFilter = activeTab === 'revenue' ? revenueClassificationFilter : expenseClassificationFilter
    return classificationFilter === 'all' || row.decision.classification === classificationFilter
  })
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
    setRevenueClassificationFilter('all')
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
    setExpenseClassificationFilter('all')
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

  function buildAuditorReportHtml() {
    return createExtractAuditorReportHtml({
      companyName: props.companyProfile?.company_name || 'Bealet Optical Center',
      branchName: props.branchName || 'Active branch',
      taxableRevenue,
      deductibleExpenses,
      thresholdHeadroom,
      salaryDeclaredTotal,
      salaryCoverage,
      rows: auditorRows,
      includeNotes: auditorRows.some((row) => String(row.reason ?? '').trim()),
      preparedAt: new Date().toLocaleString(),
    })
  }

  function openAuditorPreview() {
    const html = buildAuditorReportHtml()
    setAuditorPreviewHtml(html)
    setAuditorPreviewOpen(true)
    return html
  }

  function previewAuditorReport() {
    openAuditorPreview()
  }

  function printAuditorReport() {
    const html = auditorPreviewHtml || openAuditorPreview()
    setAuditorPreviewOpen(true)
    const printWindow = window.open('', '_blank', 'width=1200,height=900')
    if (!printWindow) return
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 300)
  }

  function exportAuditorExcel() {
    try {
      setExportError('')
      setExportStatus('Preparing workbook download...')
      const preparedAt = new Date().toLocaleString()
      const workbookSheets = buildExtractWorkbookSheets({
        companyName: props.companyProfile?.company_name || 'Bealet Optical Center',
        branchName: props.branchName || 'Active branch',
        preparedAt,
        taxableRevenue,
        nonTaxableRevenue,
        deductibleExpenses,
        nonDeductibleExpenses,
        thresholdHeadroom,
        salaryDeclaredTotal,
        salaryCoverage,
        auditIncludedTotal,
        reviewCount,
        revenueRows,
        expenseRows,
      })
      exportExtractWorkbook(workbookSheets, props.branchName || 'branch', preparedAt)
      setExportStatus('Workbook download started.')
    } catch (error) {
      setExportStatus('')
      const message = error instanceof Error ? error.message : 'Unable to export the workbook right now.'
      setExportError(message)
      props.setFinanceError?.(message)
    }
  }

  function closeAuditorPreview() {
    setAuditorPreviewOpen(false)
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
      {exportError ? <div className="message-banner error">{exportError}</div> : null}
      {exportStatus ? <div className="message-banner success">{exportStatus}</div> : null}
      <div className="message-banner">
        This workspace supports accountant review for lawful tax classification. Each decision is stored locally in this browser until backend persistence is added.
      </div>

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Taxable Revenue" value={currency.format(taxableRevenue)} note="Revenue currently marked for statutory declaration" icon="money" className="seen" />
        <StatWidget label="Non-taxable Revenue" value={currency.format(nonTaxableRevenue)} note="Revenue marked exempt or outside taxable scope" icon="shield" className="today" />
        <StatWidget label="Deductible Expenses" value={currency.format(deductibleExpenses)} note="Expenses currently allowed in the working tax view" icon="finance" className="total" />
        <StatWidget label="Non-deductible Expenses" value={currency.format(nonDeductibleExpenses)} note="Expenses currently held outside the working tax view" icon="alert" className="pending" />
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
            <button type="button" className="primary-button" disabled={!(revenueRows.length || expenseRows.length)} onClick={exportAuditorExcel}>
              Export Excel workbook
            </button>
          </div>

          {auditorPreviewHtml ? (
            <div className="extract-preview-banner">
              Auditor preview is ready. Open the report panel below to review the formatted extract before printing or exporting.
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
              <label>
                Tax status
                <select
                  value={revenueClassificationFilter}
                  onChange={(event) => setRevenueClassificationFilter(event.target.value)}
                >
                  <option value="all">All classifications</option>
                  {revenueStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
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
              <label>
                Expense treatment
                <select
                  value={expenseClassificationFilter}
                  onChange={(event) => setExpenseClassificationFilter(event.target.value)}
                >
                  <option value="all">All classifications</option>
                  {expenseStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
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

      {auditorPreviewOpen && auditorPreviewHtml ? (
        <div className="modal-overlay" onClick={closeAuditorPreview}>
          <article className="modal-panel extract-report-preview-modal report-preview-modal" onClick={(event) => event.stopPropagation()}>
            <header className="report-workbook-hero extract-report-preview-hero">
              <div>
                <p className="eyebrow">Auditor Report Preview</p>
                <h3>Formatted extract ready for print or export</h3>
                <p className="header-copy">
                  This preview matches the report-style presentation used elsewhere in the portal while preserving the classification and salary handling already entered in this workspace.
                </p>
              </div>
              <div className="report-workbook-actions">
                <button type="button" className="ghost-button" onClick={closeAuditorPreview}>Close</button>
                <button type="button" className="ghost-button" onClick={printAuditorReport}>Print / Save PDF</button>
                <button type="button" className="primary-button" onClick={exportAuditorExcel}>Export Excel workbook</button>
              </div>
            </header>

            <section className="report-sheet extract-report-preview-sheet">
              <div className="report-sheet-meta extract-report-preview-meta">
                <div>
                  <span>Company</span>
                  <strong>{props.companyProfile?.company_name || 'Bealet Optical Center'}</strong>
                </div>
                <div>
                  <span>Branch</span>
                  <strong>{props.branchName || 'Active branch'}</strong>
                </div>
                <div>
                  <span>Included Rows</span>
                  <strong>{auditorRows.length}</strong>
                </div>
                <div>
                  <span>Preview Mode</span>
                  <strong>Report-style view</strong>
                </div>
              </div>

              <iframe
                title="Auditor report preview"
                className="extract-report-preview-frame"
                srcDoc={auditorPreviewHtml}
              />
            </section>
          </article>
        </div>
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
