import { Fragment, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx-js-style/dist/xlsx.min.js'
import StatWidget from './StatWidget.jsx'
import ReportWorkflowSection from './ReportWorkflowSection.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const MONTHS = [
  { value: '01', short: 'JAN', long: 'JANUARY' },
  { value: '02', short: 'FEB', long: 'FEBRUARY' },
  { value: '03', short: 'MAR', long: 'MARCH' },
  { value: '04', short: 'APR', long: 'APRIL' },
  { value: '05', short: 'MAY', long: 'MAY' },
  { value: '06', short: 'JUN', long: 'JUNE' },
  { value: '07', short: 'JUL', long: 'JULY' },
  { value: '08', short: 'AUG', long: 'AUGUST' },
  { value: '09', short: 'SEP', long: 'SEPTEMBER' },
  { value: '10', short: 'OCT', long: 'OCTOBER' },
  { value: '11', short: 'NOV', long: 'NOVEMBER' },
  { value: '12', short: 'DEC', long: 'DECEMBER' },
]

const BRANCHES = [
  { id: 0, name: 'Merged Branches' },
  { id: 1, name: 'Labadi' },
  { id: 2, name: 'Madina' },
]

const COMPARISON_MODES = [
  { value: 'branch', label: 'Branch vs Branch', description: 'Compare the same months across two branches.' },
  { value: 'previous_year', label: 'Previous Year', description: 'Compare the selected months against the same months last year.' },
  { value: 'previous_period', label: 'Previous Months', description: 'Compare the selected months against the immediately previous months.' },
  { value: 'custom', label: 'Custom Scope', description: 'Compare any branch, year, and month range you choose.' },
]

const COMPARISON_METRICS = [
  { key: 'collections', label: 'Receipts / Collections', group: 'Receipts', aggregation: 'sum' },
  { key: 'payments', label: 'Payments / Expenses', group: 'Payments', aggregation: 'sum' },
  { key: 'insurance_received', label: 'Insurance Received', group: 'Insurance', aggregation: 'sum' },
  { key: 'insurance_claimed', label: 'Insurance Claimed', group: 'Insurance', aggregation: 'sum' },
  { key: 'consultation', label: 'Consultation Revenue', group: 'Receipts', aggregation: 'sum' },
  { key: 'frames', label: 'Frame Revenue', group: 'Receipts', aggregation: 'sum' },
  { key: 'lenses', label: 'Lens Revenue', group: 'Receipts', aggregation: 'sum' },
  { key: 'cases', label: 'Cases Revenue', group: 'Receipts', aggregation: 'sum' },
  { key: 'sales_reconciliation', label: 'Sales Reconciliation', group: 'Receipts', aggregation: 'sum' },
  { key: 'profit', label: 'Net Operating Position', group: 'Position', aggregation: 'sum' },
  { key: 'debtors', label: 'Trade Debtors', group: 'Position', aggregation: 'end' },
  { key: 'operating_cash', label: 'Operating Cash', group: 'Position', aggregation: 'end' },
]

const COMPARISON_METRIC_MAP = new Map(COMPARISON_METRICS.map((metric) => [metric.key, metric]))
const EXTRACT_DECISIONS_STORAGE_KEY = 'opticplus-tax-review-decisions'
const EXTRACT_SALARY_DECLARATION_STORAGE_KEY = 'opticplus-extract-salary-declarations'
const PAYROLL_DECLARATION_STORAGE_KEY = 'opticplus-payroll-declarations-v1'

function currentYear() {
  return new Date().getFullYear()
}

function monthName(value, short = false) {
  return MONTHS.find((month) => month.value === String(value).padStart(2, '0'))?.[short ? 'short' : 'long'] ?? ''
}

function monthNumber(value) {
  return String(value).padStart(2, '0')
}

function monthRange(startMonth, endMonth) {
  const start = Math.min(Number(startMonth || '1'), Number(endMonth || '12'))
  const end = Math.max(Number(startMonth || '1'), Number(endMonth || '12'))
  const range = []

  for (let month = start; month <= end; month += 1) {
    range.push(String(month).padStart(2, '0'))
  }

  return range
}

function periodLabel(year, month, short = true) {
  return `${monthName(month, short)} ${year}`
}

function buildPeriodRange(year, startMonth, endMonth) {
  const startDate = new Date(Number(year), Number(startMonth) - 1, 1)
  const endDate = new Date(Number(year), Number(endMonth) - 1, 1)
  const range = []
  const cursor = new Date(startDate)

  while (cursor <= endDate) {
    range.push({
      year: cursor.getFullYear(),
      month: String(cursor.getMonth() + 1).padStart(2, '0'),
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return range
}

function shiftPeriodRange(periods, deltaMonths) {
  if (!periods.length) return []

  const startDate = new Date(Number(periods[0].year), Number(periods[0].month) - 1, 1)
  const endDate = new Date(Number(periods[periods.length - 1].year), Number(periods[periods.length - 1].month) - 1, 1)
  startDate.setMonth(startDate.getMonth() + deltaMonths)
  endDate.setMonth(endDate.getMonth() + deltaMonths)

  const shifted = []
  const cursor = new Date(startDate)

  while (cursor <= endDate) {
    shifted.push({
      year: cursor.getFullYear(),
      month: String(cursor.getMonth() + 1).padStart(2, '0'),
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return shifted
}

function buildPeriodRangeLabel(periods) {
  if (!periods.length) return ''
  if (periods.length === 1) {
    return periodLabel(periods[0].year, periods[0].month, false)
  }

  const first = periods[0]
  const last = periods[periods.length - 1]
  return `${periodLabel(first.year, first.month)} - ${periodLabel(last.year, last.month)}`
}

function branchDisplayName(branchId) {
  return BRANCHES.find((branch) => branch.id === Number(branchId))?.name ?? `Branch ${branchId}`
}

function comparisonModeDisplayName(mode) {
  return COMPARISON_MODES.find((item) => item.value === mode)?.label ?? 'Comparison'
}

function comparisonColumnLabel(filters, comparisonState, primaryBranchId) {
  const primaryLabel = branchDisplayName(primaryBranchId)
  const comparisonBranchId = Number(comparisonState.branch_id || filters.comparison_branch_id || primaryBranchId)
  const branchName = branchDisplayName(comparisonBranchId)
  const comparisonLabel = comparisonState.mode === 'branch'
    ? branchName
    : comparisonState.mode === 'custom'
      ? `${branchName} ${comparisonModeDisplayName(comparisonState.mode)}`
      : comparisonModeDisplayName(comparisonState.mode)

  return {
    primaryLabel,
    comparisonLabel,
    comparisonBranchId,
  }
}

function toNumber(value) {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function formatMoney(value) {
  return currency.format(toNumber(value))
}

function formatDate(value) {
  if (!value) return ''
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-')
    return `${day}/${month}/${year}`
  }

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text

  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report'
}

function sheetSafeName(value) {
  return String(value ?? 'Report')
    .replace(/[\\/?*\[\]:]/g, ' ')
    .trim()
    .slice(0, 31) || 'Report'
}

function readStoredJson(key) {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(window.localStorage.getItem(key) ?? '{}')
  } catch {
    return {}
  }
}

function readExtractDecisions() {
  return readStoredJson(EXTRACT_DECISIONS_STORAGE_KEY)
}

function readExtractSalaryDeclarations() {
  return readStoredJson(EXTRACT_SALARY_DECLARATION_STORAGE_KEY)
}

function readPayrollDeclarations() {
  return readStoredJson(PAYROLL_DECLARATION_STORAGE_KEY)
}

function buildRevenueKey(record) {
  return `sales-${record.id}`
}

function buildExpenseKey(record) {
  return `expense-${record.expense_id}`
}

function isPayrollProcessedSalaryExpense(expense) {
  const category = String(expense.category ?? '').toLowerCase()
  const description = String(expense.description ?? '').toLowerCase()
  return category.includes('payroll') || description.includes('payroll')
}

function buildAuditYearMonthKey(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function buildAuditDeclaredExpenseAmount(expense, salaryDeclarations) {
  if (!isPayrollProcessedSalaryExpense(expense)) {
    return toNumber(expense.amount ?? 0)
  }

  const key = buildExpenseKey(expense)
  const salaryDeclaration = salaryDeclarations[key] ?? {}
  if (salaryDeclaration.declared !== '' && salaryDeclaration.declared != null) {
    return toNumber(salaryDeclaration.declared)
  }
  return toNumber(expense.amount ?? 0)
}

function normalizeAuditText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function payrollDeclarationKey(branchId, periodKey, employeeId) {
  return `${branchId}:${periodKey}:${employeeId}`
}

function getPayrollDeclaredSalary({ branchId, year, month, employeeId, fallback }) {
  const payrollDeclarations = readPayrollDeclarations()
  const periodKey = `${year}-${String(month).padStart(2, '0')}`
  const declaration = payrollDeclarations[payrollDeclarationKey(branchId, periodKey, employeeId)] ?? {}
  const declaredSalary = Number(declaration.declared_salary)
  return Number.isFinite(declaredSalary) && declaredSalary >= 0
    ? declaredSalary
    : toNumber(fallback)
}

function buildDeclaredSalaryRows(report, selectedMonths) {
  return (report?.salary_rows ?? []).map((row) => ({
    ...row,
    months: selectedMonths.map((month) => toNumber(row?.months?.[Number(month) - 1])),
  }))
}

function buildAuditMonthIndexMap(selectedMonths) {
  return new Map(selectedMonths.map((month, index) => [String(month).padStart(2, '0'), index]))
}

function buildAuditAdjustments({ financeSales, financeExpenses, selectedMonths }) {
  const decisions = readExtractDecisions()
  const salaryDeclarations = readExtractSalaryDeclarations()
  const monthIndexMap = buildAuditMonthIndexMap(selectedMonths)
  const revenueAdjustments = Array(selectedMonths.length).fill(0)
  const expenseAdjustments = Array(selectedMonths.length).fill(0)
  const dailyRevenueAdjustments = new Map()

  for (const record of financeSales?.records ?? []) {
    const decision = decisions[buildRevenueKey(record)] ?? {}
    if (decision.classification !== 'non_taxable' || decision.includeInAudit === false) continue

    const monthKey = buildAuditYearMonthKey(record.date)?.slice(5)
    const monthIndex = monthIndexMap.get(monthKey)
    if (monthIndex == null) continue

    const amount = toNumber(record.amount_paid ?? 0)
    revenueAdjustments[monthIndex] += amount

    const dateKey = String(record.date ?? '')
    dailyRevenueAdjustments.set(dateKey, toNumber(dailyRevenueAdjustments.get(dateKey)) + amount)
  }

  for (const expense of financeExpenses?.records ?? []) {
    const decision = decisions[buildExpenseKey(expense)] ?? {}
    if (decision.classification !== 'non_deductible' || decision.includeInAudit === false) continue

    const monthKey = buildAuditYearMonthKey(expense.date)?.slice(5)
    const monthIndex = monthIndexMap.get(monthKey)
    if (monthIndex == null) continue

    const amount = buildAuditDeclaredExpenseAmount(expense, salaryDeclarations)
    expenseAdjustments[monthIndex] += amount
  }

  return { revenueAdjustments, expenseAdjustments, dailyRevenueAdjustments }
}

function cloneAuditReport(report, selectedMonths, revenueAdjustments, expenseAdjustments, dailyRevenueAdjustments) {
  if (!report) return report

  const monthIndexMap = buildAuditMonthIndexMap(selectedMonths)
  const months = (report.months ?? []).map((month) => {
    const monthKey = month?.month != null ? String(month.month).padStart(2, '0') : null
    const monthIndex = monthKey != null ? monthIndexMap.get(monthKey) : null
    if (monthIndex == null) return { ...month }

    return {
      ...month,
      collected: toNumber(month.collected) - revenueAdjustments[monthIndex],
      expenses: toNumber(month.expenses) - expenseAdjustments[monthIndex],
    }
  })

  const daily_sales = (report.daily_sales ?? []).map((entry) => {
    const dateKey = String(entry.date ?? '')
    const adjustment = toNumber(dailyRevenueAdjustments.get(dateKey))
    if (adjustment === 0) return { ...entry }
    return {
      ...entry,
      total: toNumber(entry.total) - adjustment,
    }
  })

  const adjustmentSources = revenueAdjustments.some((value) => value !== 0)
    ? [{ label: 'ADJUSTMENTS', months: revenueAdjustments.map((value) => -value), isAuditAdjustment: true }]
    : []
  const adjustmentExpenses = expenseAdjustments.some((value) => value !== 0)
    ? [{ label: 'ADJUSTMENTS', months: expenseAdjustments.map((value) => -value), isAuditAdjustment: true }]
    : []

  return {
    ...report,
    months,
    daily_sales,
    collection_sources: [
      ...adjustmentSources,
      ...(report.collection_sources ?? []),
    ],
    expense_categories: [
      ...adjustmentExpenses,
      ...(report.expense_categories ?? []),
    ],
  }
}

function buildAuditWorkbookSheets({ reportsByKey, primaryReport, mergedReport, selectedMonths, comparisonState, primaryPeriods, comparisonPeriods, financeSales, financeExpenses }) {
  if (!primaryReport) {
    return []
  }

  const { revenueAdjustments, expenseAdjustments, dailyRevenueAdjustments } = buildAuditAdjustments({
    financeSales,
    financeExpenses,
    selectedMonths,
  })

  const adjustedPrimaryReport = cloneAuditReport(primaryReport, selectedMonths, revenueAdjustments, expenseAdjustments, dailyRevenueAdjustments)
  const adjustedMergedReport = cloneAuditReport(mergedReport ?? primaryReport, selectedMonths, revenueAdjustments, expenseAdjustments, dailyRevenueAdjustments)
  const adjustedReportsByKey = {
    ...reportsByKey,
    [`${primaryReport.branch_id}:${primaryReport.year}`]: adjustedPrimaryReport,
    [`0:${primaryReport.year}`]: adjustedMergedReport,
  }

  return buildWorkbookSheets({
    reportsByKey: adjustedReportsByKey,
    primaryReport: adjustedPrimaryReport,
    mergedReport: adjustedMergedReport,
    selectedMonths,
    comparisonState: { ...comparisonState, mode: 'previous_year' },
    primaryPeriods,
    comparisonPeriods,
  }, {
    auditMode: true,
    includeComparisonBranchSheet: false,
  })
}

function exportAuditWorkbook({ reportsByKey, primaryReport, mergedReport, selectedMonths, comparisonState, primaryPeriods, comparisonPeriods, financeSales, financeExpenses, comparisonScope }) {
  const sheets = buildAuditWorkbookSheets({
    reportsByKey,
    primaryReport,
    mergedReport,
    selectedMonths,
    comparisonState,
    primaryPeriods,
    comparisonPeriods,
    financeSales,
    financeExpenses,
  })

  exportWorkbook(sheets, primaryReport, selectedMonths, comparisonScope)
}

function buildMonthMap(report) {
  const map = new Map()
  for (const row of report?.months ?? []) {
    map.set(monthNumber(row.month), row)
  }
  return map
}

function buildSelectedMonths(report, selectedMonths) {
  const monthMap = buildMonthMap(report)
  return selectedMonths.map((month) => ({
    month,
    short: monthName(month, true),
    long: monthName(month, false),
    data: monthMap.get(month) ?? {
      month: Number(month),
      frames: 0,
      lenses: 0,
      consultation: 0,
      cases: 0,
      sales_reconciliation: 0,
      collected: 0,
      insurance_claimed: 0,
      insurance_received: 0,
      expenses: 0,
      debtors: 0,
      operating_cash: 0,
    },
  }))
}

function getMonthlyRow(report, year, month) {
  if (!report || Number(report.year) !== Number(year)) return null
  return report?.months?.[Number(month) - 1] ?? null
}

function getMetricSpec(metricKey) {
  return COMPARISON_METRIC_MAP.get(metricKey) ?? COMPARISON_METRICS[0]
}

function getMetricValueFromRow(row, metricKey) {
  if (!row) return 0

  switch (metricKey) {
    case 'collections':
      return toNumber(row.collected)
    case 'payments':
      return toNumber(row.expenses)
    case 'insurance_received':
      return toNumber(row.insurance_received)
    case 'insurance_claimed':
      return toNumber(row.insurance_claimed)
    case 'consultation':
      return toNumber(row.consultation)
    case 'frames':
      return toNumber(row.frames)
    case 'lenses':
      return toNumber(row.lenses)
    case 'cases':
      return toNumber(row.cases)
    case 'sales_reconciliation':
      return toNumber(row.sales_reconciliation)
    case 'profit':
      return toNumber(row.collected) - toNumber(row.expenses)
    case 'debtors':
      return toNumber(row.debtors)
    case 'operating_cash':
      return toNumber(row.operating_cash)
    default:
      return 0
  }
}

function getPeriodValue(report, periods, metricKey) {
  const spec = getMetricSpec(metricKey)

  if (!periods.length) return 0

  if (spec.aggregation === 'end') {
    const lastPeriod = periods[periods.length - 1]
    return getMetricValueFromRow(getMonthlyRow(report, lastPeriod.year, lastPeriod.month), metricKey)
  }

  return periods.reduce((total, period) => total + getMetricValueFromRow(getMonthlyRow(report, period.year, period.month), metricKey), 0)
}

function getPeriodPairValue(reportsByKey, branchId, period, metricKey) {
  const report = reportsByKey[`${branchId}:${period.year}`]
  return getMetricValueFromRow(getMonthlyRow(report, period.year, period.month), metricKey)
}

function getSeriesValue(reportsByKey, branchId, periods, metricKey) {
  const spec = getMetricSpec(metricKey)

  if (!periods.length) return 0

  if (spec.aggregation === 'end') {
    return getPeriodPairValue(reportsByKey, branchId, periods[periods.length - 1], metricKey)
  }

  return periods.reduce((total, period) => total + getPeriodPairValue(reportsByKey, branchId, period, metricKey), 0)
}

function buildComparisonPeriods(filters, comparisonState) {
  const primaryPeriods = buildPeriodRange(filters.year, filters.start_month, filters.end_month)

  switch (comparisonState.mode) {
    case 'previous_year':
      return buildPeriodRange(Number(filters.year) - 1, filters.start_month, filters.end_month)
    case 'previous_period':
      return shiftPeriodRange(primaryPeriods, -primaryPeriods.length)
    case 'custom':
      return buildPeriodRange(comparisonState.year, comparisonState.start_month, comparisonState.end_month)
    case 'branch':
    default:
      return primaryPeriods
  }
}

function buildComparisonWorkbookSheets({ reportsByKey, primaryBranchId, primaryPeriods, comparisonPeriods, comparisonState }) {
  const selectedMetricKeys = comparisonState.metricKeys?.length ? comparisonState.metricKeys : ['collections', 'payments', 'insurance_received', 'profit']
  const comparisonBranchId = Number(comparisonState.branch_id || primaryBranchId)
  const { primaryLabel, comparisonLabel } = comparisonColumnLabel({ comparison_branch_id: comparisonBranchId }, comparisonState, primaryBranchId)
  const comparisonSourceLabel = comparisonState.mode === 'branch'
    ? `${comparisonState.branch_name ?? 'Comparison Branch'}`
    : comparisonState.mode === 'custom'
      ? `${comparisonState.branch_name ?? 'Custom Scope'}`
      : comparisonState.mode === 'previous_year'
        ? 'Previous Year'
        : 'Previous Months'

  const overviewRows = selectedMetricKeys.map((metricKey, index) => {
    const spec = getMetricSpec(metricKey)
    const primaryTotal = getSeriesValue(reportsByKey, primaryBranchId, primaryPeriods, metricKey)
    const comparisonTotal = getSeriesValue(
      reportsByKey,
      comparisonState.mode === 'branch' || comparisonState.mode === 'custom' ? comparisonBranchId : primaryBranchId,
      comparisonPeriods,
      metricKey,
    )
    const variance = primaryTotal - comparisonTotal
    const variancePercent = comparisonTotal !== 0 ? variance / comparisonTotal : 0

    return {
      kind: 'data',
      metricKey,
      cells: [
        index + 1,
        spec.label,
        spec.group,
        primaryTotal,
        comparisonTotal,
        variance,
        variancePercent,
      ],
    }
  })

  const sheets = [
    {
      key: 'comparison-overview',
      title: 'COMPARISON OVERVIEW',
      subtitle: `${buildPeriodRangeLabel(primaryPeriods)} vs ${buildPeriodRangeLabel(comparisonPeriods)} | ${comparisonState.label}`,
      columnCount: 7,
      percentColumns: [6],
      rows: [
        { kind: 'title', cells: ['BEALET OPTICALS'] },
        { kind: 'title', cells: ['FLEXIBLE COMPARISON DASHBOARD'] },
        { kind: 'title', cells: [`${buildPeriodRangeLabel(primaryPeriods)} vs ${buildPeriodRangeLabel(comparisonPeriods)}`] },
        { kind: 'header', cells: ['SN', 'Metric', 'Group', primaryLabel, comparisonLabel, 'Variance', 'Variance %'] },
        ...overviewRows,
        {
          kind: 'total',
          cells: [
            '',
            'Selected metrics',
            '',
            overviewRows.reduce((total, row) => total + toNumber(row.cells[3]), 0),
            overviewRows.reduce((total, row) => total + toNumber(row.cells[4]), 0),
            overviewRows.reduce((total, row) => total + toNumber(row.cells[5]), 0),
            '',
          ],
        },
      ],
    },
  ]

  selectedMetricKeys.forEach((metricKey) => {
    const spec = getMetricSpec(metricKey)
    const rows = primaryPeriods.map((period, index) => {
      const comparisonPeriod = comparisonPeriods[index] ?? period
      const primaryTotal = getPeriodPairValue(reportsByKey, primaryBranchId, period, metricKey)
      const comparisonTotal = comparisonState.mode === 'branch' || comparisonState.mode === 'custom'
        ? getPeriodPairValue(reportsByKey, comparisonBranchId, comparisonPeriod, metricKey)
        : getPeriodPairValue(reportsByKey, primaryBranchId, comparisonPeriod, metricKey)
      const variance = primaryTotal - comparisonTotal
      const variancePercent = comparisonTotal !== 0 ? variance / comparisonTotal : 0

      return {
        kind: 'data',
        cells: [
          index + 1,
          periodLabel(period.year, period.month, false),
          periodLabel(comparisonPeriod.year, comparisonPeriod.month, false),
          primaryTotal,
          comparisonTotal,
          variance,
          variancePercent,
        ],
      }
    })

    rows.push({
      kind: 'total',
      cells: [
        '',
        'Total',
        comparisonState.mode === 'branch' || comparisonState.mode === 'custom' ? comparisonSourceLabel : 'Previous scope',
        getSeriesValue(reportsByKey, primaryBranchId, primaryPeriods, metricKey),
        getSeriesValue(reportsByKey, comparisonState.mode === 'branch' || comparisonState.mode === 'custom' ? comparisonBranchId : primaryBranchId, comparisonPeriods, metricKey),
        toNumber(getSeriesValue(reportsByKey, primaryBranchId, primaryPeriods, metricKey)) - toNumber(getSeriesValue(reportsByKey, comparisonState.mode === 'branch' || comparisonState.mode === 'custom' ? comparisonBranchId : primaryBranchId, comparisonPeriods, metricKey)),
        '',
      ],
    })

    sheets.push({
      key: `comparison-${metricKey}`,
      title: `COMPARISON - ${spec.label.toUpperCase()}`,
      subtitle: `${buildPeriodRangeLabel(primaryPeriods)} vs ${buildPeriodRangeLabel(comparisonPeriods)} | ${comparisonState.label}`,
      columnCount: 7,
      percentColumns: [6],
      rows: [
        { kind: 'title', cells: ['BEALET OPTICALS'] },
        { kind: 'title', cells: [spec.label.toUpperCase()] },
        { kind: 'title', cells: [`${comparisonState.label} | ${comparisonSourceLabel}`] },
        { kind: 'header', cells: ['SN', `${primaryLabel} Month`, `${comparisonLabel} Month`, primaryLabel, comparisonLabel, 'Variance', 'Variance %'] },
        ...rows,
      ],
    })
  })

  return sheets
}

function sumArray(values) {
  return (values ?? []).reduce((total, value) => total + toNumber(value), 0)
}

function sumMonthColumn(rows, index) {
  return rows.reduce((total, row) => total + toNumber(row?.months?.[index]), 0)
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 100) / 100
}

function formatPercentRatio(value) {
  return `${(toNumber(value) * 100).toFixed(1)}%`
}

function buildFinancialBudgetMetrics(actualTotal, budgetTotal, selectedMonthCount) {
  const actual = roundMoney(actualTotal)
  const budget = roundMoney(budgetTotal)
  const balance = roundMoney(budget - actual)
  const monthlyBudget = selectedMonthCount > 0 ? roundMoney(budget / selectedMonthCount) : 0
  const achieved = budget > 0 ? actual / budget : 0

  return {
    actual,
    budget,
    balance,
    monthlyBudget,
    achieved,
  }
}

function financialLineKey(prefix, label) {
  return `${prefix}:${slugify(label)}`
}

function buildFinancialSheet(report, selectedMonths, branchLabel, options = {}) {
  const { auditMode = false } = options
  const months = buildSelectedMonths(report, selectedMonths)
  const monthsWide = months.map((item) => item.short)
  const budgets = report?.budgets ?? {}
  const columnCount = 2 + 5 + monthsWide.length + 1
  const monthsCount = monthsWide.length
  const title = `${String(branchLabel).toUpperCase()}${auditMode ? ' AUDIT' : ''} REC & PAYMENT`
  const subtitle = `${auditMode ? 'AUDIT ' : ''}FINANCIAL DETAILS FOR THE PERIOD ${months[0]?.long ?? 'JANUARY'} TO ${months[months.length - 1]?.long ?? 'DECEMBER'} ${report?.year ?? currentYear()}`
  const monthRows = months.map((item) => item.data)
  const receiptRows = [
    { sn: '1.1', label: 'SALES OF FRAMES - NORMAL', key: 'receipt:frames-normal', months: monthRows.map((row) => toNumber(row.frames)) },
    { sn: '1.2', label: 'SALE OF FRAMES - BY THE SIDE', key: 'receipt:frames-side', months: monthRows.map(() => 0) },
    { sn: '1.3', label: 'SALE OF LENSES - NORMAL', key: 'receipt:lenses-normal', months: monthRows.map((row) => toNumber(row.lenses)) },
    { sn: '1.4', label: 'SALE OF LENSES - BY THE SIDE', key: 'receipt:lenses-side', months: monthRows.map(() => 0) },
    { sn: '1.5', label: 'CONSULTATION - NORMAL', key: 'receipt:consultation-normal', months: monthRows.map((row) => toNumber(row.consultation)) },
    { sn: '1.6', label: 'INSURANCE RECEIVED', key: 'receipt:insurance-received', months: monthRows.map((row) => toNumber(row.insurance_received)) },
    { sn: '1.7', label: 'SALE OF CASES', key: 'receipt:cases', months: monthRows.map((row) => toNumber(row.cases)) },
    { sn: '1.8', label: 'SALES RECONCILIATION BALANCE', key: 'receipt:sales-reconciliation', months: monthRows.map((row) => toNumber(row.sales_reconciliation)) },
    ...(report?.collection_sources ?? [])
      .map((row, index) => ({
        sn: `1.${9 + index}`,
        label: String(row.label ?? '').toUpperCase(),
        key: financialLineKey('collection', row.label),
        months: selectedMonths.map((month) => toNumber(row?.months?.[Number(month) - 1])),
        isAdjustment: Boolean(row.isAuditAdjustment),
      }))
      .filter((row) => row.months.some((amount) => amount !== 0)),
  ]

  const salaryRows = buildDeclaredSalaryRows(report, selectedMonths).map((row) => ({
    label: `SALARY - ${String(row.label ?? row.name ?? '').toUpperCase()}`,
    key: financialLineKey('salary', row.employee_id ?? row.label ?? row.name),
    months: selectedMonths.map((month) => toNumber(row?.months?.[Number(month) - 1])),
  }))
  const expenseRows = (report?.expense_categories ?? []).map((row) => ({
    label: row.label.toUpperCase(),
    key: financialLineKey('expense', row.label),
    months: selectedMonths.map((month) => toNumber(row?.months?.[Number(month) - 1])),
    isAdjustment: Boolean(row.isAuditAdjustment),
  }))
  const paymentRowsSource = [...salaryRows, ...expenseRows]
  const paymentRows = paymentRowsSource.map((row, index) => ({
    ...row,
    sn: `2.${index + 1}`,
  }))

  const receiptSectionTotal = sumArray(receiptRows.map((row) => sumArray(row.months)))
  const paymentSectionTotal = sumArray(paymentRows.map((row) => sumArray(row.months)))
  const receiptBudgetTotal = sumArray(receiptRows.map((row) => toNumber(budgets[row.key] ?? 0)))
  const paymentBudgetTotal = sumArray(paymentRows.map((row) => toNumber(budgets[row.key] ?? 0)))
  const receiptTotals = selectedMonths.map((_, index) => sumMonthColumn(receiptRows, index))
  const paymentTotals = selectedMonths.map((_, index) => sumMonthColumn(paymentRowsSource, index))
  const profitTotals = selectedMonths.map((_, index) => receiptTotals[index] - paymentTotals[index])

  function buildPlannedRow(row, sectionTotal) {
    const actual = sumArray(row.months)
    const budget = roundMoney(budgets[row.key] ?? 0)
    const metrics = buildFinancialBudgetMetrics(actual, budget, selectedMonths.length)
    const sectionShare = sectionTotal > 0 ? actual / sectionTotal : 0

    return {
      kind: 'data',
      key: row.key,
      budgetKey: row.key,
      sectionShare,
      actual,
      budget: metrics.budget,
      balance: metrics.balance,
      monthlyBudget: metrics.monthlyBudget,
      achieved: metrics.achieved,
      cells: [
        row.sn ?? '',
        row.label,
        sectionShare,
        metrics.budget,
        ...row.months,
        actual,
        metrics.balance,
        metrics.monthlyBudget,
        metrics.achieved,
      ],
    }
  }

  function buildSectionTotalRow(label, totalValues, actualTotal, budgetTotal) {
    const metrics = buildFinancialBudgetMetrics(actualTotal, budgetTotal, selectedMonths.length)
    return {
      kind: 'total',
      cells: [
        '',
        label,
        1,
        metrics.budget,
        ...totalValues,
        metrics.actual,
        metrics.balance,
        metrics.monthlyBudget,
        metrics.achieved,
      ],
    }
  }

  const rows = [
    { kind: 'title', cells: ['BEALET OPTICALS'] },
    { kind: 'title', cells: [subtitle] },
    { kind: 'title', cells: ['MONTHLY RETURNS'] },
    { kind: 'header', cells: ['SN', 'DETAILS', '%', 'BUDGET', ...monthsWide, 'TOTAL', 'BALANCE', 'MONTHLY BUDGET', '% ACHIEVED'] },
    { kind: 'section', cells: ['RECEIPTS'] },
    ...receiptRows.map((row) => buildPlannedRow(row, receiptSectionTotal)),
    buildSectionTotalRow('TOTAL RECEIPTS', receiptTotals, receiptSectionTotal, receiptBudgetTotal),
    { kind: 'section', cells: ['PAYMENTS'] },
    ...paymentRows.map((row) => buildPlannedRow(row, paymentSectionTotal)),
    buildSectionTotalRow('TOTAL PAYMENTS', paymentTotals, paymentSectionTotal, paymentBudgetTotal),
    { kind: 'total', cells: ['', 'PROFIT / LOSS', '', '', ...profitTotals, sumArray(profitTotals), '', '', ''] },
  ]

  return {
    key: `financial-${slugify(branchLabel)}`,
    branchId: report?.branch_id,
    kind: 'financial',
    title,
    subtitle,
    columnCount,
    monthsCount,
    rows,
    budgets,
    monthlyTotals: {
      receipts: receiptTotals,
      payments: paymentTotals,
      profit: profitTotals,
    },
  }
}

function buildDailySalesSheet(report, selectedMonths, branchLabel) {
  const monthGroups = selectedMonths.map((month) => {
    const rows = (report?.daily_sales ?? [])
      .filter((entry) => String(entry?.date ?? '').slice(5, 7) === month)
      .sort((left, right) => String(left.date).localeCompare(String(right.date)))
      .map((entry) => ({ date: formatDate(entry.date), total: toNumber(entry.total) }))

    return {
      month,
      label: monthName(month, false),
      rows,
      total: rows.reduce((total, row) => total + row.total, 0),
    }
  })

  const maxRows = Math.max(0, ...monthGroups.map((group) => group.rows.length))
  const matrixRows = Array.from({ length: maxRows }, (_, rowIndex) => (
    monthGroups.flatMap((group) => {
      const row = group.rows[rowIndex]
      return [row?.date ?? '', row?.total ?? '']
    })
  ))

  const totalsRow = monthGroups.flatMap((group) => ['Total', group.total])
  const totalColumns = monthGroups.length * 2
  const merges = selectedMonths.map((_, index) => ({
    s: { r: 3, c: index * 2 },
    e: { r: 3, c: index * 2 + 1 },
  }))

  const rows = [
    { kind: 'title', cells: ['BEALET OPTICALS'] },
    { kind: 'title', cells: [`DAILY SALES - ${String(branchLabel).toUpperCase()}`] },
    { kind: 'title', cells: ['MONTHLY DAILY SALES MATRIX'] },
    { kind: 'header', cells: monthGroups.flatMap((group) => [group.label, '']) },
    { kind: 'header', cells: monthGroups.flatMap(() => ['DATE', 'SALES']) },
    ...matrixRows.map((cells) => ({ kind: 'data', cells })),
    { kind: 'total', cells: totalsRow },
  ]

  return {
    key: `daily-${slugify(branchLabel)}`,
    title: `DAILY SALES - ${branchLabel}`,
    subtitle: `Daily receipts by month for ${selectedMonths.map((month) => monthName(month, false)).join(', ')}`,
    totalColumns,
    rows,
    merges,
    monthGroups,
  }
}

function buildInsuranceSheet(primaryReport, reportsByKey, primaryPeriods, comparisonPeriods, comparisonState) {
  const labels = primaryPeriods.map((period) => monthName(period.month, true))
  const title = 'INSURANCE'
  const subtitle = 'MONTHLY INSURANCE CLAIMS'

  const comparisonBranchId = Number(comparisonState.branch_id || primaryReport.branch_id)
  const comparisonSourceBranch = comparisonState.mode === 'branch' || comparisonState.mode === 'custom'
    ? comparisonBranchId
    : primaryReport.branch_id

  const claimsPrimary = primaryPeriods.map((period) => getPeriodPairValue(reportsByKey, primaryReport.branch_id, period, 'insurance_claimed'))
  const claimsComparison = comparisonPeriods.map((period) => getPeriodPairValue(reportsByKey, comparisonSourceBranch, period, 'insurance_claimed'))
  const receivedPrimary = primaryPeriods.map((period) => getPeriodPairValue(reportsByKey, primaryReport.branch_id, period, 'insurance_received'))
  const receivedComparison = comparisonPeriods.map((period) => getPeriodPairValue(reportsByKey, comparisonSourceBranch, period, 'insurance_received'))
  const claimsTotal = claimsPrimary.map((amount, index) => amount + claimsComparison[index])
  const receivedTotal = receivedPrimary.map((amount, index) => amount + receivedComparison[index])

  const rows = [
    { kind: 'title', cells: ['BEALET OPTICALS'] },
    { kind: 'title', cells: [subtitle] },
    { kind: 'title', cells: ['MONTHLY INSURANCE CLAIMS'] },
    { kind: 'header', cells: ['SN', 'DETAILS', ...labels, 'TOTAL'] },
    { kind: 'data', cells: ['1.1', `INSURANCE CLAIMS - ${primaryReport?.branch_name ?? 'PRIMARY'}`.toUpperCase(), ...claimsPrimary, sumArray(claimsPrimary)] },
    { kind: 'data', cells: ['1.2', `INSURANCE CLAIMS - ${comparisonState.label ?? 'COMPARISON'}`.toUpperCase(), ...claimsComparison, sumArray(claimsComparison)] },
    { kind: 'total', cells: ['', 'TOTAL', ...claimsTotal, sumArray(claimsTotal)] },
    { kind: 'data', cells: ['2.1', `INSURANCE RECEIVED - ${primaryReport?.branch_name ?? 'PRIMARY'}`.toUpperCase(), ...receivedPrimary, sumArray(receivedPrimary)] },
    { kind: 'data', cells: ['2.2', `INSURANCE RECEIVED - ${comparisonState.label ?? 'COMPARISON'}`.toUpperCase(), ...receivedComparison, sumArray(receivedComparison)] },
    { kind: 'total', cells: ['', 'TOTAL', ...receivedTotal, sumArray(receivedTotal)] },
  ]

  return {
    key: 'insurance',
    title,
    subtitle,
    columnCount: 2 + labels.length + 1,
    rows,
  }
}

function buildPurchasesSheet(primaryReport, mergedReport, selectedMonths) {
  const labels = selectedMonths.map((month) => monthName(month, true))
  const primaryMonths = buildSelectedMonths(primaryReport, selectedMonths)
  const mergedExpenseRows = (mergedReport?.expense_categories ?? []).map((row) => ({
    label: row.label,
    months: selectedMonths.map((month) => toNumber(row?.months?.[Number(month) - 1])),
  }))

  const lensPurchases = mergedExpenseRows
    .filter((row) => String(row.label).toLowerCase().includes('lens'))
    .reduce((totals, row) => totals.map((amount, index) => amount + toNumber(row.months[index])), Array(selectedMonths.length).fill(0))
  const framePurchases = mergedExpenseRows
    .filter((row) => String(row.label).toLowerCase().includes('frame'))
    .reduce((totals, row) => totals.map((amount, index) => amount + toNumber(row.months[index])), Array(selectedMonths.length).fill(0))

  const lensSold = primaryMonths.map((item) => toNumber(item.data.lenses))
  const frameSold = primaryMonths.map((item) => toNumber(item.data.frames))
  const lensProfit = lensSold.map((amount, index) => amount - lensPurchases[index])
  const frameProfit = frameSold.map((amount, index) => amount - framePurchases[index])

  const rows = [
    { kind: 'title', cells: ['BEALET OPTICALS'] },
    { kind: 'title', cells: ['MONTHLY PURCHASES ANALYSIS SHEET'] },
    { kind: 'title', cells: ['SAMPLE'] },
    { kind: 'header', cells: ['SN', 'DETAILS', ...labels, 'TOTAL'] },
    { kind: 'section', cells: ['LENSES'] },
    { kind: 'data', cells: ['1', 'LENS (SOLD)', ...lensSold, sumArray(lensSold)] },
    { kind: 'data', cells: ['1.1', 'LENS PURCHASES', ...lensPurchases, sumArray(lensPurchases)] },
    { kind: 'total', cells: ['', 'PROFIT', ...lensProfit, sumArray(lensProfit)] },
    { kind: 'section', cells: ['FRAMES'] },
    { kind: 'data', cells: ['1.2', 'FRAMES SOLD', ...frameSold, sumArray(frameSold)] },
    { kind: 'data', cells: ['1.3', 'FRAMES PURCHASED', ...framePurchases, sumArray(framePurchases)] },
    { kind: 'total', cells: ['', 'PROFIT', ...frameProfit, sumArray(frameProfit)] },
  ]

  return {
    key: 'purchases',
    title: 'PURCHASES',
    subtitle: 'Monthly purchases analysis',
    columnCount: 2 + labels.length + 1,
    rows,
  }
}

function buildWorkingCapitalSheet(mergedReport, selectedMonths) {
  const labels = selectedMonths.map((month) => monthName(month, false))
  const selected = buildSelectedMonths(mergedReport, selectedMonths)
  const cashProxy = selected.map((item) => toNumber(item.data.operating_cash))
  const debtors = selected.map((item) => toNumber(item.data.debtors))
  const expenses = selected.map((item) => toNumber(item.data.expenses))
  const collections = selected.map((item) => toNumber(item.data.collected))
  const supportTotals = (mergedReport?.collection_sources ?? [])
    .filter((row) => /loan|support/i.test(String(row.label)))
    .reduce((totals, row) => totals.map((amount, index) => amount + toNumber(row.months?.[Number(selectedMonths[index]) - 1])), Array(selectedMonths.length).fill(0))
  const totalAssets = cashProxy.map((amount, index) => amount + debtors[index])
  const totalLiabilities = expenses.map((amount, index) => amount + supportTotals[index])
  const workingCapital = totalAssets.map((amount, index) => amount - totalLiabilities[index])

  const rows = [
    { kind: 'title', cells: ['BEALET OPTICALS'] },
    { kind: 'title', cells: ['MONTHLY WORKING CAPITAL STATEMENT'] },
    { kind: 'title', cells: ['CALCULATED OPERATIONAL VIEW'] },
    { kind: 'header', cells: ['SN', 'DETAILS', ...labels, 'TOTAL'] },
    { kind: 'section', cells: ['CURRENT ASSETS'] },
    { kind: 'data', cells: ['1.1', 'CASH AT BANK / OPERATING CASH', ...cashProxy, sumArray(cashProxy)] },
    { kind: 'data', cells: ['1.2', 'TRADE DEBTORS', ...debtors, sumArray(debtors)] },
    { kind: 'data', cells: ['1.3', 'COLLECTIONS', ...collections, sumArray(collections)] },
    { kind: 'total', cells: ['', 'TOTAL CURRENT ASSETS', ...totalAssets, sumArray(totalAssets)] },
    { kind: 'section', cells: ['CURRENT LIAB'] },
    { kind: 'data', cells: ['2.1', 'OPERATING EXPENSES', ...expenses, sumArray(expenses)] },
    { kind: 'data', cells: ['2.2', 'LOANS / SUPPORT', ...supportTotals, sumArray(supportTotals)] },
    { kind: 'total', cells: ['', 'TOTAL CURRENT LIABILITIES', ...totalLiabilities, sumArray(totalLiabilities)] },
    { kind: 'total', cells: ['', 'WORKING CAPITAL', ...workingCapital, sumArray(workingCapital)] },
  ]

  return {
    key: 'working-capital',
    title: 'WORKING CAP STATEMENT',
    subtitle: 'Calculated operational view and not a formal statutory balance sheet',
    columnCount: 2 + labels.length + 1,
    rows,
  }
}

function buildWorkbookSheets({ reportsByKey, primaryReport, mergedReport, selectedMonths, comparisonState, primaryPeriods, comparisonPeriods }, options = {}) {
  if (!primaryReport) return []

  const { auditMode = false, includeComparisonBranchSheet = true } = options
  const sheets = []
  sheets.push(buildFinancialSheet(primaryReport, selectedMonths, primaryReport.branch_name, { auditMode }))
  if (includeComparisonBranchSheet && (comparisonState.mode === 'branch' || comparisonState.mode === 'custom')) {
    const comparisonBranchId = Number(comparisonState.branch_id || primaryReport.branch_id)
    const comparisonYear = comparisonPeriods[0]?.year ?? primaryReport.year
    const comparisonReport = reportsByKey[`${comparisonBranchId}:${comparisonYear}`] ?? null
    if (comparisonReport && comparisonReport.branch_id !== primaryReport.branch_id) {
      sheets.push(buildFinancialSheet(comparisonReport, selectedMonths, comparisonReport.branch_name))
    }
  }
  sheets.push(buildDailySalesSheet(primaryReport, selectedMonths, primaryReport.branch_name))
  sheets.push(buildInsuranceSheet(primaryReport, reportsByKey, primaryPeriods, comparisonPeriods, comparisonState))
  sheets.push(buildPurchasesSheet(primaryReport, mergedReport ?? primaryReport, selectedMonths))
  sheets.push(buildWorkingCapitalSheet(mergedReport ?? primaryReport, selectedMonths))
  sheets.push(...buildComparisonWorkbookSheets({ reportsByKey, primaryBranchId: primaryReport.branch_id, primaryPeriods, comparisonPeriods, comparisonState }))

  return sheets
}

function FinancialWorkbookPreview({ sheet, budgets = {}, onBudgetChange = () => {}, savingBudgetKey = '' }) {
  const columnCount = sheet.columnCount ?? Math.max(...sheet.rows.map((row) => row.cells.length))
  const monthsCount = sheet.monthsCount ?? Math.max(0, columnCount - 8)
  const totalIndex = 4 + monthsCount
  const balanceIndex = totalIndex + 1
  const monthlyBudgetIndex = totalIndex + 2
  const achievedIndex = totalIndex + 3

  return (
    <div className="workbook-daily-scroll">
      <table className="portal-table report-table workbook-preview-table workbook-financial-table">
        <tbody>
          {sheet.rows.map((row, rowIndex) => {
            if (row.kind === 'title' || row.kind === 'section') {
              return (
                <tr key={`${sheet.key}-${rowIndex}`} className={row.kind === 'section' ? 'report-section-row' : 'workbook-title-row'}>
                  <th colSpan={columnCount}>{row.cells[0]}</th>
                </tr>
              )
            }

            if (row.kind === 'header') {
              return (
                <tr key={`${sheet.key}-${rowIndex}`} className="workbook-header-row">
                  {row.cells.map((cell, cellIndex) => (
                    <th key={`${sheet.key}-${rowIndex}-${cellIndex}`}>{cell}</th>
                  ))}
                </tr>
              )
            }

            return (
              <tr key={`${sheet.key}-${rowIndex}`} className={row.kind === 'total' ? 'workbook-total-row' : ''}>
                {row.cells.map((cell, cellIndex) => {
                  if (cellIndex === 3 && row.kind === 'data' && row.budgetKey) {
                    const budgetValue = budgets[row.budgetKey] ?? row.budget ?? ''
                    const isSaving = savingBudgetKey === row.budgetKey
                    return (
                      <td key={`${sheet.key}-${rowIndex}-${cellIndex}`}>
                        <div className="report-budget-control">
                          <input
                            className="monitor-budget-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={budgetValue}
                            placeholder="Set budget"
                            aria-label={`${row.cells[1]} budget`}
                            onChange={(event) => onBudgetChange(row.budgetKey, event.target.value)}
                            onBlur={(event) => onBudgetChange(row.budgetKey, event.target.value, true)}
                          />
                          <button
                            type="button"
                            className="mini-action"
                            disabled={isSaving}
                            onClick={() => onBudgetChange(row.budgetKey, budgetValue, true)}
                          >
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </td>
                    )
                  }

                  if (cellIndex === 2 || cellIndex === achievedIndex) {
                    return (
                      <td key={`${sheet.key}-${rowIndex}-${cellIndex}`} className="workbook-money-cell">
                        {typeof cell === 'number' ? formatPercentRatio(cell) : cell}
                      </td>
                    )
                  }

                  if (cellIndex === totalIndex || cellIndex === balanceIndex || cellIndex === monthlyBudgetIndex) {
                    return (
                      <td key={`${sheet.key}-${rowIndex}-${cellIndex}`} className="workbook-money-cell">
                        {typeof cell === 'number' ? formatMoney(cell) : cell}
                      </td>
                    )
                  }

                  if (typeof cell === 'number') {
                    return (
                      <td key={`${sheet.key}-${rowIndex}-${cellIndex}`} className="workbook-money-cell">
                        {formatMoney(cell)}
                      </td>
                    )
                  }

                  return (
                    <td key={`${sheet.key}-${rowIndex}-${cellIndex}`}>
                      {cell}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function WorkbookPreviewTable({ sheet }) {
  const columnCount = sheet.columnCount ?? Math.max(...sheet.rows.map((row) => row.cells.length))
  const percentColumns = new Set(sheet.percentColumns ?? [])

  return (
    <table className="portal-table report-table workbook-preview-table">
      <tbody>
        {sheet.rows.map((row, rowIndex) => {
          if (row.kind === 'title' || row.kind === 'section') {
            return (
              <tr key={`${sheet.key}-${rowIndex}`} className={row.kind === 'section' ? 'report-section-row' : 'workbook-title-row'}>
                <th colSpan={columnCount}>{row.cells[0]}</th>
              </tr>
            )
          }

          if (row.kind === 'header') {
            return (
              <tr key={`${sheet.key}-${rowIndex}`} className="workbook-header-row">
                {row.cells.map((cell, cellIndex) => (
                  <th key={`${sheet.key}-${rowIndex}-${cellIndex}`}>{cell}</th>
                ))}
              </tr>
            )
          }

          return (
            <tr key={`${sheet.key}-${rowIndex}`} className={row.kind === 'total' ? 'workbook-total-row' : ''}>
              {row.cells.map((cell, cellIndex) => (
                <td key={`${sheet.key}-${rowIndex}-${cellIndex}`} className={cellIndex >= 2 ? 'workbook-money-cell' : ''}>
                  {typeof cell === 'number'
                    ? percentColumns.has(cellIndex)
                      ? formatPercentRatio(cell)
                      : formatMoney(cell)
                    : cell}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function DailySalesPreview({ sheet }) {
  if (!sheet?.monthGroups?.length) {
    return <p className="muted-copy">No daily sales are available for the selected range.</p>
  }

  const maxRows = Math.max(...sheet.monthGroups.map((group) => group.rows.length))

  return (
    <div className="workbook-daily-scroll">
      <table className="portal-table report-table workbook-daily-table">
        <thead>
          <tr>
            {sheet.monthGroups.map((group) => (
              <th key={`daily-month-${group.month}`} colSpan="2">{group.label}</th>
            ))}
          </tr>
          <tr>
            {sheet.monthGroups.map((group) => (
              <Fragment key={`daily-sub-${group.month}`}>
                <th>Date</th>
                <th>Sales</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }, (_, rowIndex) => (
            <tr key={`daily-row-${rowIndex}`}>
              {sheet.monthGroups.map((group) => {
                const row = group.rows[rowIndex]
                return (
                  <Fragment key={`daily-row-${group.month}-${rowIndex}`}>
                    <td>{row?.date ?? ''}</td>
                    <td className="workbook-money-cell">{row ? formatMoney(row.total) : ''}</td>
                  </Fragment>
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            {sheet.monthGroups.map((group) => (
              <Fragment key={`daily-total-${group.month}`}>
                <td>Total</td>
                <td className="workbook-money-cell">{formatMoney(group.total)}</td>
              </Fragment>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function buildSheetToAoa(sheet) {
  if (sheet.key === 'daily') {
    const rows = [
      ['BEALET OPTICALS'],
      [sheet.title],
      [sheet.subtitle],
      sheet.monthGroups.flatMap((group) => [group.label, '']),
      sheet.monthGroups.flatMap(() => ['DATE', 'SALES']),
    ]

    const maxRows = Math.max(...sheet.monthGroups.map((group) => group.rows.length))
    for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
      rows.push(sheet.monthGroups.flatMap((group) => {
        const row = group.rows[rowIndex]
        return [row?.date ?? '', row?.total ?? '']
      }))
    }

    rows.push(sheet.monthGroups.flatMap((group) => ['Total', group.total]))

    return rows
  }

  return sheet.rows.map((row) => row.cells)
}

const XLSX_BORDER = {
  top: { style: 'thin', color: { rgb: '9AA7B5' } },
  right: { style: 'thin', color: { rgb: '9AA7B5' } },
  bottom: { style: 'thin', color: { rgb: '9AA7B5' } },
  left: { style: 'thin', color: { rgb: '9AA7B5' } },
}

const XLSX_STYLES = {
  title: {
    font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '0F172A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: XLSX_BORDER,
  },
  subtitle: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'D9EAF7' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: XLSX_BORDER,
  },
  section: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F6E7B8' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: XLSX_BORDER,
  },
  header: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '1D4ED8' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: XLSX_BORDER,
  },
  dataText: {
    font: { name: 'Calibri', sz: 11, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: XLSX_BORDER,
  },
  dataNumber: {
    font: { name: 'Calibri', sz: 11, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0.00',
    border: XLSX_BORDER,
  },
  percent: {
    font: { name: 'Calibri', sz: 11, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '0.0%',
    border: XLSX_BORDER,
  },
  total: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FEF3C7' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0.00',
    border: XLSX_BORDER,
  },
  adjustment: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '1D4ED8' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0.00',
    border: XLSX_BORDER,
  },
  totalLabel: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FEF3C7' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: XLSX_BORDER,
  },
  positive: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '1D4ED8' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'E8F0FF' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0.00',
    border: XLSX_BORDER,
  },
  negative: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'DC2626' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FDECEC' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0.00',
    border: XLSX_BORDER,
  },
  date: {
    font: { name: 'Calibri', sz: 11, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: XLSX_BORDER,
  },
}

function cloneStyle(style) {
  return JSON.parse(JSON.stringify(style))
}

function excelCellAddress(rowIndex, columnIndex) {
  return XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })
}

function setCellStyle(worksheet, rowIndex, columnIndex, style, value, formula = null) {
  const address = excelCellAddress(rowIndex, columnIndex)
  worksheet[address] = worksheet[address] ?? { t: typeof value === 'number' ? 'n' : 's', v: value ?? '' }
  worksheet[address].s = cloneStyle(style)

  if (typeof value === 'number' && Number.isFinite(value)) {
    worksheet[address].t = 'n'
    worksheet[address].v = value
  } else if (value != null) {
    worksheet[address].t = 's'
    worksheet[address].v = String(value)
  }

  if (formula) {
    worksheet[address].f = formula
  }
}

function buildWorkbookSheet(sheet) {
  const aoa = buildSheetToAoa(sheet)
  const worksheet = XLSX.utils.aoa_to_sheet(aoa)
  const columnCount = Math.max(...aoa.map((row) => row.length))
  const monthsCount = sheet.monthsCount ?? Math.max(0, columnCount - 8)
  const totalIndex = 4 + monthsCount
  const balanceIndex = totalIndex + 1
  const monthlyBudgetIndex = totalIndex + 2
  const achievedIndex = totalIndex + 3
  worksheet['!merges'] = buildSheetMerges(sheet)
  worksheet['!cols'] = Array.from({ length: columnCount }, (_, index) => ({
    wch: sheet.key === 'daily'
      ? (index % 2 === 0 ? 14 : 12)
      : sheet.key.startsWith('financial-')
        ? (index === 0
          ? 10
          : index === 1
            ? 34
            : index === 2
              ? 12
              : index === 3
                ? 14
                : index === totalIndex
                  ? 16
                  : index === balanceIndex
                    ? 14
                    : index === monthlyBudgetIndex
                      ? 16
                      : index === achievedIndex
                        ? 12
                        : 13)
        : index === 0
          ? 12
          : index === 1
            ? 36
            : index === columnCount - 1
              ? 16
              : 14,
  }))
  worksheet['!rows'] = aoa.map((_, index) => ({
    hpt: index < 3 ? 22 : index === 3 ? 20 : 18,
  }))

  for (let rowIndex = 0; rowIndex < aoa.length; rowIndex += 1) {
    const rowValues = aoa[rowIndex]
    const rowKind = resolveWorkbookRowKind(sheet, rowIndex)
    const sheetRow = sheet.rows[rowIndex] ?? {}

    for (let columnIndex = 0; columnIndex < rowValues.length; columnIndex += 1) {
      const value = rowValues[columnIndex]
      const isNumeric = typeof value === 'number' && Number.isFinite(value)
      const isFirstColumn = columnIndex === 0
      const isDetailColumn = columnIndex === 1
      const isPercentColumn = (sheet.key.startsWith('financial-') && (columnIndex === 2 || columnIndex === achievedIndex))
        || (Array.isArray(sheet.percentColumns) && sheet.percentColumns.includes(columnIndex))
      const isMoneyColumn = sheet.key.startsWith('financial-')
        ? (columnIndex === totalIndex || columnIndex === balanceIndex || columnIndex === monthlyBudgetIndex || (columnIndex >= 4 && columnIndex < totalIndex))
        : isNumeric
      let style
      if (rowKind === 'title') {
        style = rowIndex === 0
          ? XLSX_STYLES.title
          : rowIndex === 1
            ? XLSX_STYLES.subtitle
            : XLSX_STYLES.section
      } else if (rowKind === 'section') {
        style = XLSX_STYLES.section
      } else if (rowKind === 'header') {
        style = XLSX_STYLES.header
      } else if (rowKind === 'total') {
        style = isFirstColumn
          ? XLSX_STYLES.totalLabel
          : isPercentColumn
            ? XLSX_STYLES.percent
            : XLSX_STYLES.total
      } else if (sheetRow.kind === 'data' && sheetRow.isAdjustment) {
        style = XLSX_STYLES.adjustment
      } else if (isNumeric) {
        style = isPercentColumn ? XLSX_STYLES.percent : XLSX_STYLES.dataNumber
      } else {
        style = isFirstColumn || isDetailColumn ? XLSX_STYLES.dataText : isPercentColumn ? XLSX_STYLES.percent : XLSX_STYLES.dataNumber
      }

      setCellStyle(worksheet, rowIndex, columnIndex, style, value)
    }
  }

  applyWorkbookFormulas(worksheet, sheet, aoa)
  return worksheet
}

function resolveWorkbookRowKind(sheet, rowIndex) {
  if (sheet.key === 'daily') {
    if (rowIndex < 3) return 'title'
    if (rowIndex < 5) return 'header'
    if (rowIndex === buildSheetToAoa(sheet).length - 1) return 'total'
    return 'data'
  }

  return sheet.rows[rowIndex]?.kind ?? 'data'
}

function applyWorkbookFormulas(worksheet, sheet, aoa) {
  if (sheet.key.startsWith('financial-')) {
    return
  }

  if (sheet.key === 'daily') {
    applyDailySheetFormulas(worksheet, sheet, aoa)
    return
  }

  if (sheet.key === 'insurance') {
    applyInsuranceSheetFormulas(worksheet, sheet, aoa)
    return
  }

  if (sheet.key === 'purchases') {
    applyPurchasesSheetFormulas(worksheet, sheet, aoa)
    return
  }

  if (sheet.key === 'working-capital') {
    applyWorkingCapitalSheetFormulas(worksheet, sheet, aoa)
  }
}

function applyFinancialSheetFormulas(worksheet, sheet, aoa) {
  const monthsCount = sheet.monthlyTotals.receipts.length
  const valueStartCol = 2
  const totalCol = valueStartCol + monthsCount
  const receiptStartRow = 5
  const receiptEndRow = receiptStartRow + (sheet.rows.findIndex((row) => row.kind === 'section' && row.cells[0] === 'PAYMENTS') - 5) - 1
  const paymentStartRow = receiptEndRow + 2
  const paymentEndRow = paymentStartRow + sheet.rows.filter((row) => row.kind === 'data').length - monthsCount - 8 - 1
  const rowCountBeforePayments = sheet.rows.findIndex((row) => row.kind === 'section' && row.cells[0] === 'PAYMENTS')
  const receiptRowCount = rowCountBeforePayments - 5
  const paymentRowCount = sheet.rows.length - rowCountBeforePayments - 3
  const receiptTotalRow = receiptStartRow + receiptRowCount
  const paymentTotalRow = paymentStartRow + paymentRowCount
  const profitRow = paymentTotalRow + 1

  for (let rowIndex = receiptStartRow; rowIndex < receiptTotalRow; rowIndex += 1) {
    const totalAddress = excelCellAddress(rowIndex, totalCol)
    const formula = `SUM(${XLSX.utils.encode_col(valueStartCol)}${rowIndex + 1}:${XLSX.utils.encode_col(totalCol - 1)}${rowIndex + 1})`
    setCellStyle(worksheet, rowIndex, totalCol, XLSX_STYLES.dataNumber, toNumber(worksheet[excelCellAddress(rowIndex, totalCol)]?.v), formula)
  }

  for (let monthIndex = 0; monthIndex < monthsCount; monthIndex += 1) {
    const col = valueStartCol + monthIndex
    const colLetter = XLSX.utils.encode_col(col)
    const receiptFormula = `SUM(${colLetter}${receiptStartRow + 1}:${colLetter}${receiptTotalRow})`
    const paymentFormula = `SUM(${colLetter}${paymentStartRow + 1}:${colLetter}${paymentTotalRow})`
    const profitFormula = `${colLetter}${receiptTotalRow + 1}-${colLetter}${paymentTotalRow + 1}`
    setCellStyle(worksheet, receiptTotalRow, col, XLSX_STYLES.total, toNumber(aoa[receiptTotalRow]?.[col]), receiptFormula)
    setCellStyle(worksheet, paymentTotalRow, col, XLSX_STYLES.total, toNumber(aoa[paymentTotalRow]?.[col]), paymentFormula)
    const profitValue = toNumber(aoa[profitRow]?.[col])
    setCellStyle(worksheet, profitRow, col, profitValue < 0 ? XLSX_STYLES.negative : XLSX_STYLES.positive, profitValue, profitFormula)
  }

  setCellStyle(worksheet, receiptTotalRow, totalCol, XLSX_STYLES.total, toNumber(aoa[receiptTotalRow]?.[totalCol]), `SUM(${XLSX.utils.encode_col(valueStartCol)}${receiptTotalRow + 1}:${XLSX.utils.encode_col(totalCol - 1)}${receiptTotalRow + 1})`)
  setCellStyle(worksheet, paymentTotalRow, totalCol, XLSX_STYLES.total, toNumber(aoa[paymentTotalRow]?.[totalCol]), `SUM(${XLSX.utils.encode_col(valueStartCol)}${paymentTotalRow + 1}:${XLSX.utils.encode_col(totalCol - 1)}${paymentTotalRow + 1})`)
  const profitTotalValue = toNumber(aoa[profitRow]?.[totalCol])
  setCellStyle(worksheet, profitRow, totalCol, profitTotalValue < 0 ? XLSX_STYLES.negative : XLSX_STYLES.positive, profitTotalValue, `SUM(${XLSX.utils.encode_col(valueStartCol)}${profitRow + 1}:${XLSX.utils.encode_col(totalCol - 1)}${profitRow + 1})`)
}

function applyDailySheetFormulas(worksheet, sheet, aoa) {
  const startRow = 5
  const totalRow = aoa.length - 1

  for (let monthIndex = 0; monthIndex < sheet.monthGroups.length; monthIndex += 1) {
    const salesCol = monthIndex * 2 + 1
    const salesLetter = XLSX.utils.encode_col(salesCol)
    const formula = `SUM(${salesLetter}${startRow + 1}:${salesLetter}${totalRow})`
    setCellStyle(worksheet, totalRow, salesCol, XLSX_STYLES.total, toNumber(aoa[totalRow]?.[salesCol]), formula)
    setCellStyle(worksheet, totalRow, monthIndex * 2, XLSX_STYLES.totalLabel, 'Total')
  }
}

function applyInsuranceSheetFormulas(worksheet, sheet, aoa) {
  const startCol = 2
  const endCol = aoa[3].length - 1
  const dataRows = [4, 5, 7, 8]
  const totalRows = [6, 9]

  dataRows.forEach((rowIndex) => {
    const totalCol = endCol
    const formula = `SUM(${XLSX.utils.encode_col(startCol)}${rowIndex + 1}:${XLSX.utils.encode_col(endCol - 1)}${rowIndex + 1})`
    setCellStyle(worksheet, rowIndex, totalCol, XLSX_STYLES.dataNumber, toNumber(aoa[rowIndex]?.[totalCol]), formula)
  })

  totalRows.forEach((rowIndex, totalIndex) => {
    const sourceRows = totalIndex === 0 ? [4, 5] : [7, 8]
    for (let col = startCol; col < endCol; col += 1) {
      const colLetter = XLSX.utils.encode_col(col)
      const formula = `SUM(${colLetter}${sourceRows[0] + 1}:${colLetter}${sourceRows[1] + 1})`
      setCellStyle(worksheet, rowIndex, col, XLSX_STYLES.total, toNumber(aoa[rowIndex]?.[col]), formula)
    }
    const totalCol = endCol
    const formula = `SUM(${XLSX.utils.encode_col(startCol)}${rowIndex + 1}:${XLSX.utils.encode_col(endCol - 1)}${rowIndex + 1})`
    setCellStyle(worksheet, rowIndex, totalCol, XLSX_STYLES.total, toNumber(aoa[rowIndex]?.[totalCol]), formula)
  })
}

function applyPurchasesSheetFormulas(worksheet, sheet, aoa) {
  const startCol = 2
  const endCol = aoa[3].length - 1
  const soldRows = [5, 9]
  const purchaseRows = [6, 10]
  const profitRows = [7, 11]

  soldRows.concat(purchaseRows).forEach((rowIndex) => {
    const formula = `SUM(${XLSX.utils.encode_col(startCol)}${rowIndex + 1}:${XLSX.utils.encode_col(endCol - 1)}${rowIndex + 1})`
    setCellStyle(worksheet, rowIndex, endCol, XLSX_STYLES.dataNumber, toNumber(aoa[rowIndex]?.[endCol]), formula)
  })

  profitRows.forEach((rowIndex, index) => {
    const leftRow = soldRows[index]
    const rightRow = purchaseRows[index]
    for (let col = startCol; col < endCol; col += 1) {
      const leftCell = `${XLSX.utils.encode_col(col)}${leftRow + 1}`
      const rightCell = `${XLSX.utils.encode_col(col)}${rightRow + 1}`
      const formula = `${leftCell}-${rightCell}`
      const value = toNumber(aoa[rowIndex]?.[col])
      setCellStyle(worksheet, rowIndex, col, value < 0 ? XLSX_STYLES.negative : XLSX_STYLES.positive, value, formula)
    }
    const formula = `SUM(${XLSX.utils.encode_col(startCol)}${rowIndex + 1}:${XLSX.utils.encode_col(endCol - 1)}${rowIndex + 1})`
    const totalValue = toNumber(aoa[rowIndex]?.[endCol])
    setCellStyle(worksheet, rowIndex, endCol, totalValue < 0 ? XLSX_STYLES.negative : XLSX_STYLES.positive, totalValue, formula)
  })
}

function applyWorkingCapitalSheetFormulas(worksheet, sheet, aoa) {
  const startCol = 2
  const endCol = aoa[3].length - 1
  const assetRows = [5, 6, 7]
  const liabilityRows = [10, 11]
  const totalAssetRow = 8
  const totalLiabilityRow = 12
  const workingRow = 13

  assetRows.concat(liabilityRows).forEach((rowIndex) => {
    const formula = `SUM(${XLSX.utils.encode_col(startCol)}${rowIndex + 1}:${XLSX.utils.encode_col(endCol - 1)}${rowIndex + 1})`
    setCellStyle(worksheet, rowIndex, endCol, XLSX_STYLES.dataNumber, toNumber(aoa[rowIndex]?.[endCol]), formula)
  })

  for (let col = startCol; col < endCol; col += 1) {
    const colLetter = XLSX.utils.encode_col(col)
    const assetFormula = `${colLetter}${assetRows[0] + 1}+${colLetter}${assetRows[1] + 1}+${colLetter}${assetRows[2] + 1}`
    const liabilityFormula = `${colLetter}${liabilityRows[0] + 1}+${colLetter}${liabilityRows[1] + 1}`
    const workingFormula = `${colLetter}${totalAssetRow + 1}-${colLetter}${totalLiabilityRow + 1}`
    setCellStyle(worksheet, totalAssetRow, col, XLSX_STYLES.total, toNumber(aoa[totalAssetRow]?.[col]), assetFormula)
    setCellStyle(worksheet, totalLiabilityRow, col, XLSX_STYLES.total, toNumber(aoa[totalLiabilityRow]?.[col]), liabilityFormula)
    const workingValue = toNumber(aoa[workingRow]?.[col])
    setCellStyle(worksheet, workingRow, col, workingValue < 0 ? XLSX_STYLES.negative : XLSX_STYLES.positive, workingValue, workingFormula)
  }

  const totalFormula = `SUM(${XLSX.utils.encode_col(startCol)}${workingRow + 1}:${XLSX.utils.encode_col(endCol - 1)}${workingRow + 1})`
  const totalValue = toNumber(aoa[workingRow]?.[endCol])
  setCellStyle(worksheet, workingRow, endCol, totalValue < 0 ? XLSX_STYLES.negative : XLSX_STYLES.positive, totalValue, totalFormula)
}

function buildSheetMerges(sheet) {
  if (sheet.key === 'daily') {
    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(1, sheet.monthGroups.length * 2 - 1) } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(1, sheet.monthGroups.length * 2 - 1) } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: Math.max(1, sheet.monthGroups.length * 2 - 1) } },
    ]

    for (let index = 0; index < sheet.monthGroups.length; index += 1) {
      merges.push({ s: { r: 3, c: index * 2 }, e: { r: 3, c: index * 2 + 1 } })
    }

    return merges
  }

  const totalColumns = sheet.columnCount ?? Math.max(...sheet.rows.map((row) => row.cells.length))
  return sheet.rows
    .map((row, index) => (row.kind === 'title' || row.kind === 'section'
      ? { s: { r: index, c: 0 }, e: { r: index, c: Math.max(0, totalColumns - 1) } }
      : null))
    .filter(Boolean)
}

function buildSummaryCards(primaryReport, mergedReport, selectedMonths) {
  const selected = buildSelectedMonths(primaryReport ?? mergedReport, selectedMonths)
  const receipts = selected.reduce((total, item) => total + toNumber(item.data.collected), 0)
  const expenses = selected.reduce((total, item) => total + toNumber(item.data.expenses), 0)
  const insurance = selected.reduce((total, item) => total + toNumber(item.data.insurance_received), 0)
  const workingCapital = selected.length ? (toNumber(selected[selected.length - 1].data.operating_cash) + toNumber(selected[selected.length - 1].data.debtors)) : 0

  return [
    ['Collected Revenue', receipts, 'Collections recognized across the selected range', 'seen', 'money'],
    ['Expenses', expenses, 'Operating costs in the same window', 'pending', 'alert'],
    ['Insurance Received', insurance, 'Insurance settlements posted in the range', 'today', 'shield'],
    ['Working Position', workingCapital, 'Operating cash proxy plus trade debtors', 'total', 'finance'],
  ]
}

function buildAuditNonTaxableRevenueTotal(financeSales) {
  const decisions = readExtractDecisions()

  return (financeSales?.records ?? []).reduce((total, record) => {
    const decision = decisions[buildRevenueKey(record)] ?? {}
    if (decision.classification !== 'non_taxable' || decision.includeInAudit === false) return total
    return total + toNumber(record.amount_paid ?? 0)
  }, 0)
}

function buildAuditNonDeductibleTotal(financeExpenses) {
  const decisions = readExtractDecisions()
  const salaryDeclarations = readExtractSalaryDeclarations()

  return (financeExpenses?.records ?? []).reduce((total, expense) => {
    const decision = decisions[buildExpenseKey(expense)] ?? {}
    if (decision.classification !== 'non_deductible' || decision.includeInAudit === false) return total
    return total + buildAuditDeclaredExpenseAmount(expense, salaryDeclarations)
  }, 0)
}

function workbookFileName(primaryReport, selectedMonths, comparisonScope) {
  const start = monthName(selectedMonths[0], false)
  const end = monthName(selectedMonths[selectedMonths.length - 1], false)
  const comparisonTag = comparisonScope?.mode ? `-${slugify(comparisonScope.mode)}` : ''
  return `bealet-report-${slugify(primaryReport?.branch_name)}-${start.toLowerCase()}-${end.toLowerCase()}-${primaryReport?.year ?? currentYear()}${comparisonTag}.xlsx`
}

function exportWorkbook(sheets, primaryReport, selectedMonths, comparisonScope) {
  const workbook = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const worksheet = buildWorkbookSheet(sheet)
    worksheet['!freeze'] = sheet.key === 'daily'
      ? { xSplit: 2, ySplit: 5, topLeftCell: 'C6', activePane: 'bottomRight', state: 'frozen' }
      : sheet.key.startsWith('financial-')
        ? { xSplit: 7, ySplit: 4, topLeftCell: 'H5', activePane: 'bottomRight', state: 'frozen' }
        : { xSplit: 2, ySplit: 4, topLeftCell: 'C5', activePane: 'bottomRight', state: 'frozen' }
    worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: Math.max(3, buildSheetToAoa(sheet).length - 1), c: Math.max(1, buildSheetToAoa(sheet)[3]?.length - 1 ?? 1) } }) }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetSafeName(sheet.title))
  }

  workbook.Workbook = {
    Views: [{ activeTab: 0 }],
    CalcPr: { fullCalcOnLoad: true, forceFullCalc: true },
  }

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true, cellFormula: true })
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = workbookFileName(primaryReport, selectedMonths, comparisonScope)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export default function ReportsSection(props) {
  const { apiFetch, token, session, selectedBranchId, financeSales, financeExpenses } = props
  const isExecutive = ['ceo', 'director'].includes(session?.role)
  const isManager = session?.role === 'manager'
  const isAccountant = session?.role === 'accountant'
  const canAccessWorkbook = Boolean(session && (session.is_admin || ['accountant', 'manager', 'ceo', 'director'].includes(session.role)))
  const canCompareBranches = Boolean(session?.is_admin || ['accountant', 'manager', 'ceo', 'director'].includes(session?.role))
  const defaultPrimaryBranch = canCompareBranches ? Number(selectedBranchId ?? session?.branch_id ?? 1) : Number(session?.branch_id ?? 1)
  const defaultComparisonBranch = defaultPrimaryBranch === 1 ? 2 : 1
  const [filters, setFilters] = useState({
    year: currentYear(),
    start_month: '01',
    end_month: '12',
    primary_branch_id: String(defaultPrimaryBranch),
    comparison_branch_id: String(defaultComparisonBranch),
  })
  const [comparisonState, setComparisonState] = useState({
    mode: 'branch',
    branch_id: String(defaultComparisonBranch),
    year: currentYear(),
    start_month: '01',
    end_month: '12',
    metricKeys: ['collections', 'payments', 'insurance_received', 'insurance_claimed', 'profit'],
  })
  const [reportsByKey, setReportsByKey] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [budgetMessage, setBudgetMessage] = useState('')
  const [auditPreviewOpen, setAuditPreviewOpen] = useState(false)
  const [auditExportMessage, setAuditExportMessage] = useState('')
  const [savingBudgetKey, setSavingBudgetKey] = useState('')
  const [activeSheet, setActiveSheet] = useState('primary')

  useEffect(() => {
    if (!canCompareBranches) {
      setFilters((current) => {
        const lockedBranch = String(session?.branch_id ?? 1)
        if (current.primary_branch_id === lockedBranch) return current
        return { ...current, primary_branch_id: lockedBranch, comparison_branch_id: '' }
      })
    }
  }, [canCompareBranches, session?.branch_id])

  useEffect(() => {
    if (!canCompareBranches || selectedBranchId == null) return
    setFilters((current) => {
      const nextBranch = String(selectedBranchId)
      if (current.primary_branch_id === nextBranch) return current
      const nextComparison = nextBranch === '1' ? '2' : '1'
      return { ...current, primary_branch_id: nextBranch, comparison_branch_id: nextComparison }
    })
  }, [canCompareBranches, selectedBranchId])

  useEffect(() => {
    setComparisonState((current) => {
      if (current.mode === 'custom') return current
      if (current.mode === 'previous_year' || current.mode === 'previous_period') {
        return current
      }

      return {
        ...current,
        year: filters.year,
        start_month: filters.start_month,
        end_month: filters.end_month,
        branch_id: String(filters.comparison_branch_id || defaultComparisonBranch),
      }
    })
  }, [defaultComparisonBranch, filters.comparison_branch_id, filters.end_month, filters.start_month, filters.year])

  const primaryPeriods = useMemo(
    () => buildPeriodRange(filters.year, filters.start_month, filters.end_month),
    [filters.end_month, filters.start_month, filters.year],
  )

  const comparisonPeriods = useMemo(
    () => buildComparisonPeriods(filters, comparisonState),
    [comparisonState, filters.end_month, filters.start_month, filters.year],
  )

  const comparisonScope = useMemo(() => {
    const comparisonBranchId = comparisonState.mode === 'branch' || comparisonState.mode === 'custom'
      ? Number(comparisonState.branch_id || filters.comparison_branch_id || defaultComparisonBranch)
      : Number(filters.primary_branch_id)
    const branchName = BRANCHES.find((branch) => branch.id === comparisonBranchId)?.name ?? `Branch ${comparisonBranchId}`
    const label = comparisonState.mode === 'branch'
      ? `Branch comparison: ${branchName}`
      : comparisonState.mode === 'previous_year'
        ? `Previous year: ${buildPeriodRangeLabel(comparisonPeriods)}`
        : comparisonState.mode === 'previous_period'
          ? `Previous months: ${buildPeriodRangeLabel(comparisonPeriods)}`
          : `Custom scope: ${branchName} | ${buildPeriodRangeLabel(comparisonPeriods)}`

    return {
      ...comparisonState,
      branch_id: String(comparisonBranchId),
      branch_name: branchName,
      label,
      periods: comparisonPeriods,
    }
  }, [comparisonPeriods, comparisonState, defaultComparisonBranch, filters.comparison_branch_id, filters.primary_branch_id])

  useEffect(() => {
    if (!token || !session || !canAccessWorkbook) return
    let cancelled = false

    async function loadWorkbook() {
      setIsLoading(true)
      setError('')
      setBudgetMessage('')
      try {
        const requestMap = new Map()
        const primaryBranchId = Number(filters.primary_branch_id)
        const comparisonBranchId = Number(comparisonScope.branch_id)

        requestMap.set(`${primaryBranchId}:${filters.year}`, { branchId: primaryBranchId, year: filters.year })
        requestMap.set(`0:${filters.year}`, { branchId: 0, year: filters.year })

        const comparisonBranchForRequests = comparisonState.mode === 'branch' || comparisonState.mode === 'custom'
          ? comparisonBranchId
          : primaryBranchId

        comparisonPeriods.forEach((period) => {
          requestMap.set(`${comparisonBranchForRequests}:${period.year}`, { branchId: comparisonBranchForRequests, year: period.year })
        })

        const results = await Promise.all([...requestMap.values()].map(async ({ branchId, year }) => {
          try {
            const response = await apiFetch(`/finance/monitor-workbook?branch_id=${branchId}&year=${year}`, { token })
            return [`${branchId}:${year}`, response]
          } catch (requestError) {
            return [`${branchId}:${year}`, { error: requestError.message }]
          }
        }))

        if (cancelled) return
        const next = {}
        const errors = []
        results.forEach(([branchId, response]) => {
          if (response?.error) {
            errors.push(response.error)
            return
          }
          next[branchId] = response
        })
        setReportsByKey(next)
        if (errors.length) {
          setError(errors.join(' | '))
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadWorkbook()
    return () => {
      cancelled = true
    }
  }, [apiFetch, canAccessWorkbook, comparisonPeriods, comparisonScope.branch_id, filters.primary_branch_id, filters.year, session, token])

  const primaryReport = reportsByKey[`${filters.primary_branch_id}:${filters.year}`] ?? null
  const mergedReport = reportsByKey[`0:${filters.year}`] ?? primaryReport
  const selectedMonths = useMemo(() => monthRange(filters.start_month, filters.end_month), [filters.end_month, filters.start_month])
  const sheets = useMemo(() => buildWorkbookSheets({
    reportsByKey,
    primaryReport,
    mergedReport,
    selectedMonths,
    comparisonState: comparisonScope,
    primaryPeriods,
    comparisonPeriods,
  }), [comparisonPeriods, comparisonScope, mergedReport, primaryPeriods, primaryReport, reportsByKey, selectedMonths])
  const auditSheets = useMemo(() => {
    if (!primaryReport) return []

    return buildAuditWorkbookSheets({
      reportsByKey,
      primaryReport,
      mergedReport,
      selectedMonths,
      comparisonState: comparisonScope,
      primaryPeriods,
      comparisonPeriods,
      financeSales,
      financeExpenses,
    })
  }, [comparisonPeriods, comparisonScope, financeExpenses, financeSales, mergedReport, primaryPeriods, primaryReport, reportsByKey, selectedMonths])
  const activeSheetModel = sheets.find((sheet) => sheet.key === activeSheet) ?? sheets[0] ?? null
  const auditActiveSheetModel = auditSheets.find((sheet) => sheet.key === activeSheet) ?? auditSheets[0] ?? null
  const activeFinancialBudgets = activeSheetModel?.budgets ?? {}
  const auditNonTaxableRevenueTotal = useMemo(() => buildAuditNonTaxableRevenueTotal(financeSales), [financeSales])
  const auditNonDeductibleTotal = useMemo(() => buildAuditNonDeductibleTotal(financeExpenses), [financeExpenses])
  const summaryCards = useMemo(
    () => [
      ...buildSummaryCards(primaryReport, mergedReport, selectedMonths),
      ['Non-taxable Revenue', auditNonTaxableRevenueTotal, 'Revenue excluded from the taxable working view', 'today', 'shield'],
      ['Non-deductible Expenses', auditNonDeductibleTotal, 'Expenses excluded from the claimable view', 'alert', 'finance'],
    ],
    [auditNonDeductibleTotal, auditNonTaxableRevenueTotal, primaryReport, selectedMonths],
  )
  const availableYears = useMemo(() => {
    const now = currentYear()
    return Array.from({ length: 6 }, (_, index) => now - 3 + index)
  }, [])
  const canExport = Boolean(primaryReport && sheets.length)
  const comparisonSummaryRows = useMemo(() => {
    const primaryBranchId = Number(filters.primary_branch_id)
    const comparisonBranchId = Number(comparisonScope.branch_id || primaryBranchId)
    const sourceBranchId = comparisonScope.mode === 'branch' || comparisonScope.mode === 'custom'
      ? comparisonBranchId
      : primaryBranchId

    return (comparisonScope.metricKeys?.length ? comparisonScope.metricKeys : ['collections', 'payments', 'insurance_received', 'profit'])
      .map((metricKey, index) => {
        const spec = getMetricSpec(metricKey)
        const primaryValue = getSeriesValue(reportsByKey, primaryBranchId, primaryPeriods, metricKey)
        const comparisonValue = getSeriesValue(reportsByKey, sourceBranchId, comparisonPeriods, metricKey)
        const variance = primaryValue - comparisonValue
        const variancePercent = comparisonValue !== 0 ? variance / comparisonValue : 0

        return {
          index: index + 1,
          metricKey,
          label: spec.label,
          group: spec.group,
          primaryValue,
          comparisonValue,
          variance,
          variancePercent,
        }
      })
  }, [comparisonPeriods, comparisonScope.branch_id, comparisonScope.metricKeys, comparisonScope.mode, filters.primary_branch_id, primaryPeriods, reportsByKey])
  const comparisonTableLabels = useMemo(
    () => comparisonColumnLabel(filters, comparisonScope, filters.primary_branch_id),
    [comparisonScope, filters, filters.primary_branch_id],
  )

  useEffect(() => {
    if (!activeSheetModel && sheets[0]) {
      setActiveSheet(sheets[0].key)
    }
  }, [activeSheetModel, sheets])

  useEffect(() => {
    if (!auditPreviewOpen) return
    if (auditSheets.length && !auditActiveSheetModel) {
      setActiveSheet(auditSheets[0].key)
    }
  }, [auditActiveSheetModel, auditPreviewOpen, auditSheets])

  function updateReportBudget(branchId, lineKey, amount) {
    const reportKey = `${branchId}:${filters.year}`
    setReportsByKey((current) => {
      const report = current[reportKey]
      if (!report) return current
      return {
        ...current,
        [reportKey]: {
          ...report,
          budgets: {
            ...(report.budgets ?? {}),
            [lineKey]: amount,
          },
        },
      }
    })
  }

  async function saveReportBudget(branchId, lineKey, amount) {
    try {
      setSavingBudgetKey(lineKey)
      setBudgetMessage('')
      const response = await apiFetch('/finance/monitor-budgets', {
        method: 'POST',
        token,
        body: {
          branch_id: Number(branchId),
          year: Number(filters.year),
          line_key: lineKey,
          amount: Number(amount || 0),
        },
      })
      updateReportBudget(branchId, lineKey, response.amount)
      setBudgetMessage(`Saved budget for ${lineKey.replace(/^financial:/, '').replace(/:/g, ' / ').replace(/-/g, ' ')}`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingBudgetKey('')
    }
  }

  function openAuditPreview() {
    setError('')
    setAuditExportMessage('')
    setAuditPreviewOpen(true)
    if (auditSheets.length) {
      const currentAuditSheet = auditSheets.find((sheet) => sheet.key === activeSheet) ?? auditSheets[0]
      if (currentAuditSheet) {
        setActiveSheet(currentAuditSheet.key)
      }
    }
  }

  function closeAuditPreview() {
    setAuditPreviewOpen(false)
    setAuditExportMessage('')
  }

  function handleAuditReportExport() {
    try {
      setError('')
      setAuditExportMessage('')
      exportAuditWorkbook({
        reportsByKey,
        primaryReport,
        mergedReport,
        selectedMonths,
        comparisonState,
        primaryPeriods,
        comparisonPeriods,
        financeSales,
        financeExpenses,
        comparisonScope,
      })
      setAuditExportMessage('Audit workbook download started.')
    } catch (requestError) {
      setAuditExportMessage('')
      setError(requestError instanceof Error ? requestError.message : 'Unable to export the audit workbook right now.')
    }
  }

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

  if (!canAccessWorkbook) {
    return (
      <section className="finance-section">
        <div className="message-banner error">Only the accountant, General Manager, and executives can access this report workbook.</div>
      </section>
    )
  }

  if (auditPreviewOpen) {
    return (
      <section className="finance-section report-workbook-shell">
        <header className="report-workbook-hero">
          <div>
            <p className="eyebrow">Audit Preview</p>
            <h3>Review the audit workbook before exporting</h3>
            <p className="header-copy">
              This preview mirrors the workbook layout so you can inspect the sheets and totals before downloading the Excel file.
            </p>
          </div>
          <div className="report-workbook-actions">
            <button type="button" className="ghost-button" onClick={closeAuditPreview}>Back to reports page</button>
            <button type="button" className="primary-button" onClick={handleAuditReportExport} disabled={!primaryReport}>Export to Excel</button>
          </div>
        </header>

        {error ? <div className="message-banner error">{error}</div> : null}
        {auditExportMessage ? <div className="message-banner success">{auditExportMessage}</div> : null}
        {isLoading ? <div className="message-banner">Refreshing workbook data for the selected year and branches...</div> : null}

        <nav className="report-tab-strip" aria-label="Audit workbook sheets">
          {auditSheets.map((sheet) => (
            <button
              key={sheet.key}
              type="button"
              className={activeSheet === sheet.key ? 'report-tab-button is-active' : 'report-tab-button'}
              onClick={() => setActiveSheet(sheet.key)}
            >
              {sheet.title}
            </button>
          ))}
        </nav>

        <article className="panel report-sheet workbook-sheet-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{auditActiveSheetModel?.title ?? 'Audit Workbook'}</p>
              <h3>{auditActiveSheetModel?.subtitle ?? 'Select a sheet to preview'}</h3>
            </div>
            <span className="panel-tag">
              {selectedMonths.length ? `${monthName(selectedMonths[0], false)} - ${monthName(selectedMonths[selectedMonths.length - 1], false)} ${filters.year}` : filters.year}
            </span>
          </div>

          {!primaryReport ? (
            <div className="message-banner">Loading workbook data...</div>
          ) : auditActiveSheetModel ? (
            auditActiveSheetModel.kind === 'financial'
              ? (
                <FinancialWorkbookPreview
                  sheet={auditActiveSheetModel}
                  budgets={auditActiveSheetModel.budgets ?? {}}
                  onBudgetChange={(lineKey, amount, save = false) => {
                    updateReportBudget(auditActiveSheetModel.branchId ?? filters.primary_branch_id, lineKey, amount)
                    if (save) {
                      saveReportBudget(auditActiveSheetModel.branchId ?? filters.primary_branch_id, lineKey, amount)
                    }
                  }}
                  savingBudgetKey={savingBudgetKey}
                />
              )
              : auditActiveSheetModel.key.startsWith('daily-')
                ? <DailySalesPreview sheet={auditActiveSheetModel} />
                : <WorkbookPreviewTable sheet={auditActiveSheetModel} />
          ) : (
            <div className="message-banner">No workbook sheet is available for the current selection.</div>
          )}
        </article>
      </section>
    )
  }

  return (
    <section className="finance-section report-workbook-shell">
      <header className="report-workbook-hero">
        <div>
          <p className="eyebrow">Reports</p>
          <h3>Workbook-style branch reporting</h3>
          <p className="header-copy">
            This page mirrors the attached Excel workbook structure, keeps the sheet tabs visible on screen, and lets you preview the audit workbook before exporting a real `.xlsx` file.
          </p>
        </div>
        <div className="report-workbook-actions">
          <button type="button" className="ghost-button" onClick={() => window.print()} disabled={!activeSheetModel}>Print / Save PDF</button>
          <button type="button" className="primary-button" onClick={() => exportWorkbook(sheets, primaryReport, selectedMonths, comparisonScope)} disabled={!canExport}>Export Excel workbook</button>
          <button type="button" className="ghost-button" onClick={openAuditPreview} disabled={!canExport}>Audit Report</button>
        </div>
      </header>

      {error ? <div className="message-banner error">{error}</div> : null}
      {budgetMessage ? <div className="message-banner success">{budgetMessage}</div> : null}
      {auditExportMessage ? <div className="message-banner success">{auditExportMessage}</div> : null}
      {isLoading ? <div className="message-banner">Refreshing workbook data for the selected year and branches...</div> : null}

      <section className="report-toolbar-grid report-workbook-toolbar">
        <label>
          Year
          <select value={filters.year} onChange={(event) => setFilters((current) => ({ ...current, year: Number(event.target.value) }))}>
            {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>

        <label>
          Start month
          <select value={filters.start_month} onChange={(event) => setFilters((current) => ({ ...current, start_month: event.target.value }))}>
            {MONTHS.map((month) => <option key={month.value} value={month.value}>{month.long}</option>)}
          </select>
        </label>

        <label>
          End month
          <select value={filters.end_month} onChange={(event) => setFilters((current) => ({ ...current, end_month: event.target.value }))}>
            {MONTHS.map((month) => <option key={month.value} value={month.value}>{month.long}</option>)}
          </select>
        </label>

        <label>
          Primary branch
          <select
            value={filters.primary_branch_id}
            disabled={!canCompareBranches}
            onChange={(event) => setFilters((current) => ({ ...current, primary_branch_id: event.target.value }))}
          >
            {BRANCHES.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>

        <label>
          Comparison mode
          <select
            value={comparisonScope.mode}
            onChange={(event) => setComparisonState((current) => ({ ...current, mode: event.target.value }))}
          >
            {COMPARISON_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </select>
        </label>

        {(comparisonScope.mode === 'branch' || comparisonScope.mode === 'custom') ? (
          <label>
            Comparison branch
            <select
              value={comparisonScope.branch_id}
              disabled={!canCompareBranches}
              onChange={(event) => setComparisonState((current) => ({ ...current, branch_id: event.target.value }))}
            >
              {BRANCHES.filter((branch) => branch.id !== 0).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
        ) : null}

        {comparisonScope.mode === 'custom' ? (
          <>
            <label>
              Comparison year
              <select value={comparisonScope.year} onChange={(event) => setComparisonState((current) => ({ ...current, year: Number(event.target.value) }))}>
                {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label>
              Comparison start month
              <select value={comparisonScope.start_month} onChange={(event) => setComparisonState((current) => ({ ...current, start_month: event.target.value }))}>
                {MONTHS.map((month) => <option key={month.value} value={month.value}>{month.long}</option>)}
              </select>
            </label>
            <label>
              Comparison end month
              <select value={comparisonScope.end_month} onChange={(event) => setComparisonState((current) => ({ ...current, end_month: event.target.value }))}>
                {MONTHS.map((month) => <option key={month.value} value={month.value}>{month.long}</option>)}
              </select>
            </label>
          </>
        ) : null}
      </section>

      <section className="stats-grid patient-stats-grid report-summary-strip">
        {summaryCards.map(([label, value, note, className, icon]) => (
          <StatWidget key={label} label={label} value={formatMoney(value)} note={note} icon={icon} className={className} />
        ))}
      </section>

      <article className="panel report-sheet report-comparison-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Comparison Lab</p>
            <h3>Choose the variables and scope you want to compare</h3>
          </div>
          <span className="panel-tag">{comparisonScope.label}</span>
        </div>

        <div className="report-comparison-meta">
          <div className="report-comparison-meta-card">
            <span>Primary scope</span>
            <strong>{buildPeriodRangeLabel(primaryPeriods)} | {BRANCHES.find((branch) => branch.id === Number(filters.primary_branch_id))?.name ?? 'Primary branch'}</strong>
          </div>
          <div className="report-comparison-meta-card">
            <span>Comparison scope</span>
            <strong>{buildPeriodRangeLabel(comparisonPeriods)} | {comparisonScope.branch_name ?? 'Comparison'}</strong>
          </div>
          <div className="report-comparison-meta-card">
            <span>Selected metrics</span>
            <strong>{comparisonScope.metricKeys?.length ?? 0}</strong>
          </div>
        </div>

        <div className="report-metric-selector">
          {Object.entries(COMPARISON_METRICS.reduce((groups, metric) => {
            if (!groups[metric.group]) groups[metric.group] = []
            groups[metric.group].push(metric)
            return groups
          }, {})).map(([group, metrics]) => (
            <div key={group} className="report-metric-group">
              <p className="eyebrow">{group}</p>
              <div className="report-metric-grid">
                {metrics.map((metric) => {
                  const isActive = comparisonScope.metricKeys?.includes(metric.key)
                  return (
                    <label key={metric.key} className={isActive ? 'report-metric-pill is-active' : 'report-metric-pill'}>
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => setComparisonState((current) => {
                          const currentKeys = current.metricKeys ?? []
                          const nextKeys = currentKeys.includes(metric.key)
                            ? currentKeys.filter((key) => key !== metric.key)
                            : [...currentKeys, metric.key]
                          return { ...current, metricKeys: nextKeys }
                        })}
                      />
                      <span>{metric.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="table-shell">
          <table className="portal-table report-table report-detail-table">
            <thead>
              <tr>
                <th>SN</th>
                <th>Metric</th>
                <th>Group</th>
                <th>{comparisonTableLabels.primaryLabel}</th>
                <th>{comparisonTableLabels.comparisonLabel}</th>
                <th>Variance</th>
                <th>Variance %</th>
              </tr>
            </thead>
            <tbody>
              {comparisonSummaryRows.length ? comparisonSummaryRows.map((row) => (
                <tr key={row.metricKey}>
                  <td>{row.index}</td>
                  <td>{row.label}</td>
                  <td>{row.group}</td>
                  <td>{formatMoney(row.primaryValue)}</td>
                  <td>{formatMoney(row.comparisonValue)}</td>
                  <td>{formatMoney(row.variance)}</td>
                  <td>{formatPercentRatio(row.variancePercent)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7">Choose at least one metric to generate the comparison preview.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <nav className="report-tab-strip" aria-label="Workbook sheets">
        {sheets.map((sheet) => (
          <button
            key={sheet.key}
            type="button"
            className={activeSheet === sheet.key ? 'report-tab-button is-active' : 'report-tab-button'}
            onClick={() => setActiveSheet(sheet.key)}
          >
            {sheet.title}
          </button>
        ))}
      </nav>

      <article className="panel report-sheet workbook-sheet-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{activeSheetModel?.title ?? 'Workbook'}</p>
            <h3>{activeSheetModel?.subtitle ?? 'Select a sheet to preview'}</h3>
          </div>
          <span className="panel-tag">
            {selectedMonths.length ? `${monthName(selectedMonths[0], false)} - ${monthName(selectedMonths[selectedMonths.length - 1], false)} ${filters.year}` : filters.year}
          </span>
        </div>

        {!primaryReport ? (
          <div className="message-banner">Loading workbook data...</div>
        ) : activeSheetModel ? (
          activeSheetModel.kind === 'financial'
            ? (
              <FinancialWorkbookPreview
                sheet={activeSheetModel}
                budgets={activeFinancialBudgets}
                onBudgetChange={(lineKey, amount, save = false) => {
                  updateReportBudget(activeSheetModel.branchId ?? filters.primary_branch_id, lineKey, amount)
                  if (save) {
                    saveReportBudget(activeSheetModel.branchId ?? filters.primary_branch_id, lineKey, amount)
                  }
                }}
                savingBudgetKey={savingBudgetKey}
              />
            )
            : activeSheetModel.key.startsWith('daily-')
              ? <DailySalesPreview sheet={activeSheetModel} />
              : <WorkbookPreviewTable sheet={activeSheetModel} />
        ) : (
          <div className="message-banner">No workbook sheet is available for the current selection.</div>
        )}
      </article>

      {isAccountant ? (
        <ReportWorkflowSection
          apiFetch={apiFetch}
          token={token}
          session={session}
          selectedBranchId={selectedBranchId}
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
    </section>
  )
}
