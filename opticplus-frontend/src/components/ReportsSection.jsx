import { Fragment, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx-js-style'
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

function buildFinancialSheet(report, selectedMonths, branchLabel) {
  const months = buildSelectedMonths(report, selectedMonths)
  const monthsWide = months.map((item) => item.short)
  const budgets = report?.budgets ?? {}
  const columnCount = 2 + 5 + monthsWide.length + 1
  const monthsCount = monthsWide.length
  const title = `${String(branchLabel).toUpperCase()} REC & PAYMENT`
  const subtitle = `FINANCIAL DETAILS FOR THE PERIOD ${months[0]?.long ?? 'JANUARY'} TO ${months[months.length - 1]?.long ?? 'DECEMBER'} ${report?.year ?? currentYear()}`
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
      }))
      .filter((row) => row.months.some((amount) => amount !== 0)),
  ]

  const salaryRows = (report?.salary_rows ?? []).map((row) => ({
    label: `SALARY - ${String(row.label ?? row.name ?? '').toUpperCase()}`,
    key: financialLineKey('salary', row.employee_id ?? row.label ?? row.name),
    months: selectedMonths.map((month) => toNumber(row?.months?.[Number(month) - 1])),
  }))
  const expenseRows = (report?.expense_categories ?? []).map((row) => ({
    label: row.label.toUpperCase(),
    key: financialLineKey('expense', row.label),
    months: selectedMonths.map((month) => toNumber(row?.months?.[Number(month) - 1])),
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

function buildInsuranceSheet(primaryReport, comparisonReport, selectedMonths) {
  const monthRowsPrimary = buildSelectedMonths(primaryReport, selectedMonths)
  const monthRowsComparison = comparisonReport ? buildSelectedMonths(comparisonReport, selectedMonths) : monthRowsPrimary.map((item) => ({ ...item, data: null }))
  const labels = selectedMonths.map((month) => monthName(month, true))
  const title = 'INSURANCE'
  const subtitle = 'MONTHLY INSURANCE CLAIMS'

  const claimsPrimary = monthRowsPrimary.map((item) => toNumber(item.data.insurance_claimed))
  const claimsComparison = monthRowsComparison.map((item) => toNumber(item.data?.insurance_claimed))
  const receivedPrimary = monthRowsPrimary.map((item) => toNumber(item.data.insurance_received))
  const receivedComparison = monthRowsComparison.map((item) => toNumber(item.data?.insurance_received))
  const claimsTotal = claimsPrimary.map((amount, index) => amount + claimsComparison[index])
  const receivedTotal = receivedPrimary.map((amount, index) => amount + receivedComparison[index])

  const rows = [
    { kind: 'title', cells: ['BEALET OPTICALS'] },
    { kind: 'title', cells: [subtitle] },
    { kind: 'title', cells: ['MONTHLY INSURANCE CLAIMS'] },
    { kind: 'header', cells: ['SN', 'DETAILS', ...labels, 'TOTAL'] },
    { kind: 'data', cells: ['1.1', `INSURANCE CLAIMS - ${primaryReport?.branch_name ?? 'PRIMARY'}`.toUpperCase(), ...claimsPrimary, sumArray(claimsPrimary)] },
    { kind: 'data', cells: ['1.2', `INSURANCE CLAIMS - ${comparisonReport?.branch_name ?? 'COMPARISON'}`.toUpperCase(), ...claimsComparison, sumArray(claimsComparison)] },
    { kind: 'total', cells: ['', 'TOTAL', ...claimsTotal, sumArray(claimsTotal)] },
    { kind: 'data', cells: ['2.1', `INSURANCE RECEIVED - ${primaryReport?.branch_name ?? 'PRIMARY'}`.toUpperCase(), ...receivedPrimary, sumArray(receivedPrimary)] },
    { kind: 'data', cells: ['2.2', `INSURANCE RECEIVED - ${comparisonReport?.branch_name ?? 'COMPARISON'}`.toUpperCase(), ...receivedComparison, sumArray(receivedComparison)] },
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

function buildWorkbookSheets({ primaryReport, comparisonReport, mergedReport, selectedMonths }) {
  if (!primaryReport) return []

  const sheets = []
  sheets.push(buildFinancialSheet(primaryReport, selectedMonths, primaryReport.branch_name))
  if (comparisonReport && comparisonReport.branch_id !== primaryReport.branch_id) {
    sheets.push(buildFinancialSheet(comparisonReport, selectedMonths, comparisonReport.branch_name))
  }
  sheets.push(buildDailySalesSheet(primaryReport, selectedMonths, primaryReport.branch_name))
  sheets.push(buildInsuranceSheet(primaryReport, comparisonReport, selectedMonths))
  sheets.push(buildPurchasesSheet(primaryReport, mergedReport ?? primaryReport, selectedMonths))
  sheets.push(buildWorkingCapitalSheet(mergedReport ?? primaryReport, selectedMonths))

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
                  {typeof cell === 'number' ? formatMoney(cell) : cell}
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

    for (let columnIndex = 0; columnIndex < rowValues.length; columnIndex += 1) {
      const value = rowValues[columnIndex]
      const isNumeric = typeof value === 'number' && Number.isFinite(value)
      const isFirstColumn = columnIndex === 0
      const isDetailColumn = columnIndex === 1
      const isPercentColumn = sheet.key.startsWith('financial-') && (columnIndex === 2 || columnIndex === achievedIndex)
      const isMoneyColumn = sheet.key.startsWith('financial-')
        ? (columnIndex === totalIndex || columnIndex === balanceIndex || columnIndex === monthlyBudgetIndex || (columnIndex >= 4 && columnIndex < totalIndex))
        : isNumeric
      const style = rowKind === 'title'
        ? rowIndex === 0
          ? XLSX_STYLES.title
          : rowIndex === 1
            ? XLSX_STYLES.subtitle
            : XLSX_STYLES.section
        : rowKind === 'section'
          ? XLSX_STYLES.section
          : rowKind === 'header'
            ? XLSX_STYLES.header
            : rowKind === 'total'
              ? isFirstColumn
                ? XLSX_STYLES.totalLabel
                : isPercentColumn
                  ? XLSX_STYLES.percent
                  : XLSX_STYLES.total
              : isNumeric
                ? (isPercentColumn ? XLSX_STYLES.percent : isMoneyColumn ? XLSX_STYLES.dataNumber : XLSX_STYLES.dataNumber)
                : isFirstColumn
                  ? XLSX_STYLES.dataText
                  : isDetailColumn
                    ? XLSX_STYLES.dataText
                    : isPercentColumn
                      ? XLSX_STYLES.percent
                      : XLSX_STYLES.dataNumber

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
  const selected = buildSelectedMonths(mergedReport ?? primaryReport, selectedMonths)
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

function workbookFileName(primaryReport, selectedMonths) {
  const start = monthName(selectedMonths[0], false)
  const end = monthName(selectedMonths[selectedMonths.length - 1], false)
  return `bealet-report-${slugify(primaryReport?.branch_name)}-${start.toLowerCase()}-${end.toLowerCase()}-${primaryReport?.year ?? currentYear()}.xlsx`
}

function exportWorkbook(sheets, primaryReport, selectedMonths) {
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
  anchor.download = workbookFileName(primaryReport, selectedMonths)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export default function ReportsSection({ apiFetch, token, session, selectedBranchId }) {
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
  const [reportsByBranch, setReportsByBranch] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [budgetMessage, setBudgetMessage] = useState('')
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
    if (!token || !session || !canAccessWorkbook) return
    let cancelled = false

    async function loadWorkbook() {
      setIsLoading(true)
      setError('')
      setBudgetMessage('')
      try {
        const branchIds = [0, Number(filters.primary_branch_id)]
        if (filters.comparison_branch_id) {
          branchIds.push(Number(filters.comparison_branch_id))
        }

        const uniqueBranchIds = [...new Set(branchIds.filter((value) => Number.isFinite(value)))]
        const results = await Promise.all(uniqueBranchIds.map(async (branchId) => {
          try {
            const response = await apiFetch(`/finance/monitor-workbook?branch_id=${branchId}&year=${filters.year}`, { token })
            return [String(branchId), response]
          } catch (requestError) {
            return [String(branchId), { error: requestError.message }]
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
        setReportsByBranch(next)
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
  }, [apiFetch, canAccessWorkbook, filters.primary_branch_id, filters.comparison_branch_id, filters.year, session, token])

  const primaryReport = reportsByBranch[filters.primary_branch_id] ?? null
  const comparisonReport = filters.comparison_branch_id ? (reportsByBranch[filters.comparison_branch_id] ?? null) : null
  const mergedReport = reportsByBranch['0'] ?? primaryReport
  const selectedMonths = useMemo(() => monthRange(filters.start_month, filters.end_month), [filters.end_month, filters.start_month])
  const sheets = useMemo(() => buildWorkbookSheets({
    primaryReport,
    comparisonReport,
    mergedReport,
    selectedMonths,
  }), [comparisonReport, mergedReport, primaryReport, selectedMonths])
  const activeSheetModel = sheets.find((sheet) => sheet.key === activeSheet) ?? sheets[0] ?? null
  const activeFinancialBudgets = activeSheetModel?.budgets ?? {}
  const summaryCards = useMemo(() => buildSummaryCards(primaryReport, mergedReport, selectedMonths), [mergedReport, primaryReport, selectedMonths])
  const availableYears = useMemo(() => {
    const now = currentYear()
    return Array.from({ length: 6 }, (_, index) => now - 3 + index)
  }, [])
  const canExport = Boolean(primaryReport && sheets.length)

  useEffect(() => {
    if (!activeSheetModel && sheets[0]) {
      setActiveSheet(sheets[0].key)
    }
  }, [activeSheetModel, sheets])

  function updateReportBudget(branchId, lineKey, amount) {
    setReportsByBranch((current) => {
      const report = current[String(branchId)]
      if (!report) return current
      return {
        ...current,
        [String(branchId)]: {
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

  return (
    <section className="finance-section report-workbook-shell">
      <header className="report-workbook-hero">
        <div>
          <p className="eyebrow">Reports</p>
          <h3>Workbook-style branch reporting</h3>
          <p className="header-copy">
            This page mirrors the attached Excel workbook structure, keeps the sheet tabs visible on screen, and exports a real `.xlsx` file with the same tab order.
          </p>
        </div>
        <div className="report-workbook-actions">
          <button type="button" className="ghost-button" onClick={() => window.print()} disabled={!activeSheetModel}>Print / Save PDF</button>
          <button type="button" className="primary-button" onClick={() => exportWorkbook(sheets, primaryReport, selectedMonths)} disabled={!canExport}>Export Excel workbook</button>
        </div>
      </header>

      {error ? <div className="message-banner error">{error}</div> : null}
      {budgetMessage ? <div className="message-banner success">{budgetMessage}</div> : null}
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
          Comparison branch
          <select
            value={filters.comparison_branch_id}
            disabled={!canCompareBranches}
            onChange={(event) => setFilters((current) => ({ ...current, comparison_branch_id: event.target.value }))}
          >
            <option value="">No comparison</option>
            {BRANCHES.filter((branch) => branch.id !== 0).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
      </section>

      <section className="stats-grid patient-stats-grid report-summary-strip">
        {summaryCards.map(([label, value, note, className, icon]) => (
          <StatWidget key={label} label={label} value={formatMoney(value)} note={note} icon={icon} className={className} />
        ))}
      </section>

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
