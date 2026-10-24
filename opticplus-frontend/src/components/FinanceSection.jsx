import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'
import { escapePrintHtml, openPrintDocumentWindow, writePrintDocumentWindow } from '../utils/printDocuments.js'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

function buildExpenseMemoBody(form) {
  const amount = form.amount ? currency.format(Number(form.amount)) : 'GH₵ [amount]'
  const purpose = form.memo_purpose || form.description || form.category || '[purpose/reason]'
  const period = form.memo_period || form.date || '[period/description]'
  const method = form.memo_payment_method || 'bank'
  return `Seeking approval for the disbursement of funds. The amount in total to be disbursed is ${amount}. This payment is to settle the ${purpose} for the ${period}. The payment will be made through ${method}.\n\nThank you for your cooperation.`
}

function buildExpenseMemoSubject(form) {
  return `Expense approval: ${form.description || form.category || 'New expense'}`
}

function updateExpenseMemoFields(current, changes) {
  const previousGeneratedBody = buildExpenseMemoBody(current)
  const previousGeneratedSubject = buildExpenseMemoSubject(current)
  const bodyWasGenerated = !current.memo_justification || current.memo_justification === previousGeneratedBody
  const subjectWasGenerated = !current.memo_subject || current.memo_subject === previousGeneratedSubject
  const next = { ...current, ...changes }
  if (bodyWasGenerated) next.memo_justification = buildExpenseMemoBody(next)
  if (subjectWasGenerated) next.memo_subject = buildExpenseMemoSubject(next)
  return next
}

function ExpenseApprovalMemoSignature({ request, token, signerRole = 'accountant' }) {
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!request?.id || !token) return undefined
    let cancelled = false
    let objectUrl = ''
    const apiBase = (import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api/v1`).replace(/\/+$/, '')
    const signatureEndpoint = signerRole === 'gm' ? 'gm-signature' : 'memo-signature'
    const imageEndpoint = `${apiBase}/finance/expense-approvals/${request.id}/${signatureEndpoint}?branch_id=${request.branch_id}`

    fetch(imageEndpoint, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) {
          let message = `Signature image request failed (HTTP ${response.status}).`
          try {
            message = (await response.json()).message || message
          } catch {
          }
          throw new Error(message)
        }
        return response.blob()
      })
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setImageUrl(objectUrl)
        setError('')
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [request?.branch_id, request?.id, signerRole, token])

  return (
    <div className="expense-approval-memo-signature">
      <strong>{signerRole === 'gm' ? 'General Manager signature' : 'Accountant signature'} · {signerRole === 'gm' ? request.supporting_document?.gm_signature_name || request.reviewed_by_name || 'General Manager' : request.supporting_document?.memo_signature_name || request.submitted_by_name || 'Accountant'}</strong>
      {imageUrl ? <img src={imageUrl} alt={signerRole === 'gm' ? 'GM signature on approved Certificate of Honour' : 'Accountant signature on expense memo'} /> : <small>{error || 'Loading saved signature...'}</small>}
    </div>
  )
}

function buildCertificateOfHonourPage(request) {
  const document = request.supporting_document ?? {}
  const amount = currency.format(Number(request.amount ?? 0))
  const gmSignature = document.gm_signature_data_url
    ? `<img src="${escapePrintHtml(document.gm_signature_data_url)}" alt="General Manager signature" />`
    : '<em>GM signature was not captured when this request was approved.</em>'
  const details = [
    ['Certificate No.', `COH-${request.branch_id}-${request.id}`],
    ['Submitted by', request.submitted_by_name || 'Staff'],
    ['Branch', document.branch || (request.branch_id === 1 ? 'Labadi' : request.branch_id === 2 ? 'Madina' : `Branch ${request.branch_id}`)],
    ['Category', request.category || 'Expense'],
    ['Expense date', request.date || 'Not provided'],
    ['Approved', request.reviewed_at || 'Approved'],
  ]
  return `<div class="certificate-of-honour-print">
    <div class="doc-topline"><div><p class="doc-kicker">Expense clearance record</p><h1>Certificate of Honour</h1></div><p class="doc-reference">No. ${escapePrintHtml(`COH-${request.branch_id}-${request.id}`)}</p></div>
    <div class="details-grid">${details.map(([label, value]) => `<div class="detail-line"><b>${escapePrintHtml(label)}:</b><span>${escapePrintHtml(value)}</span></div>`).join('')}</div>
    <table class="record-table"><thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead><tbody><tr><td>${escapePrintHtml(request.description || 'Expense')}</td><td class="amount">${escapePrintHtml(amount)}</td></tr></tbody></table>
    <div class="declaration"><strong>Declaration</strong><br />${escapePrintHtml(document.declaration || 'I certify that this expense was incurred for official business and that the details and amount above are accurate.')}</div>
    <div class="totals"><div class="grand"><span>Approved total</span><span>${escapePrintHtml(amount)}</span></div></div>
    ${request.decision_note ? `<div class="approval-note"><strong>General Manager note</strong><br />${escapePrintHtml(request.decision_note)}</div>` : ''}
    <div class="signature-row"><div class="signature"><strong>${escapePrintHtml(request.submitted_by_name || 'Staff')}</strong><span>Submitted by - ${escapePrintHtml(request.submitted_role || 'Staff')}</span></div><div class="signature">${gmSignature}<strong>${escapePrintHtml(document.gm_signature_name || request.reviewed_by_name || 'General Manager')}</strong><span>Approved by - ${escapePrintHtml(request.reviewed_at || '')}</span></div></div>
  </div>`
}

function isManualExpenseEligibleForCertificate(expense) {
  if (!expense.receipt_unavailable && !expense.gm_approved) return false
  if (expense.source_type) return false
  if (/^(frames?|lenses?|payroll|salary)/i.test(String(expense.category ?? '').trim())) return false
  return !/salary advance|payroll/i.test(String(expense.description ?? ''))
}

function buildManualExpenseCertificatePage(expense, branchName) {
  const amount = currency.format(Number(expense.amount ?? 0))
  const reference = `EXP-COH-${expense.branch_id}-${expense.expense_id}`
  const fields = [
    ['Certificate No.', reference],
    ['Expense ID', expense.expense_id],
    ['Entered by', expense.entered_by || 'Staff'],
    ['Branch', branchName || 'Active branch'],
    ['Category', expense.category || 'Expense'],
    ['Expense date', expense.date || 'Not provided'],
  ]
  return `
    <div class="doc-topline"><div><p class="doc-kicker">Internal backup record - no receipt available</p><h1>Certificate of Honour</h1></div><p class="doc-reference">No. ${escapePrintHtml(reference)}</p></div>
    <div class="details-grid">${fields.map(([label, value]) => `<div class="detail-line"><b>${escapePrintHtml(label)}:</b><span>${escapePrintHtml(value)}</span></div>`).join('')}</div>
    <table class="record-table"><thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead><tbody><tr><td>${escapePrintHtml(expense.description || 'Expense')}</td><td class="amount">${escapePrintHtml(amount)}</td></tr></tbody></table>
    <div class="declaration"><strong>Declaration</strong><br />I certify that this expense was incurred for official business, and that the recorded description, category, date, and amount are accurate.${expense.receipt_unavailable ? ' A supplier receipt was not available when this expense was recorded.' : ''}</div>
    <div class="approval-note"><strong>Supporting document notice</strong><br />This Certificate of Honour is an internal backup record generated from the expense ledger${expense.gm_approved ? ' for an expense approved by the General Manager' : ''}. It does not replace a supplier receipt or tax invoice.</div>
    <div class="totals"><div class="grand"><span>Recorded amount</span><span>${escapePrintHtml(amount)}</span></div></div>
    <div class="signature-row"><div class="signature"><strong>${escapePrintHtml(expense.entered_by || 'Expense recorder')}</strong><span>Entered by - ${escapePrintHtml(expense.date || '')}</span></div><div class="signature"><strong>&nbsp;</strong><span>General Manager review (if required)</span></div></div>`
}

const tabsByMode = {
  default: ['Payments', 'Sales', 'Expenses'],
  revenue: ['Sales', 'Payments'],
  sales: ['Sales'],
  receipts: ['Payments'],
  expenses: ['Expenses'],
  debt: ['Payments'],
}

const defaultTabByMode = {
  default: 'Payments',
  revenue: 'Sales',
  expenses: 'Expenses',
  debt: 'Payments',
}

const splitPaymentMethodOptions = ['Insurance', 'Cash', 'Mobile Money']
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function monthRange(monthValue) {
  if (!/^\d{4}-\d{2}$/.test(monthValue)) return { date_from: '', date_to: '' }

  const [year, month] = monthValue.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return {
    date_from: `${year}-${String(month).padStart(2, '0')}-01`,
    date_to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

function formatExpenseRangeLabel(filters) {
  if (filters?.start_date && filters?.end_date) {
    return `${filters.start_date} to ${filters.end_date}`
  }

  if (filters?.start_date) {
    return `From ${filters.start_date}`
  }

  if (filters?.end_date) {
    return `Through ${filters.end_date}`
  }

  return 'All expenses'
}

export default function FinanceSection(props) {
  const pageMode = props.pageMode ?? 'default'
  const financeTabs = useMemo(() => tabsByMode[pageMode] ?? tabsByMode.default, [pageMode])
  const expenseWorkspaceStorageKey = `opticplus:expense-workspace:${props.session?.id ?? props.session?.role ?? 'user'}:${pageMode}:${props.selectedBranchId ?? props.session?.branch_id ?? 'default'}`
  const [activeTab, setActiveTab] = useState(defaultTabByMode[pageMode] ?? 'Payments')
  const [activeExpenseWorkspace, setActiveExpenseWorkspace] = useState(() => {
    try {
      const storedWorkspace = window.sessionStorage.getItem(expenseWorkspaceStorageKey)
      return storedWorkspace === 'approvals' || (storedWorkspace === 'settings' && props.session?.role === 'manager') ? storedWorkspace : 'ledger'
    } catch {
      return 'ledger'
    }
  })
  useEffect(() => {
    try {
      window.sessionStorage.setItem(expenseWorkspaceStorageKey, activeExpenseWorkspace)
    } catch {
      // Keep tab switching available if browser storage is disabled.
    }
  }, [activeExpenseWorkspace, expenseWorkspaceStorageKey])

  function selectExpenseWorkspace(nextWorkspace) {
    setActiveExpenseWorkspace(nextWorkspace)
    try {
      window.sessionStorage.setItem(expenseWorkspaceStorageKey, nextWorkspace)
    } catch {
      // Keep tab switching available if browser storage is disabled.
    }
  }

  useEffect(() => {
    const nextDefault = defaultTabByMode[pageMode] ?? 'Payments'
    setActiveTab((current) => (financeTabs.includes(current) ? current : nextDefault))
  }, [financeTabs, pageMode])

  const headerByMode = {
    default: {
      eyebrow: 'Finance',
      title: 'Track sales, expenses, and payment follow-up',
      copy: 'Built around a receptionist workflow with search, processing, and ledger review.',
    },
    receipts: {
      eyebrow: 'Receipt Reprints',
      title: 'Find and reprint past receipts',
      copy: 'Focused on receipt lookup and reprint actions only.',
    },
    revenue: {
      eyebrow: 'Revenue Tracking',
      title: 'Track collected sales and insurance-inclusive revenue value',
      copy: 'Collected sales stay separate from deferred insurance, while still surfacing the full insured sales value.',
    },
    sales: {
      eyebrow: 'Sales',
      title: 'Track customer sales and loan or non-customer revenue',
      copy: 'Built from the legacy accountant sales page with transaction filters, loan revenue visibility, and export-ready sales history.',
    },
    expenses: {
      eyebrow: 'Expenses',
      title: 'Track and manage operating expenses',
      copy: 'Review spending patterns, record new expenses, and monitor cost pressure across the selected branch.',
    },
    debt: {
      eyebrow: 'Debt Management',
      title: 'Manage outstanding balances and follow-up collections',
      copy: 'Monitor unpaid bills, record collections, and keep an eye on pending insurance recoveries.',
    },
  }

  const pageHeader = headerByMode[pageMode] ?? headerByMode.default
  const expenseStats = props.financeExpenses?.stats ?? {}
  const isReceptionistExpensesPage = pageMode === 'expenses' && props.session?.role === 'receptionist' && !props.readOnly
  const selectedExpenseRangeTotal = Number(expenseStats.filtered_total ?? expenseStats.total ?? 0)
  const selectedExpenseRangeLabel = formatExpenseRangeLabel(props.financeExpenseFilters)
  const expenseSummaryCards = [
    ['Selected Range', selectedExpenseRangeTotal, `${selectedExpenseRangeLabel} total expense amount`, 'today', 'trend'],
    ['Today', expenseStats.today ?? props.financeSummary?.stats.expenses_month, 'Expenses posted today', 'seen', 'alert'],
    ['This Week', expenseStats.weekly, 'Weekly expense total', 'today', 'finance'],
    ['This Month', expenseStats.monthly ?? props.financeSummary?.stats.expenses_month, 'Monthly expense pressure', 'pending', 'trend'],
    ...(!isReceptionistExpensesPage ? [['This Year', expenseStats.yearly, 'Year-to-date spending', 'total', 'money']] : []),
  ]

  const summaryCardsByMode = {
    default: [
      ['Sales Today', props.financeSummary?.stats.sales_today, 'Collections posted today', 'seen', 'money'],
      ['Sales + Insurance', props.financeSummary?.stats.sales_with_insurance_month, 'This month with insured billings included', 'today', 'trend'],
      ['Expenses This Month', props.financeSummary?.stats.expenses_month, 'All tracked branch expenses', 'pending', 'alert'],
      ['Outstanding Balance', props.financeSummary?.stats.outstanding_balance, 'Open billing balances still to recover', 'total', 'finance'],
    ],
    revenue: [
      ['Collected Today', props.financeSummary?.stats.sales_today, 'Cash, MoMo, and Paystack already realized today', 'seen', 'money'],
      ['Collected This Month', props.financeSummary?.stats.sales_month, 'Immediate sales already accounted for this month', 'today', 'trend'],
      ['Insurance Value', props.financeSummary?.stats.insurance_billed_month, 'Insured billings raised this month but not treated as immediate sales', 'pending', 'shield'],
      ['Sales + Insurance', props.financeSummary?.stats.sales_with_insurance_month, 'Full monthly sales value including insurance-backed bills', 'total', 'finance'],
    ],
    sales: [
      ['Total Sales', props.financeSales?.stats.total_sales, 'Realized collections only: cash, mobile money, and Paystack in the current filter scope', 'seen', 'money'],
      ['Sales + Insurance', Number(props.financeSales?.stats.total_sales ?? 0) + Number(props.financeSales?.stats.insurance_billed_value ?? 0), 'Realized collections plus insurance-billed value in the same scope', 'today', 'receipt'],
      ['Loan Revenue', props.financeSales?.stats.loan_revenue_total, 'Collected sales not tied to a billing record', 'pending', 'finance'],
      ['Consultation (Allocated)', props.financeSales?.stats.allocated_consultation_total ?? props.financeSales?.stats.consultation_total, 'Payments applied first to consultation in billing priority order', 'today', 'money'],
      ['Lenses (Allocated)', props.financeSales?.stats.allocated_lens_total ?? props.financeSales?.stats.lens_total, 'Payments applied after consultation and before frames', 'today', 'receipt'],
      ['Frames (Allocated)', props.financeSales?.stats.allocated_frame_total ?? props.financeSales?.stats.frame_total, 'Payments applied after consultation and lenses', 'total', 'finance'],
      ['Other Allocated', props.financeSales?.stats.allocated_other_total, 'Collected payments not covered by known billing item balances', 'pending', 'shield'],
    ],
    expenses: expenseSummaryCards,
    debt: [
      ['Collected', props.financePayments?.stats.total_collected, 'Payments received for the active search window', 'seen', 'money'],
      ['Outstanding', props.financePayments?.stats.outstanding_balance, 'Balances still open for recovery', 'pending', 'finance'],
      ['Not Submitted Externally', props.financePayments?.stats.insurance_pending, 'Insurance billing not yet marked as submitted', 'today', 'shield'],
      ['Transactions', props.financePayments?.stats.transaction_count, 'Payment movements in the selected period', 'total', 'receipt', true],
    ],
  }
  const summaryCards = summaryCardsByMode[pageMode] ?? summaryCardsByMode.default
  const approvalRequests = props.financeExpenses?.approval_requests ?? []
  const requestSummaryCards = [
    ['Pending', approvalRequests.filter((request) => request.status === 'pending').length, 'Awaiting GM review', 'pending', 'alert', 'count'],
    ['Approved', approvalRequests.filter((request) => request.status === 'approved').length, 'Added to the expense ledger', 'seen', 'shield', 'count'],
    ['Rejected', approvalRequests.filter((request) => request.status === 'rejected').length, 'Not added to the ledger', 'today', 'alert', 'count'],
    ['Total Requests', approvalRequests.length, 'Pending and reviewed requests', 'total', 'receipt', 'count'],
  ]
  const showingExpenseRequests = activeTab === 'Expenses' && activeExpenseWorkspace === 'approvals'
  const displayedSummaryCards = showingExpenseRequests ? requestSummaryCards : summaryCards
  const displayedPageHeader = showingExpenseRequests
    ? {
        eyebrow: props.session?.role === 'manager' ? 'General Manager Review' : 'Expense Requests',
        title: props.session?.role === 'manager' ? 'Review expense requests' : 'My expense requests',
        copy: props.session?.role === 'manager'
          ? 'Review supporting documents and decide which staff expenses may be recorded.'
          : 'Track approval decisions for expenses you submitted.',
      }
    : pageHeader

  if (pageMode === 'revenue') {
    return <RevenueTrackingView {...props} pageHeader={pageHeader} summaryCards={summaryCards} />
  }

  if (pageMode === 'sales') {
    return <AccountantSalesView {...props} pageHeader={pageHeader} summaryCards={summaryCards} />
  }

  if (pageMode === 'receipts') {
    return <ReceiptReprintsOnlyView {...props} pageHeader={pageHeader} />
  }

  return (
    <section className="finance-section">
      <div className={showingExpenseRequests ? 'finance-request-overview' : undefined}>
        <div className="patients-header">
          <div>
            <p className="eyebrow">{displayedPageHeader.eyebrow}</p>
            <h3>{displayedPageHeader.title}</h3>
            <p className="header-copy">{displayedPageHeader.copy}</p>
          </div>
        </div>
        <section className={`stats-grid patient-stats-grid${showingExpenseRequests ? ' expense-request-stats' : ''}`}>
          {displayedSummaryCards.map(([label, value, note, className, icon, valueType]) => (
            <StatWidget
              key={label}
              label={label}
              value={valueType === 'count' || label === 'Transactions'
                ? String(Number(value ?? 0))
                : props.isLoadingFinanceSummary && !props.financeSummary
                  ? '...'
                  : currency.format(Number(value ?? 0))}
              note={note}
              icon={icon}
              className={className}
            />
          ))}
        </section>
      </div>

      {props.financeError ? <div className="message-banner error">{props.financeError}</div> : null}
      {props.financeSuccess ? <div className="message-banner success">{props.financeSuccess}</div> : null}

      {financeTabs.length > 1 ? (
        <div className="finance-tabs">
          {financeTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={tab === activeTab ? 'nav-item finance-tab active' : 'nav-item finance-tab'}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      ) : null}

      {activeTab === 'Payments' ? <PaymentsTab {...props} /> : null}
      {activeTab === 'Sales' ? <SalesTab {...props} /> : null}
      {activeTab === 'Expenses' ? (
        <div className="finance-tab-content">
          <ExpensesTab {...props} activeExpenseWorkspace={activeExpenseWorkspace} setActiveExpenseWorkspace={selectExpenseWorkspace} />
        </div>
      ) : null}
    </section>
  )
}

function RevenueTrackingView(props) {
  const salesStats = props.financeSales?.stats ?? {}
  const expenseStats = props.financeExpenses?.stats ?? {}
  const summaryStats = props.financeSummary?.stats ?? {}
  const salesTotal = Number(salesStats.total_sales ?? 0)
  const insuranceValue = Number(salesStats.insurance_billed_value ?? summaryStats.insurance_billed_month ?? 0)
  const combinedRevenue = salesTotal + insuranceValue
  const expenseTotal = Number(expenseStats.filtered_total ?? expenseStats.total ?? 0)
  const grossProfit = salesTotal - expenseTotal
  const netCollected = salesTotal - expenseTotal
  const collectionRate = combinedRevenue > 0 ? (salesTotal / combinedRevenue) * 100 : 0
  const grossProfitClassName = grossProfit < 0 ? 'finance-loss' : 'finance-profit'
  const paymentBreakdown = buildPaymentFamilyBreakdown(props.financeSales?.payment_methods ?? [])
  const topExpenseCategories = (props.financeExpenses?.category_breakdown ?? []).slice(0, 5)

  useEffect(() => {
    const liveUpdateDelay = props.financeSalesFilters.search || props.financeExpenseFilters.search ? 220 : 0
    const timeoutId = window.setTimeout(() => {
      props.setFinanceSalesQuery((current) => {
        const next = {
          ...current,
          search: props.financeSalesFilters.search,
          payment_method: props.financeSalesFilters.payment_method,
          date_from: props.financeSalesFilters.date_from,
          date_to: props.financeSalesFilters.date_to,
          page: 1,
        }

        return ['search', 'payment_method', 'date_from', 'date_to', 'page']
          .every((key) => (current?.[key] ?? '') === (next?.[key] ?? ''))
          ? current
          : next
      })

      props.setFinanceExpenseQuery((current) => {
        const next = {
          ...current,
          filter: 'all',
          start_date: props.financeExpenseFilters.start_date,
          end_date: props.financeExpenseFilters.end_date,
          category: props.financeExpenseFilters.category,
          search: props.financeExpenseFilters.search,
          sort: props.financeExpenseFilters.sort ?? 'date_desc',
          page: 1,
        }

        return ['filter', 'start_date', 'end_date', 'category', 'search', 'sort', 'page']
          .every((key) => (current?.[key] ?? '') === (next?.[key] ?? ''))
          ? current
          : next
      })
    }, liveUpdateDelay)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [props.financeExpenseFilters, props.financeSalesFilters, props.setFinanceExpenseQuery, props.setFinanceSalesQuery])

  function applyRevenueFilters(event) {
    event.preventDefault()
    props.setFinanceSalesQuery((current) => ({
      ...current,
      search: props.financeSalesFilters.search,
      payment_method: props.financeSalesFilters.payment_method,
      date_from: props.financeSalesFilters.date_from,
      date_to: props.financeSalesFilters.date_to,
      page: 1,
    }))
    props.setFinanceExpenseQuery((current) => ({
      ...current,
      filter: 'all',
      start_date: props.financeExpenseFilters.start_date,
      end_date: props.financeExpenseFilters.end_date,
      category: props.financeExpenseFilters.category,
      search: props.financeExpenseFilters.search,
      sort: props.financeExpenseFilters.sort ?? 'date_desc',
      page: 1,
    }))
  }

  function resetRevenueFilters() {
    const salesDefaults = {
      search: '',
      payment_method: 'all',
      date_from: '',
      date_to: '',
      page: 1,
      per_page: 12,
    }
    const expenseDefaults = {
      filter: 'all',
      start_date: '',
      end_date: '',
      category: 'all',
      search: '',
      sort: 'date_desc',
      page: 1,
      per_page: 12,
    }

    props.setFinanceSalesFilters(salesDefaults)
    props.setFinanceSalesQuery(salesDefaults)
    props.setFinanceExpenseFilters(expenseDefaults)
    props.setFinanceExpenseQuery(expenseDefaults)
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">{props.pageHeader.eyebrow}</p>
          <h3>Legacy-style profit and revenue tracking for the general manager</h3>
          <p className="header-copy">Built from the old revenue tracking page with branch filters, revenue mix, expense visibility, and profit-focused summaries.</p>
        </div>
      </div>

      {props.financeError ? <div className="message-banner error">{props.financeError}</div> : null}
      {props.financeSuccess ? <div className="message-banner success">{props.financeSuccess}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Collected Revenue" value={props.isLoadingFinanceSales && !props.financeSales ? '...' : currency.format(salesTotal)} note="Money already at hand from cash, MoMo, Paystack, and other posted payments" icon="money" className="seen" />
        <StatWidget label="Insurance Revenue" value={props.isLoadingFinanceSales && !props.financeSales ? '...' : currency.format(insuranceValue)} note="Insurance-billed value tracked separately until claimed" icon="shield" className="pending" />
        <StatWidget label="Total Expenses" value={props.isLoadingFinanceExpenses && !props.financeExpenses ? '...' : currency.format(expenseTotal)} note="Expenses in the currently selected expense window" icon="alert" className="today" />
        <StatWidget label="Cash Position" value={currency.format(netCollected)} note="Collected revenue minus tracked expenses" icon="trend" className="total" valueClassName={grossProfitClassName} />
      </section>

      <section className="finance-layout">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Revenue Filters</p>
              <h3>Control sales, insurance, and expense scope</h3>
            </div>
            <span className="panel-tag">{props.financeSales?.branch_name ?? props.financeSummary?.branch_name ?? 'Revenue Tracking'}</span>
          </div>

          <form className="patient-filter-grid table-attached-filter" onSubmit={applyRevenueFilters}>
            <label>
              Search sales
              <input
                value={props.financeSalesFilters.search}
                onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Patient, folder, receipt, reference"
              />
            </label>
            <label>
              Payment method
              <select
                value={props.financeSalesFilters.payment_method}
                onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, payment_method: event.target.value }))}
              >
                <option value="all">All payment methods</option>
                {(props.financeSummary?.payment_methods ?? []).map((method) => (
                  <option key={method.payment_method} value={method.payment_method}>{method.payment_method}</option>
                ))}
              </select>
            </label>
            <label>
              Start date
              <input
                type="date"
                value={props.financeSalesFilters.date_from}
                onChange={(event) => {
                  const value = event.target.value
                  props.setFinanceSalesFilters((current) => ({ ...current, date_from: value }))
                  props.setFinanceExpenseFilters((current) => ({ ...current, start_date: value }))
                }}
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={props.financeSalesFilters.date_to}
                onChange={(event) => {
                  const value = event.target.value
                  props.setFinanceSalesFilters((current) => ({ ...current, date_to: value }))
                  props.setFinanceExpenseFilters((current) => ({ ...current, end_date: value }))
                }}
              />
            </label>
            <label>
              Expense category
              <select
                value={props.financeExpenseFilters.category}
                onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, category: event.target.value }))}
              >
                <option value="all">All expense categories</option>
                {(props.financeExpenses?.categories ?? []).map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Expense search
              <input
                value={props.financeExpenseFilters.search}
                onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Expense description or note"
              />
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button">Apply tracking filters</button>
              <button type="button" className="ghost-button" onClick={resetRevenueFilters}>Reset</button>
            </div>
          </form>

          <div className="payment-summary-row">
            <Metric label="Total Revenue" value={combinedRevenue} />
            <Metric label="Net Collected" value={netCollected} />
            <Metric label="Collection Rate" value={`${collectionRate.toFixed(1)}%`} raw />
            <Metric label="Transactions" value={salesStats.transaction_count} raw />
            <Metric label="Avg Sale" value={salesStats.average_sale} />
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Revenue Mix</p>
              <h3>Payment channels and insurance value</h3>
            </div>
            <span className="panel-tag">{paymentBreakdown.length + 1} lines</span>
          </div>

          <div className="manager-overview-grid">
            {paymentBreakdown.map((item) => (
              <div key={item.label} className="manager-metric-card tone-info">
                <span>{item.label}</span>
                <strong>{currency.format(item.total)}</strong>
                <p className="muted-copy">{formatPercent(item.total, salesTotal)} of collected revenue</p>
              </div>
            ))}
            <div className="manager-metric-card tone-warning">
              <span>Insurance Value</span>
              <strong>{currency.format(insuranceValue)}</strong>
              <p className="muted-copy">{formatPercent(insuranceValue, combinedRevenue)} of total tracked value</p>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Expense Breakdown</p>
              <h3>Top categories in the selected period</h3>
            </div>
            <span className="panel-tag">{topExpenseCategories.length} categories</span>
          </div>

          <div className="manager-overview-grid">
            {topExpenseCategories.length ? topExpenseCategories.map((item) => (
              <div key={item.category} className="manager-metric-card tone-danger">
                <span>{item.category}</span>
                <strong>{currency.format(Number(item.total ?? 0))}</strong>
                <p className="muted-copy">{formatPercent(Number(item.total ?? 0), expenseTotal)} of selected expenses</p>
              </div>
            )) : <p className="muted-copy">No expense categories match the current filters yet.</p>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Graphs</p>
              <h3>Revenue and expense visuals</h3>
            </div>
            <span className="panel-tag">Live summary</span>
          </div>

          <div className="content-grid">
            <BarChartCard
              title="Revenue Mix"
              items={[
                { label: 'Cash / Mobile / Paystack', value: salesTotal, tone: 'success' },
                { label: 'Insurance', value: insuranceValue, tone: 'info' },
                { label: 'Expenses', value: expenseTotal, tone: 'danger' },
              ]}
              total={Math.max(combinedRevenue, expenseTotal)}
            />
            <BarChartCard
              title="Expense Categories"
              items={topExpenseCategories.map((item) => ({
                label: item.category,
                value: Number(item.total ?? 0),
                tone: 'warning',
              }))}
              total={expenseTotal}
              emptyLabel="No category data yet"
            />
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Sales Ledger</p>
              <h3>Collected sales transactions</h3>
            </div>
            <span className="panel-tag">{props.financeSales?.pagination?.total ?? 0} records</span>
          </div>

          <TableShell>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Folder ID</th>
                  <th>Method</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {(props.financeSales?.records ?? []).map((record) => (
                  <tr key={record.id}>
                    <td>{record.name || record.folder_id}</td>
                    <td>{record.folder_id}</td>
                    <td>{record.payment_method}</td>
                    <td>{record.date}</td>
                    <td>{currency.format(Number(record.amount_paid ?? 0))}</td>
                    <td>{record.receipt_number || 'Pending'}</td>
                    <td>{record.reference || record.transaction_id || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <Pagination pagination={props.financeSales?.pagination} onPageChange={(page) => props.setFinanceSalesQuery((current) => ({ ...current, page }))} />
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Expense Ledger</p>
              <h3>Tracked expense entries</h3>
            </div>
            <div className="expense-ledger-heading-actions">
              <label>
                Sort ledger
                <select
                  value={props.financeExpenseFilters.sort ?? 'date_desc'}
                  onChange={(event) => {
                    const sort = event.target.value
                    props.setFinanceExpenseFilters((current) => ({ ...current, sort, page: 1 }))
                    props.setFinanceExpenseQuery((current) => ({ ...current, sort, page: 1 }))
                  }}
                >
                  <option value="date_desc">Date: newest first</option>
                  <option value="date_asc">Date: oldest first</option>
                  <option value="amount_desc">Amount: highest first</option>
                  <option value="amount_asc">Amount: lowest first</option>
                  <option value="category_asc">Category: A to Z</option>
                  <option value="category_desc">Category: Z to A</option>
                </select>
              </label>
              <span className="panel-tag">{props.financeExpenses?.pagination?.total ?? 0} records</span>
            </div>
          </div>

          <TableShell>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Expense ID</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(props.financeExpenses?.records ?? []).map((expense) => (
                  <tr key={expense.expense_id}>
                    <td>{expense.expense_id}</td>
                    <td>{expense.description}</td>
                    <td>{expense.category}</td>
                    <td>{expense.date}</td>
                    <td>{currency.format(Number(expense.amount ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <Pagination
            pagination={props.financeExpenses?.pagination}
            onPageChange={(page) => props.setFinanceExpenseQuery((current) => ({ ...current, page }))}
          />
        </article>
      </section>
    </section>
  )
}

function AccountantSalesView(props) {
  const salesStats = props.financeSales?.stats ?? {}
  const dailyBreakdown = props.financeSales?.daily_breakdown ?? []
  const monthYear = Number(props.financeSalesFilters.date_from?.slice(0, 4)) || new Date().getFullYear()
  const selectedMonth = (() => {
    const range = monthRange(props.financeSalesFilters.date_from?.slice(0, 7) ?? '')
    return range.date_from === props.financeSalesFilters.date_from && range.date_to === props.financeSalesFilters.date_to
      ? props.financeSalesFilters.date_from.slice(0, 7)
      : ''
  })()

  function applySalesFilters(event) {
    event.preventDefault()
    props.setFinanceSalesQuery((current) => ({
      ...current,
      ...props.financeSalesFilters,
      page: 1,
    }))
  }

  function resetSalesFilters() {
    const defaults = {
      search: '',
      payment_method: 'all',
      date_from: '',
      date_to: '',
      page: 1,
      per_page: 12,
    }

    props.setFinanceSalesFilters(defaults)
    props.setFinanceSalesQuery(defaults)
  }

  function selectSalesMonth(event) {
    const range = monthRange(event.target.value)
    props.setFinanceSalesFilters((current) => ({ ...current, ...range, page: 1 }))
    props.setFinanceSalesQuery((current) => ({ ...current, ...range, page: 1 }))
  }

  function exportSalesCsv() {
    const headers = ['Date', 'Transactions', 'Collected Sales', 'Insurance Value', 'Sales + Insurance', 'Loan Revenue', 'Consultation Allocated', 'Lenses Allocated', 'Frames Allocated', 'Cases Allocated', 'Other Allocated']
    const rows = dailyBreakdown.map((day) => [
      day.sale_date || '',
      Number(day.transaction_count ?? 0),
      Number(day.collected_sales ?? 0).toFixed(2),
      Number(day.insurance_total ?? 0).toFixed(2),
      Number(day.sales_with_insurance ?? 0).toFixed(2),
      Number(day.loan_revenue_total ?? 0).toFixed(2),
      Number(day.consultation_total ?? 0).toFixed(2),
      Number(day.lens_total ?? 0).toFixed(2),
      Number(day.frame_total ?? 0).toFixed(2),
      Number(day.case_total ?? 0).toFixed(2),
      Number(day.other_total ?? 0).toFixed(2),
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">{props.pageHeader.eyebrow}</p>
          <h3>{props.pageHeader.title}</h3>
          <p className="header-copy">{props.pageHeader.copy}</p>
        </div>
      </div>

      {props.financeError ? <div className="message-banner error">{props.financeError}</div> : null}
      {props.financeSuccess ? <div className="message-banner success">{props.financeSuccess}</div> : null}

      <section className="stats-grid patient-stats-grid">
        {props.summaryCards.map(([label, value, note, className, icon]) => (
          <StatWidget
            key={label}
            label={label}
            value={label === 'Transactions'
              ? String(Number(value ?? 0))
              : props.isLoadingFinanceSales && !props.financeSales
                ? '...'
                : currency.format(Number(value ?? 0))}
            note={note}
            icon={icon}
            className={className}
          />
        ))}
      </section>

      <section className="finance-layout sales-daily-layout">
        <article className="panel sales-daily-ledger-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Sales Filters</p>
              <h3>Search and control the daily sales view</h3>
            </div>
            <span className="panel-tag">{props.financeSales?.branch_name ?? props.financeSummary?.branch_name ?? 'Sales'}</span>
          </div>

          <form className="patient-filter-grid table-attached-filter" onSubmit={applySalesFilters}>
            <label>
              Search sales
              <input
                value={props.financeSalesFilters.search}
                onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Transaction, folder, client, description"
              />
            </label>
            <label>
              Payment method
              <select
                value={props.financeSalesFilters.payment_method}
                onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, payment_method: event.target.value }))}
              >
                <option value="all">All methods</option>
                {(props.financeSummary?.payment_methods ?? []).map((method) => (
                  <option key={method.payment_method} value={method.payment_method}>{method.payment_method}</option>
                ))}
              </select>
            </label>
            <label>
              Select month
              <select value={selectedMonth} onChange={selectSalesMonth}>
                <option value="">Custom date range</option>
                {monthNames.map((month, index) => {
                  const value = `${monthYear}-${String(index + 1).padStart(2, '0')}`
                  return <option key={value} value={value}>{month} {monthYear}</option>
                })}
              </select>
            </label>
            <label>
              Start date
              <input
                type="date"
                value={props.financeSalesFilters.date_from}
                onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, date_from: event.target.value }))}
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={props.financeSalesFilters.date_to}
                onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, date_to: event.target.value }))}
              />
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button">Apply filters</button>
              <button type="button" className="ghost-button" onClick={resetSalesFilters}>Reset</button>
              <button type="button" className="ghost-button" onClick={exportSalesCsv} disabled={!dailyBreakdown.length}>Export CSV</button>
            </div>
          </form>

          <div className="payment-summary-row">
            <Metric label="Filtered Days" value={dailyBreakdown.length} raw />
            <Metric label="Total Sales" value={salesStats.total_sales} />
            <Metric label="Sales + Insurance" value={Number(salesStats.total_sales ?? 0) + Number(salesStats.insurance_billed_value ?? 0)} />
            <Metric label="Loan Revenue" value={salesStats.loan_revenue_total} />
            <Metric label="Consultation (Allocated)" value={salesStats.allocated_consultation_total ?? salesStats.consultation_total} />
            <Metric label="Lenses (Allocated)" value={salesStats.allocated_lens_total ?? salesStats.lens_total} />
            <Metric label="Frames (Allocated)" value={salesStats.allocated_frame_total ?? salesStats.frame_total} />
            <Metric label="Cases (Allocated)" value={salesStats.allocated_case_total ?? salesStats.case_total} />
            <Metric label="Other Allocated" value={salesStats.allocated_other_total} />
            <Metric label="Average Sale" value={salesStats.average_sale} />
          </div>
          <p className="muted-copy sales-summary-note">
            Total Sales is the realized collection total. Payments are allocated in priority order; any amount without a remaining known item balance appears as Other Allocated, while unpaid balances remain in Billing as outstanding.
          </p>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Daily Sales Table</p>
              <h3>Daily breakdown for the active filter range</h3>
            </div>
            <span className="panel-tag">{dailyBreakdown.length} days</span>
          </div>

          <TableShell>
            <table className="portal-table sales-daily-breakdown-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transactions</th>
                  <th className="sales-daily-breakdown-table__sales-column">Sales</th>
                  <th className="sales-daily-breakdown-table__insurance-column">Insurance</th>
                  <th className="sales-daily-breakdown-table__combined-column">Sales + Insurance</th>
                  <th>Loan Revenue</th>
                  <th>Consultation</th>
                  <th>Lenses</th>
                  <th>Frames</th>
                  <th>Cases</th>
                  <th>Other</th>
                </tr>
              </thead>
              <tbody>
                {dailyBreakdown.length ? dailyBreakdown.map((day) => (
                  <tr key={day.sale_date}>
                    <td>{day.sale_date}</td>
                    <td>{Number(day.transaction_count ?? 0)}</td>
                    <td className="sales-daily-breakdown-table__sales-column">{currency.format(Number(day.collected_sales ?? 0))}</td>
                    <td className="sales-daily-breakdown-table__insurance-column">{currency.format(Number(day.insurance_total ?? 0))}</td>
                    <td className="sales-daily-breakdown-table__combined-column">{currency.format(Number(day.sales_with_insurance ?? 0))}</td>
                    <td>{currency.format(Number(day.loan_revenue_total ?? 0))}</td>
                    <td>{currency.format(Number(day.consultation_total ?? 0))}</td>
                    <td>{currency.format(Number(day.lens_total ?? 0))}</td>
                    <td>{currency.format(Number(day.frame_total ?? 0))}</td>
                    <td>{currency.format(Number(day.case_total ?? 0))}</td>
                    <td>{currency.format(Number(day.other_total ?? 0))}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="9">No daily sales matched the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableShell>
        </article>
      </section>
    </section>
  )
}

function PaymentsTab(props) {
  const canProcessPayments = props.session?.role !== 'accountant' && !props.readOnly
  const activeDateRange = props.financePaymentQuery.date_from || props.financePaymentQuery.date_to
    ? `${props.financePaymentQuery.date_from || 'Start'} to ${props.financePaymentQuery.date_to || 'Today'}`
    : 'All dates'
  const activeSearch = props.financePaymentQuery.search?.trim() ? props.financePaymentQuery.search : 'No search term'
  const activeReceiptSearch = props.financePaymentQuery.receipt_search?.trim() ? props.financePaymentQuery.receipt_search : 'All receipt records'

  return (
    <section className="finance-layout">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Payment Search</p>
            <h3>Find patient billing records</h3>
          </div>
          <span className="panel-tag">
            {props.financePayments?.search_mode
              ? 'Live search mode'
              : props.financePaymentQuery.date_from || props.financePaymentQuery.date_to
                ? `${props.financePaymentQuery.date_from || 'Start'} to ${props.financePaymentQuery.date_to || 'Today'}`
                : 'All open records'}
          </span>
        </div>

        <div className="payment-summary-row">
          <Metric label="Collected" value={props.financePayments?.stats.total_collected} />
          <Metric label="Transactions" value={props.financePayments?.stats.transaction_count} raw />
          <Metric label="Outstanding" value={props.financePayments?.stats.outstanding_balance} />
          <Metric label="Not Submitted Externally" value={props.financePayments?.stats.insurance_pending} />
        </div>

        <form
          className="patient-filter-grid table-attached-filter"
          onSubmit={(event) => {
            event.preventDefault()
            props.setFinancePaymentQuery((current) => ({
              ...current,
              ...props.financePaymentFilters,
              page: 1,
              receipt_page: 1,
            }))
          }}
        >
          <label>
            Date from
            <input
              type="date"
              value={props.financePaymentFilters.date_from}
              onChange={(event) =>
                props.setFinancePaymentFilters((current) => ({ ...current, date_from: event.target.value }))
              }
            />
          </label>
          <label>
            Date to
            <input
              type="date"
              value={props.financePaymentFilters.date_to}
              onChange={(event) =>
                props.setFinancePaymentFilters((current) => ({ ...current, date_to: event.target.value }))
              }
            />
          </label>
          <label>
            Search billing / folder / patient
            <input
              value={props.financePaymentFilters.search}
              onChange={(event) =>
                props.setFinancePaymentFilters((current) => ({ ...current, search: event.target.value }))
              }
              placeholder="Folder ID, billing ID, patient name, receipt..."
            />
          </label>
          <div className="filter-actions-row full-span">
            <button type="submit" className="primary-button">Refresh payments</button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                const defaults = { date_from: '', date_to: '', search: '', receipt_search: '', page: 1, per_page: 12, receipt_page: 1, receipt_per_page: 10 }
                props.setFinancePaymentFilters(defaults)
                props.setFinancePaymentQuery(defaults)
              }}
            >
              Clear filters
            </button>
          </div>
        </form>

        <div className="finance-chip-row payment-filter-chip-row">
          <div className="finance-chip">
            <span>Active Date Range</span>
            <strong>{activeDateRange}</strong>
          </div>
          <div className="finance-chip">
            <span>Search Term</span>
            <strong>{activeSearch}</strong>
          </div>
          <div className="finance-chip">
            <span>Receipt Matches</span>
            <strong>{props.financePayments?.transactions_pagination?.total ?? 0}</strong>
          </div>
          <div className="finance-chip">
            <span>Receipt Search</span>
            <strong>{activeReceiptSearch}</strong>
          </div>
          <div className="finance-chip">
            <span>Receipt Page</span>
            <strong>
              {props.financePayments?.transactions_pagination?.page ?? 1}
              {' / '}
              {props.financePayments?.transactions_pagination?.total_pages || 1}
            </strong>
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Collection Desk</p>
            <h3>Outstanding billing records</h3>
          </div>
          <span className="panel-tag">{props.financePayments?.pagination?.total ?? 0} records</span>
        </div>

        <TableShell>
          <table className="portal-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Folder ID</th>
                <th>Billing ID</th>
                <th>Date</th>
                <th>Insurance</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Outstanding</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(props.financePayments?.outstanding_records ?? []).map((record) => (
                <tr
                  key={record.id}
                  className={record.id === props.selectedPaymentRecordId ? 'table-row-active' : ''}
                  onClick={() => props.openPaymentRecord(record.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{record.name}</td>
                  <td>{record.folder_id}</td>
                  <td>{record.id}</td>
                  <td>{record.date}</td>
                  <td>{record.health_insurance || 'NONE'}</td>
                  <td>{currency.format(Number(record.total_amount ?? 0))}</td>
                  <td>{currency.format(Number(record.total_paid ?? 0))}</td>
                  <td>{currency.format(Number(record.outstanding_balance ?? 0))}</td>
                  <td>
                    <button
                      type="button"
                      className="mini-action"
                      onClick={(event) => {
                        event.stopPropagation()
                        props.openPaymentRecord(record.id)
                      }}
                    >
                      {canProcessPayments ? 'Select' : 'View only'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>

        <Pagination pagination={props.financePayments?.pagination} onPageChange={(page) => props.setFinancePaymentQuery((current) => ({ ...current, page }))} />
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Process Payment</p>
            <h3>{canProcessPayments ? 'Open payment popup from the Collection Desk' : 'Finance review is view-only on this desk'}</h3>
          </div>
          <span className="panel-tag">{canProcessPayments ? (props.selectedPaymentRecordId ? 'Payment popup ready' : 'Awaiting selection') : 'Processing disabled'}</span>
        </div>

        <p className="muted-copy">
          {canProcessPayments
            ? 'Select a row from the Collection Desk above to open the payment form as a popup.'
            : 'You can monitor outstanding bills here, but payment posting is disabled on this desk for control purposes.'}
        </p>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Receipt Reprints</p>
            <h3>Print past receipts</h3>
          </div>
          <span className="panel-tag">
            {props.financePayments?.transactions_pagination?.total ?? 0} receipts
          </span>
        </div>

        <p className="muted-copy">
          Use the same date range and search filters above to find earlier receipts, then browse each page and reprint any row below.
        </p>

        <form
          className="receipt-search-bar"
          onSubmit={(event) => {
            event.preventDefault()
            props.setFinancePaymentQuery((current) => ({
              ...current,
              receipt_search: props.financePaymentFilters.receipt_search,
              receipt_page: 1,
            }))
          }}
        >
          <label>
            Search receipt reprints
            <input
              value={props.financePaymentFilters.receipt_search}
              onChange={(event) =>
                props.setFinancePaymentFilters((current) => ({ ...current, receipt_search: event.target.value }))
              }
              placeholder="Receipt number, patient, folder, method, reference..."
            />
          </label>
          <div className="receipt-search-actions">
            <button type="submit" className="primary-button">Search receipts</button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                props.setFinancePaymentFilters((current) => ({ ...current, receipt_search: '' }))
                props.setFinancePaymentQuery((current) => ({ ...current, receipt_search: '', receipt_page: 1 }))
              }}
            >
              Clear
            </button>
          </div>
        </form>

        <div className="receipt-results-banner">
          <strong>Receipt results</strong>
          <span>
            Showing page {props.financePayments?.transactions_pagination?.page ?? 1} of {props.financePayments?.transactions_pagination?.total_pages || 1}
            {' '}for {activeDateRange}
          </span>
          <span>
            Search: {activeSearch}
          </span>
          <span>
            Receipt search: {activeReceiptSearch}
          </span>
        </div>

        <TableShell>
          <table className="portal-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Folder ID</th>
                <th>Receipt</th>
                <th>Date</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Reference</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(props.financePayments?.transactions ?? []).map((transaction) => (
                  <tr key={`receipt-${transaction.id}`}>
                    <td>{transaction.name || 'N/A'}</td>
                    <td>{transaction.folder_id}</td>
                    <td>{transaction.receipt_number}</td>
                    <td>{transaction.date}</td>
                    <td>{transaction.payment_method}</td>
                    <td>{currency.format(Number(transaction.amount_paid ?? 0))}</td>
                    <td>{transaction.reference || transaction.transaction_id || 'N/A'}</td>
                    <td>
                      <button type="button" className="mini-action" onClick={() => props.printFinanceReceipt(transaction)}>
                        Reprint
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableShell>

        <Pagination
          pagination={props.financePayments?.transactions_pagination}
          onPageChange={(page) => props.setFinancePaymentQuery((current) => ({ ...current, receipt_page: page }))}
        />
      </article>

      {props.selectedPaymentRecordId ? (
        <div
          className="modal-overlay"
          onClick={props.closePaymentModal}
        >
          <article className="modal-panel payment-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Process Payment</p>
                <h3>{props.paymentDetail?.billing?.name || 'Loading billing record...'}</h3>
              </div>
              <div className="modal-actions">
                <span className="panel-tag">{props.paymentDetail?.billing?.folder_id || 'Payment form'}</span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={props.closePaymentModal}
                >
                  Close
                </button>
              </div>
            </div>

            {props.isLoadingPaymentDetail ? <p className="muted-copy">Loading selected bill...</p> : null}
            {props.paymentDetail?.billing ? <PaymentWorkspace {...props} /> : <p className="muted-copy">Preparing payment details...</p>}
          </article>
        </div>
      ) : null}
    </section>
  )
}

function roundMoney2(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function formatSplitRemainderString(remainder) {
  const r = roundMoney2(remainder)
  if (r <= 0) return ''
  return Number.isInteger(r) ? String(r) : r.toFixed(2)
}

function defaultSplitPaymentState(date = '', billingEmail = '', insuranceProvider = '') {
  return {
    payment_method: 'Cash',
    amount: '',
    date,
    transaction_id: '',
    reference: '',
    description: '',
    customer_email: billingEmail,
    insurance_provider: insuranceProvider,
    insurance_number: '',
    insurance_package: '',
    patient_organization: '',
  }
}

function PaymentEntryFields({
  title,
  form,
  setForm,
  billingEmail,
  paystackConfigured,
  paystackSelected,
  insuranceProviderOptions,
  packageOptions,
  packageListId,
  onMethodChange,
  methodOptions,
  onAmountChange,
  amountHtmlRequired = true,
}) {
  return (
    <div className="payment-entry-card full-span">
      <div className="payment-entry-header">
        <strong>{title}</strong>
        <span>{form.payment_method}</span>
      </div>

      <div className="payment-entry-grid">
        <label>
          Payment method
          <select
            value={form.payment_method}
            onChange={(event) => onMethodChange(setForm, event.target.value)}
          >
            {methodOptions.map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>
        </label>
        <label>
          Amount
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(event) => {
              const next = event.target.value
              if (onAmountChange) onAmountChange(next)
              else setForm((current) => ({ ...current, amount: next }))
            }}
            required={amountHtmlRequired}
          />
        </label>
        <label>
          Date
          <input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required />
        </label>

        {paystackSelected ? (
          <label>
            Customer email
            <input
              type="email"
              value={form.customer_email}
              onChange={(event) => setForm((current) => ({ ...current, customer_email: event.target.value }))}
              placeholder={billingEmail || 'customer@example.com'}
              required
            />
          </label>
        ) : null}

        {['Mobile Money', 'Paystack'].includes(form.payment_method) ? (
          <>
            <label>
              Transaction ID
              <input value={form.transaction_id} onChange={(event) => setForm((current) => ({ ...current, transaction_id: event.target.value }))} required />
            </label>
            <label>
              Reference
              <input value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} />
            </label>
          </>
        ) : null}

        {paystackSelected ? (
          <div className="message-banner full-span">
            {paystackConfigured
              ? 'Start checkout to generate a reference, complete payment in Paystack, then verify it here to post the payment automatically.'
              : 'Paystack is not configured yet. Add PAYSTACK_PUBLIC_KEY and PAYSTACK_SECRET_KEY to the backend .env file before using this option.'}
          </div>
        ) : null}

        {form.payment_method === 'Insurance' ? (
          <>
            <label>
              Insurance provider
              <select value={form.insurance_provider} onChange={(event) => setForm((current) => ({ ...current, insurance_provider: event.target.value }))} required>
                <option value="">Select provider</option>
                {insuranceProviderOptions.map((provider) => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>
            </label>
            <label>
              Insurance number
              <input value={form.insurance_number} onChange={(event) => setForm((current) => ({ ...current, insurance_number: event.target.value }))} />
            </label>
            <label>
              Package
              <input list={packageListId} value={form.insurance_package} onChange={(event) => setForm((current) => ({ ...current, insurance_package: event.target.value }))} />
            </label>
            <label>
              Organization
              <input value={form.patient_organization} onChange={(event) => setForm((current) => ({ ...current, patient_organization: event.target.value }))} />
            </label>
          </>
        ) : null}

        <label className="full-span">
          Notes / description
          <textarea rows="3" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Optional payment note" />
        </label>
      </div>

      <datalist id={packageListId}>
        {packageOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
    </div>
  )
}

function PaymentWorkspace(props) {
  const updatePaymentMethodState = (setForm, nextMethod) => {
    setForm((current) => ({
      ...current,
      payment_method: nextMethod,
      transaction_id: ['Mobile Money', 'Paystack'].includes(nextMethod) ? current.transaction_id : '',
      reference: ['Paystack', 'Mobile Money'].includes(nextMethod) ? current.reference : '',
      customer_email: nextMethod === 'Paystack' ? current.customer_email : '',
      insurance_provider:
        nextMethod === 'Insurance'
          ? current.insurance_provider || props.paymentDetail.billing.health_insurance || ''
          : current.insurance_provider,
      insurance_number: nextMethod === 'Insurance' ? current.insurance_number : '',
      insurance_package: nextMethod === 'Insurance' ? current.insurance_package : '',
      patient_organization: nextMethod === 'Insurance' ? current.patient_organization : '',
    }))
  }

  const isReadOnly = props.session?.role === 'accountant' || props.readOnly
  const paystackConfigured = Boolean(props.paymentDetail?.integrations?.paystack_configured)
  const billingEmail = props.paymentDetail?.billing?.email || ''
  const paystackSelected = props.paymentForm.payment_method === 'Paystack'
  const splitPaystackSelected = props.secondaryPaymentForm?.payment_method === 'Paystack'
  const splitMode = Boolean(props.isSplitPaymentEnabled)
  const outstandingBalance = Number(props.paymentDetail.billing.calculated_balance ?? 0)
  const splitRecordedAmount = Number(props.paymentForm.amount || 0) + Number(props.secondaryPaymentForm?.amount || 0)
  const splitRemainingAmount = outstandingBalance - splitRecordedAmount
  const applySplitSecondaryRemainder = (primaryAmountString) => {
    const primary = roundMoney2(primaryAmountString)
    const remainder = Math.max(0, roundMoney2(outstandingBalance - primary))
    props.setSecondaryPaymentForm((current) => ({
      ...current,
      amount: formatSplitRemainderString(remainder),
    }))
  }
  const insuranceProviderOptions = Array.from(
    new Set([
      ...(props.insuranceMeta?.providers ?? []),
      props.paymentDetail?.billing?.health_insurance && props.paymentDetail.billing.health_insurance !== 'NONE'
        ? props.paymentDetail.billing.health_insurance
        : null,
    ].filter(Boolean)),
  )

  return (
    <div className="payment-workspace">
      <div className="payment-summary-hero">
        <div className="payment-summary-total">
          <span className="payment-summary-kicker">Outstanding balance</span>
          <strong>{currency.format(Number(props.paymentDetail.billing.calculated_balance ?? 0))}</strong>
          <p>
            Total bill: {currency.format(Number(props.paymentDetail.billing.total_amount ?? 0))} | Paid: {currency.format(Number(props.paymentDetail.billing.total_paid ?? 0))}
          </p>
        </div>
        <div className="payment-summary-grid">
          <Metric label="Cash" value={props.paymentDetail.billing.cash_paid} />
          <Metric label="MoMo" value={props.paymentDetail.billing.mobile_paid} />
          <Metric label="Paystack" value={props.paymentDetail.billing.paystack_paid} />
          <Metric label="Total Insurance Billing" value={props.paymentDetail.billing.insurance_claimed} />
        </div>
      </div>

      {isReadOnly ? (
        <div className="message-banner">
          This billing popup is available for review only. Payment processing is disabled on this finance desk.
        </div>
      ) : (
        <>
          <div className="payment-mode-toggle">
            <div>
              <strong>Split payment</strong>
              <span>Use this when insurance covers part of the bill and the patient tops up with cash or MoMo.</span>
            </div>
            <label className="payment-split-switch">
              <input
                type="checkbox"
                checked={splitMode}
                onChange={(event) => {
                  const enabled = event.target.checked
                  props.setIsSplitPaymentEnabled(enabled)

                  if (enabled) {
                    if (props.paymentForm.payment_method === 'Paystack') {
                      updatePaymentMethodState(props.setPaymentForm, 'Insurance')
                    }

                    props.setSecondaryPaymentForm((current) => {
                      const next = {
                        ...current,
                        payment_method: splitPaymentMethodOptions.includes(current.payment_method) ? current.payment_method : 'Cash',
                        date: current.date || props.paymentForm.date,
                        customer_email: current.customer_email || billingEmail,
                        insurance_provider: current.insurance_provider || props.paymentDetail.billing.health_insurance || '',
                      }
                      const primary = roundMoney2(props.paymentForm.amount)
                      const remainder = Math.max(0, roundMoney2(outstandingBalance - primary))
                      return {
                        ...next,
                        amount: formatSplitRemainderString(remainder),
                      }
                    })
                  } else {
                    props.setSecondaryPaymentForm({
                      ...props.secondaryPaymentForm,
                      ...defaultSplitPaymentState(props.paymentForm.date, billingEmail, props.paymentDetail.billing.health_insurance || ''),
                    })
                  }
                }}
              />
              <span className="payment-split-slider" />
            </label>
          </div>

          {splitMode ? (
            <div className="message-banner full-span">
              Split payment posts two entries in one submit (Cash, Mobile Money, or Insurance in either row — combine insurance plus patient top-up, or Cash plus MoMo, etc.). Paystack stays in single-payment mode only.
            </div>
          ) : null}

          <form className="patient-form-grid payment-form-grid" onSubmit={props.saveBillingPayment} noValidate={splitMode}>
            <PaymentEntryFields
              title={splitMode ? 'First payment entry' : 'Payment details'}
              form={props.paymentForm}
              setForm={props.setPaymentForm}
              billingEmail={billingEmail}
              paystackConfigured={paystackConfigured}
              paystackSelected={paystackSelected}
              insuranceProviderOptions={insuranceProviderOptions}
              packageOptions={props.insuranceMeta?.package_options?.[props.paymentForm.insurance_provider] ?? []}
              packageListId="payment-insurance-package-options-primary"
              onMethodChange={updatePaymentMethodState}
              methodOptions={splitMode ? splitPaymentMethodOptions : ['Cash', 'Mobile Money', 'Paystack', 'Insurance']}
              amountHtmlRequired={!splitMode}
              onAmountChange={
                splitMode
                  ? (value) => {
                      props.setPaymentForm((current) => ({ ...current, amount: value }))
                      applySplitSecondaryRemainder(value)
                    }
                  : undefined
              }
            />

            {splitMode ? (
              <PaymentEntryFields
                title="Second payment entry"
                form={props.secondaryPaymentForm}
                setForm={props.setSecondaryPaymentForm}
                billingEmail={billingEmail}
                paystackConfigured={paystackConfigured}
                paystackSelected={splitPaystackSelected}
                insuranceProviderOptions={insuranceProviderOptions}
                packageOptions={props.insuranceMeta?.package_options?.[props.secondaryPaymentForm.insurance_provider] ?? []}
                packageListId="payment-insurance-package-options-secondary"
                onMethodChange={updatePaymentMethodState}
                methodOptions={splitPaymentMethodOptions}
                amountHtmlRequired={false}
              />
            ) : null}

            {!splitMode && paystackSelected ? (
              <div className="filter-actions-row full-span">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={!paystackConfigured || props.isInitializingPaystack}
                  onClick={props.initializePaystackPayment}
                >
                  {props.isInitializingPaystack ? 'Starting Paystack...' : 'Start Paystack Checkout'}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={!paystackConfigured || !props.paymentForm.reference || props.isVerifyingPaystack}
                  onClick={props.verifyPaystackPayment}
                >
                  {props.isVerifyingPaystack ? 'Verifying Paystack...' : 'Verify Paystack Payment'}
                </button>
              </div>
            ) : null}

            {splitMode ? (
              <div className="payment-split-summary full-span">
                <strong>Combined amount:</strong> {currency.format(splitRecordedAmount)} <span>Remaining after save:</span> {currency.format(Math.max(splitRemainingAmount, 0))}
              </div>
            ) : null}

            <button type="submit" className="primary-button full-span" disabled={props.isSavingPayment}>
              {props.isSavingPayment ? 'Saving payment...' : splitMode ? 'Record split payment' : `Record ${props.paymentForm.payment_method}`}
            </button>
          </form>
        </>
      )}

      <TableShell>
        <table className="portal-table">
          <thead>
            <tr>
              <th>Entry</th>
              <th>Method</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Reference</th>
              <th>Logged</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(props.paymentDetail.recent_transactions ?? []).map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.entry_label || transaction.entry_type || 'Payment'}</td>
                <td>{transaction.payment_method}</td>
                <td>{transaction.date}</td>
                <td>{currency.format(Number(transaction.amount_paid ?? 0))}</td>
                <td>{transaction.reference || transaction.transaction_id || 'N/A'}</td>
                <td>{formatTime(transaction.created_at)}</td>
                <td>
                  {transaction.entry_type === 'payment' ? (
                    <button
                      type="button"
                      className="mini-action"
                      onClick={() =>
                        props.openReceiptPreview(
                          {
                            ...transaction,
                            name: props.paymentDetail.billing.name,
                            folder_id: props.paymentDetail.billing.folder_id,
                            billing_id: props.paymentDetail.billing.id,
                            receipt_number: props.paymentDetail.billing.receipt_number,
                            total_amount: props.paymentDetail.billing.total_amount,
                            balance: props.paymentDetail.billing.calculated_balance,
                          },
                          props.paymentDetail.billing,
                        )
                      }
                    >
                      Reprint
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  )
}

function SalesTab(props) {
  const todayBreakdown = props.financeSales?.stats?.scope_breakdown ?? props.financeSales?.stats?.today_breakdown ?? {}
  const todayLabel = todayBreakdown.label ?? 'Today'

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      props.setFinanceSalesQuery((current) => ({ ...current, ...props.financeSalesFilters, page: 1 }))
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [props.financeSalesFilters.date_from, props.financeSalesFilters.date_to, props.financeSalesFilters.payment_method, props.financeSalesFilters.search])

  return (
    <section className="finance-layout">
      <article className="panel finance-sales-ledger-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Sales Overview</p>
            <h3>Live sales ledger</h3>
          </div>
          <span className="panel-tag">{props.financeSales?.branch_name ?? props.financeSummary?.branch_name ?? 'Finance'}</span>
        </div>

        <div className="payment-summary-row">
          <Metric label={`Cash ${todayLabel}`} value={todayBreakdown.cash} />
          <Metric label={`MoMo ${todayLabel}`} value={todayBreakdown.mobile_money} />
          <Metric label={`Paystack ${todayLabel}`} value={todayBreakdown.paystack} />
          <Metric label={`Insurance ${todayLabel}`} value={todayBreakdown.insurance} />
          <Metric label={`${todayLabel} Total`} value={todayBreakdown.grand_total} />
        </div>

        <div className="payment-summary-row">
          <Metric label="Total Sales" value={props.financeSales?.stats.total_sales} />
          <Metric label="Insurance Value" value={props.financeSales?.stats.insurance_billed_value} />
          <Metric label="Sales + Insurance" value={Number(props.financeSales?.stats.total_sales ?? 0) + Number(props.financeSales?.stats.insurance_billed_value ?? 0)} />
          <Metric label="Loan Revenue" value={props.financeSales?.stats.loan_revenue_total} />
          <Metric label="Transactions" value={props.financeSales?.stats.transaction_count} raw />
          <Metric label="Average Sale" value={props.financeSales?.stats.average_sale} />
        </div>

        <form
          className="patient-filter-grid table-attached-filter"
          onSubmit={(event) => {
            event.preventDefault()
            props.setFinanceSalesQuery((current) => ({ ...current, ...props.financeSalesFilters, page: 1 }))
          }}
        >
          <label>
            Search
            <input value={props.financeSalesFilters.search} onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Folder, method, note, reference" />
          </label>
          <label>
            Payment method
            <select value={props.financeSalesFilters.payment_method} onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, payment_method: event.target.value }))}>
              <option value="all">All</option>
              {(props.financeSummary?.payment_methods ?? []).map((method) => (
                <option key={method.payment_method} value={method.payment_method}>{method.payment_method}</option>
              ))}
            </select>
          </label>
          <label>
            Date from
            <input type="date" value={props.financeSalesFilters.date_from} onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, date_from: event.target.value }))} />
          </label>
          <label>
            Date to
            <input type="date" value={props.financeSalesFilters.date_to} onChange={(event) => props.setFinanceSalesFilters((current) => ({ ...current, date_to: event.target.value }))} />
          </label>
          <div className="filter-actions-row full-span">
            <button type="submit" className="primary-button">Apply filters</button>
          </div>
        </form>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Sales Table</p>
            <h3>Immediate sales transaction stream</h3>
          </div>
        </div>
        <p className="muted-copy">This table shows realized sales only. Insurance-backed bills are tracked separately in the insurance-inclusive widgets above.</p>
        <TableShell>
          <table className="portal-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Folder ID</th>
                <th>Method</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Receipt</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {(props.financeSales?.records ?? []).map((record) => (
                <tr key={record.id}>
                  <td>{record.name || record.folder_id}</td>
                  <td>{record.folder_id}</td>
                  <td>{record.payment_method}</td>
                  <td>{record.date}</td>
                  <td>{currency.format(Number(record.amount_paid ?? 0))}</td>
                  <td>{record.receipt_number || 'Pending'}</td>
                  <td>{record.reference || record.transaction_id || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </article>
    </section>
  )
}

function ExpensesTab(props) {
  const [expenseWorkflowForm, setExpenseWorkflowForm] = useState({ accountant_memo_threshold: '1000', receptionist_direct_limit: '1000' })
  const [isSavingExpenseWorkflow, setIsSavingExpenseWorkflow] = useState(false)
  const [expenseWorkflowFeedback, setExpenseWorkflowFeedback] = useState(null)
  useEffect(() => {
    const settings = props.financeExpenses?.expense_workflow_settings
    if (settings) {
      setExpenseWorkflowForm({
        accountant_memo_threshold: String(settings.accountant_memo_threshold ?? 1000),
        receptionist_direct_limit: String(settings.receptionist_direct_limit ?? 1000),
      })
    }
  }, [props.financeExpenses?.expense_workflow_settings?.accountant_memo_threshold, props.financeExpenses?.expense_workflow_settings?.receptionist_direct_limit])

  const canManageExpenses = (['manager', 'accountant'].includes(props.session?.role) || props.session?.is_admin) && !props.readOnly
  const canEditExpenseRecords = props.session?.role === 'manager' && !props.readOnly
  const canCreateExpenses = (['manager', 'accountant', 'receptionist'].includes(props.session?.role) || props.session?.is_admin) && !props.readOnly
  const canDeleteLinkedLensExpense = props.session?.role === 'manager' && !props.readOnly
  const isCategoryManager = canManageExpenses
  const isAccountantExpenseView = props.session?.role === 'accountant' && !props.readOnly
  const isReceptionistExpenseView = props.session?.role === 'receptionist' && !props.readOnly
  const isCeoReadOnlyExpenseView = props.session?.role === 'ceo' && props.readOnly
  const usePremiumExpenseLayout = isAccountantExpenseView || isReceptionistExpenseView || isCeoReadOnlyExpenseView
  const expenseSelectionBranchId = props.session?.is_admin ? props.selectedBranchId : props.session?.branch_id
  const expenseRecords = props.financeExpenses?.records ?? []
  const eligibleExpensesOnPage = expenseRecords.filter(isManualExpenseEligibleForCertificate)
  const expenseStats = props.financeExpenses?.stats ?? {}
  const visibleExpenseTotal = Number(expenseStats.filtered_total ?? expenseStats.total ?? 0)
  const [isCreateExpenseModalOpen, setIsCreateExpenseModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [selectedExpense, setSelectedExpense] = useState(null)
  const [selectedExpenseIds, setSelectedExpenseIds] = useState([])
  const [selectedExpenseRecords, setSelectedExpenseRecords] = useState([])
  const [expenseModalForm, setExpenseModalForm] = useState({
    description: '',
    amount: '',
    date: '',
    category: '',
    receipt_unavailable: false,
  })
  const isSelectedLensLinked = Boolean(selectedExpense?.is_lens_linked)
  const isSelectedFrameReserved = Boolean(selectedExpense?.is_frame_reserved)
  const canEditFrameReservationDate = ['manager', 'general-manager'].includes(props.session?.role) && !props.readOnly
  const canEditSelectedExpense = canEditExpenseRecords
    && !isSelectedLensLinked
    && (!isSelectedFrameReserved || canEditFrameReservationDate)
  const canEditSelectedExpenseDetails = canEditSelectedExpense && !isSelectedFrameReserved
  const canDeleteSelectedExpense = isSelectedLensLinked
    ? canDeleteLinkedLensExpense
    : props.session?.role === 'manager' && !props.readOnly
  const categoryOptions = props.financeExpenses?.categories ?? []
  const expenseApprovalRequests = props.financeExpenses?.approval_requests ?? []
  const canReviewExpenseApprovals = props.session?.role === 'manager'
  const canManageExpenseWorkflow = props.session?.role === 'manager'
  const pendingExpenseApprovalCount = expenseApprovalRequests.filter((request) => request.status === 'pending').length
  const approvedExpenseApprovalCount = expenseApprovalRequests.filter((request) => request.status === 'approved').length
  const rejectedExpenseApprovalCount = expenseApprovalRequests.filter((request) => request.status === 'rejected').length
  const [approvalStatusFilter, setApprovalStatusFilter] = useState(canReviewExpenseApprovals ? 'pending' : 'all')
  const visibleExpenseApprovalRequests = approvalStatusFilter === 'all'
    ? expenseApprovalRequests
    : expenseApprovalRequests.filter((request) => request.status === approvalStatusFilter)
  const submitsExpenseApprovals = ['accountant', 'receptionist'].includes(props.session?.role) && !props.readOnly
  const draftExpenseAmount = Number(props.expenseForm.amount || 0)
  const expenseWorkflowSettings = props.financeExpenses?.expense_workflow_settings ?? { accountant_memo_threshold: 1000, receptionist_direct_limit: 1000 }
  const isMemoThresholdExpense = isAccountantExpenseView && draftExpenseAmount > Number(expenseWorkflowSettings.accountant_memo_threshold ?? 1000)
  const receptionistAboveLimit = isReceptionistExpenseView && draftExpenseAmount > Number(expenseWorkflowSettings.receptionist_direct_limit ?? 1000)
  const accountantMemoSignatureAvailable = Boolean(props.financeExpenses?.accountant_memo_signature_available)
  const gmExpenseSignatureAvailable = Boolean(props.financeExpenses?.gm_expense_signature_available)
  const [reviewingExpenseRequestId, setReviewingExpenseRequestId] = useState(null)
  const [approvalNotes, setApprovalNotes] = useState({})
  const [selectedCertificateIds, setSelectedCertificateIds] = useState([])
  const [documentPrintError, setDocumentPrintError] = useState('')
  const approvedCertificates = expenseApprovalRequests.filter((request) => request.document_type === 'certificate_of_honour' && request.status === 'approved')
  const selectedCertificates = approvedCertificates.filter((request) => selectedCertificateIds.includes(String(request.id)))
  const activeExpenseWorkspace = props.activeExpenseWorkspace ?? 'ledger'
  const setActiveExpenseWorkspace = props.setActiveExpenseWorkspace ?? (() => {})
  const managementExpenseDefaults = {
    filter: 'all',
    start_date: '',
    end_date: '',
    category: 'all',
    no_receipt_coh: 'all',
    search: '',
    sort: 'date_desc',
    page: 1,
    per_page: 12,
  }
  const receptionistExpenseDefaults = {
    filter: 'all',
    ...currentMonthDateRange(),
    category: 'all',
    no_receipt_coh: 'all',
    search: '',
    sort: 'date_desc',
    page: 1,
    per_page: 12,
  }
  const expenseFilterDefaults = isReceptionistExpenseView ? receptionistExpenseDefaults : managementExpenseDefaults

  useEffect(() => {
    setSelectedExpenseIds([])
    setSelectedExpenseRecords([])
  }, [expenseSelectionBranchId])

  async function reviewExpenseRequest(requestId, decision) {
    setReviewingExpenseRequestId(requestId)
    try {
      const request = expenseApprovalRequests.find((item) => item.id === requestId)
      const completed = await props.reviewExpenseApproval(requestId, decision, approvalNotes[requestId] ?? '', request?.branch_id)
      if (completed) {
        setApprovalNotes((current) => ({ ...current, [requestId]: '' }))
      }
    } finally {
      setReviewingExpenseRequestId(null)
    }
  }

  async function printCertificates(requests) {
    if (!requests.length) return
    const printWindow = openPrintDocumentWindow()
    if (!printWindow) {
      setDocumentPrintError('Allow pop-ups to print or save the certificate PDF.')
      return
    }
    setDocumentPrintError('')
    try {
      const signedRequests = await Promise.all(requests.map(async (request) => {
        const supportingDocument = request.supporting_document ?? {}
        if (!supportingDocument.gm_signature_path) return request
        const apiBase = (import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api/v1`).replace(/\/+$/, '')
        const endpoint = `${apiBase}/finance/expense-approvals/${request.id}/gm-signature?branch_id=${request.branch_id}`
        const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${props.token}` } })
        if (!response.ok) {
          let message = `GM signature could not be loaded (HTTP ${response.status}).`
          try {
            message = (await response.json()).message || message
          } catch {
          }
          throw new Error(message)
        }
        const signatureBlob = await response.blob()
        const signatureDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(new Error('The GM signature image could not be read for printing.'))
          reader.readAsDataURL(signatureBlob)
        })
        return {
          ...request,
          supporting_document: { ...supportingDocument, gm_signature_data_url: signatureDataUrl },
        }
      }))
      const pages = signedRequests.map((request) => buildCertificateOfHonourPage(request))
      writePrintDocumentWindow(printWindow, 'Bealet Certificates of Honour', pages)
    } catch (printError) {
      printWindow.close()
      setDocumentPrintError(printError.message || 'Unable to load the GM signature for this Certificate of Honour.')
    }
  }

  function toggleAllVisibleCertificates() {
    const visibleIds = approvedCertificates.map((request) => String(request.id))
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedCertificateIds.includes(id))
    setSelectedCertificateIds((current) => allSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds])))
  }

  function printManualExpenseCertificate(expense) {
    const printWindow = openPrintDocumentWindow()
    if (!printWindow) {
      props.setFinanceError?.('Allow pop-ups to print or save the expense Certificate of Honour.')
      return
    }
    props.setFinanceError?.('')
    writePrintDocumentWindow(
      printWindow,
      `Expense Certificate of Honour ${expense.expense_id}`,
      [buildManualExpenseCertificatePage(expense, props.financeExpenses?.branch_name)],
    )
  }

  function printSelectedExpenseCertificates() {
    if (!selectedExpenseRecords.length) return
    const printWindow = openPrintDocumentWindow()
    if (!printWindow) {
      props.setFinanceError?.('Allow pop-ups to print or save the selected Certificates of Honour.')
      return
    }
    props.setFinanceError?.('')
    writePrintDocumentWindow(
      printWindow,
      'No-Receipt Expense Certificates of Honour',
      selectedExpenseRecords.map((expense) => buildManualExpenseCertificatePage(expense, props.financeExpenses?.branch_name)),
    )
  }

  function toggleExpenseCertificate(expense) {
    const id = String(expense.expense_id)
    const isSelected = selectedExpenseIds.includes(id)
    setSelectedExpenseIds((current) => isSelected ? current.filter((item) => item !== id) : [...current, id])
    setSelectedExpenseRecords((current) => isSelected
      ? current.filter((item) => String(item.expense_id) !== id)
      : [...current.filter((item) => String(item.expense_id) !== id), expense])
  }

  function toggleCurrentPageExpenseCertificates() {
    const pageIds = eligibleExpensesOnPage.map((expense) => String(expense.expense_id))
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedExpenseIds.includes(id))
    setSelectedExpenseIds((current) => allSelected
      ? current.filter((id) => !pageIds.includes(id))
      : Array.from(new Set([...current, ...pageIds])))
    setSelectedExpenseRecords((current) => allSelected
      ? current.filter((expense) => !pageIds.includes(String(expense.expense_id)))
      : [...current.filter((expense) => !pageIds.includes(String(expense.expense_id))), ...eligibleExpensesOnPage])
  }

  function commitExpenseFilters(nextFilters) {
    props.setFinanceExpenseFilters(nextFilters)
    props.setFinanceExpenseQuery((current) => ({
      ...current,
      ...nextFilters,
      page: 1,
    }))
  }

  function applyExpenseFilters(event) {
    event.preventDefault()
    props.setFinanceExpenseQuery((current) => ({
      ...current,
      ...props.financeExpenseFilters,
      page: 1,
      refresh_token: Date.now(),
    }))
  }

  useEffect(() => {
    const liveUpdateDelay = props.financeExpenseFilters.search ? 220 : 0
    const timeoutId = window.setTimeout(() => {
      props.setFinanceExpenseQuery((current) => {
        const next = {
          ...current,
          filter: props.financeExpenseFilters.filter,
          start_date: props.financeExpenseFilters.start_date,
          end_date: props.financeExpenseFilters.end_date,
          category: props.financeExpenseFilters.category,
          search: props.financeExpenseFilters.search,
          sort: props.financeExpenseFilters.sort ?? 'date_desc',
          page: 1,
          per_page: current?.per_page ?? props.financeExpenseFilters.per_page ?? 12,
        }

        return ['filter', 'start_date', 'end_date', 'category', 'search', 'sort', 'page', 'per_page']
          .every((key) => (current?.[key] ?? '') === (next?.[key] ?? ''))
          ? current
          : next
      })
    }, liveUpdateDelay)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [props.financeExpenseFilters, props.setFinanceExpenseQuery])

  function openExpenseModal(expense) {
    setSelectedExpense(expense)
    setExpenseModalForm({
      description: expense.description ?? '',
      amount: expense.amount ?? '',
      date: expense.date ?? '',
      category: expense.category ?? categoryOptions[0] ?? '',
      receipt_unavailable: Boolean(expense.receipt_unavailable),
    })
  }

  function closeExpenseModal() {
    setSelectedExpense(null)
    setExpenseModalForm({
      description: '',
      amount: '',
      date: '',
      category: '',
      receipt_unavailable: false,
    })
  }

  function openCreateExpenseModal() {
    props.setExpenseForm((current) => {
      const next = {
      ...current,
      description: '',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      category: categoryOptions[0] ?? current.category ?? '',
      memo_subject: '',
      memo_justification: '',
      memo_purpose: '',
      memo_period: '',
      memo_payment_method: 'bank',
      certificate_confirmed: false,
      }
      return updateExpenseMemoFields(next, {})
    })
    setIsCreateExpenseModalOpen(true)
  }

  function closeCreateExpenseModal() {
    setIsCreateExpenseModalOpen(false)
  }

  if (isCeoReadOnlyExpenseView) {
    return (
      <CeoExpenseReviewView
        {...props}
        categoryOptions={categoryOptions}
        openExpenseModal={openExpenseModal}
      />
    )
  }

  return (
    <>
      {(canReviewExpenseApprovals || submitsExpenseApprovals) ? (
        <div className="finance-tabs expense-workflow-tabs" role="tablist" aria-label="Expense workspace">
          <button
            type="button"
            role="tab"
            aria-selected={activeExpenseWorkspace === 'ledger'}
            className={activeExpenseWorkspace === 'ledger' ? 'nav-item finance-tab active' : 'nav-item finance-tab'}
            onClick={() => setActiveExpenseWorkspace('ledger')}
          >
            Expense Ledger
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeExpenseWorkspace === 'approvals'}
            className={activeExpenseWorkspace === 'approvals' ? 'nav-item finance-tab active' : 'nav-item finance-tab'}
            onClick={() => setActiveExpenseWorkspace('approvals')}
          >
            {canReviewExpenseApprovals ? `GM Approvals (${pendingExpenseApprovalCount})` : `My Requests (${expenseApprovalRequests.length})`}
          </button>
          {canManageExpenseWorkflow ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeExpenseWorkspace === 'settings'}
              className={activeExpenseWorkspace === 'settings' ? 'nav-item finance-tab active' : 'nav-item finance-tab'}
              onClick={() => setActiveExpenseWorkspace('settings')}
            >
              Expense Rules
            </button>
          ) : null}
        </div>
      ) : null}

      {canManageExpenseWorkflow && activeExpenseWorkspace === 'settings' ? (
        <article className="panel panel-wide expense-workflow-settings-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">General Manager Settings</p>
              <h3>Expense approval limits</h3>
              <p className="muted-copy">Set the maximum amount each staff role may submit through the direct expense request route.</p>
            </div>
          </div>
          {props.financeError ? <div className="message-banner error">{props.financeError}</div> : null}
          {props.financeSuccess ? <div className="message-banner success">{props.financeSuccess}</div> : null}
          {expenseWorkflowFeedback ? <div className={`message-banner ${expenseWorkflowFeedback.type}`}>{expenseWorkflowFeedback.message}</div> : null}
          <form
            className="patient-filter-grid expense-workflow-settings-form"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!props.saveExpenseWorkflowSettings) {
                setExpenseWorkflowFeedback({ type: 'error', message: 'Expense limits could not be saved: save action is unavailable. Refresh the page and try again.' })
                return
              }
              setIsSavingExpenseWorkflow(true)
              setExpenseWorkflowFeedback(null)
              try {
                const saved = await props.saveExpenseWorkflowSettings({
                  accountant_memo_threshold: Number(expenseWorkflowForm.accountant_memo_threshold || 0),
                  receptionist_direct_limit: Number(expenseWorkflowForm.receptionist_direct_limit || 0),
                })
                setExpenseWorkflowFeedback(saved
                  ? { type: 'success', message: 'Expense approval limits saved successfully.' }
                  : { type: 'error', message: props.financeError || 'The server did not confirm the updated limits. Please try again.' })
              } catch (saveError) {
                setExpenseWorkflowFeedback({ type: 'error', message: saveError.message || 'Could not save expense limits.' })
              } finally {
                setIsSavingExpenseWorkflow(false)
              }
            }}
          >
            <label>
              Accountant Certificate of Honour limit (GH₵)
              <input type="number" min="0" step="0.01" value={expenseWorkflowForm.accountant_memo_threshold} onChange={(event) => { setExpenseWorkflowFeedback(null); setExpenseWorkflowForm((current) => ({ ...current, accountant_memo_threshold: event.target.value })) }} required />
              <small>At or below this amount, the Accountant submits a Certificate of Honour. Above it, the expense form requires the completed, signed memo and sends it with the expense to the GM.</small>
            </label>
            <label>
              Receptionist direct submission limit (GH₵)
              <input type="number" min="0" step="0.01" value={expenseWorkflowForm.receptionist_direct_limit} onChange={(event) => { setExpenseWorkflowFeedback(null); setExpenseWorkflowForm((current) => ({ ...current, receptionist_direct_limit: event.target.value })) }} required />
              <small>Above this amount, the Receptionist is directed to the Accountant. At or below it, the Receptionist submits a Certificate of Honour for GM approval.</small>
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button" disabled={isSavingExpenseWorkflow}>
                {isSavingExpenseWorkflow ? 'Saving limits...' : 'Save expense limits'}
              </button>
            </div>
          </form>
        </article>
      ) : null}

      {(canReviewExpenseApprovals || submitsExpenseApprovals) && activeExpenseWorkspace === 'approvals' ? (
        <article className="panel panel-wide expense-approvals-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{canReviewExpenseApprovals ? 'General Manager Review' : 'Expense Requests'}</p>
              <h3>{canReviewExpenseApprovals ? 'Expense approvals and decisions' : 'Your submitted expenses'}</h3>
              <p className="muted-copy">
                {canReviewExpenseApprovals
                  ? 'Review pending certificates and memos for the selected branch, then approve or reject. Previously reviewed requests remain visible for oversight.'
                  : 'Your expenses remain outside the ledger and reports until the General Manager approves them.'}
              </p>
            </div>
            <span className="panel-tag">{canReviewExpenseApprovals ? `${pendingExpenseApprovalCount} pending` : `${expenseApprovalRequests.length} requests`}</span>
          </div>

          {documentPrintError ? <div className="message-banner error">{documentPrintError}</div> : null}
            <div className="expense-approval-summary" aria-label="Expense request counts">
              <div className="expense-approval-count is-pending"><span>Pending</span><strong>{pendingExpenseApprovalCount}</strong></div>
              <div className="expense-approval-count is-approved"><span>Approved</span><strong>{approvedExpenseApprovalCount}</strong></div>
              <div className="expense-approval-count is-rejected"><span>Rejected</span><strong>{rejectedExpenseApprovalCount}</strong></div>
            </div>
          {approvedCertificates.length ? (
            <div className="certificate-print-toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={approvedCertificates.every((request) => selectedCertificateIds.includes(String(request.id)))}
                  onChange={toggleAllVisibleCertificates}
                />
                Select approved certificates ({approvedCertificates.length})
              </label>
              <button type="button" className="primary-button" disabled={!selectedCertificates.length} onClick={() => printCertificates(selectedCertificates)}>
                Print / Save selected PDF{selectedCertificates.length ? ` (${selectedCertificates.length})` : ''}
              </button>
            </div>
          ) : null}
          {expenseApprovalRequests.length ? (
            <>
            <div className="expense-request-status-filters" role="group" aria-label="Filter expense requests by status">
              {[
                { value: 'pending', label: 'Pending', count: pendingExpenseApprovalCount },
                { value: 'approved', label: 'Approved', count: approvedExpenseApprovalCount },
                { value: 'rejected', label: 'Rejected', count: rejectedExpenseApprovalCount },
                { value: 'all', label: 'All requests', count: expenseApprovalRequests.length },
              ].map((filter) => (
                <button
                  type="button"
                  key={filter.value}
                  className={approvalStatusFilter === filter.value ? 'expense-request-filter is-active' : 'expense-request-filter'}
                  aria-pressed={approvalStatusFilter === filter.value}
                  onClick={() => setApprovalStatusFilter(filter.value)}
                >
                  {filter.label}<span>{filter.count}</span>
                </button>
              ))}
            </div>
            {visibleExpenseApprovalRequests.length ? (
            <div className="expense-approval-list">
              {visibleExpenseApprovalRequests.map((approval) => {
                const document = approval.supporting_document ?? {}
                const isPending = approval.status === 'pending'
                const isReviewing = reviewingExpenseRequestId === approval.id
                return (
                  <section className="expense-approval-card" key={approval.id}>
                    <div className="expense-approval-card-heading">
                      <div>
                        <span className="expense-approval-document-type">{document.title || (approval.document_type === 'expense_memo' ? 'Expense Memo' : approval.document_type === 'certificate_of_honour' ? 'Certificate of Honour' : 'Expense Submission')}</span>
                        <h4>{approval.description}</h4>
                        <p>{approval.category} · {approval.date}</p>
                      </div>
                      <div className="expense-approval-card-tools">
                        {approval.document_type === 'certificate_of_honour' && approval.status === 'approved' ? (
                          <label className="certificate-row-select" title="Select this approved certificate for bulk printing">
                            <input
                              type="checkbox"
                              checked={selectedCertificateIds.includes(String(approval.id))}
                              onChange={(event) => setSelectedCertificateIds((current) => event.target.checked
                                ? Array.from(new Set([...current, String(approval.id)]))
                                : current.filter((id) => id !== String(approval.id)))}
                            />
                            <span>Select PDF</span>
                          </label>
                        ) : null}
                        <span className={`expense-approval-status is-${approval.status}`}>{approval.status}</span>
                      </div>
                    </div>

                    {approval.document_type === 'certificate_of_honour' && approval.status === 'approved' ? (
                      <div className="header-actions"><button type="button" className="ghost-button" onClick={() => printCertificates([approval])}>Print / Save Certificate PDF</button></div>
                    ) : null}

                    <div className="expense-approval-amount">
                      <span>Requested amount</span>
                      <strong>{currency.format(Number(approval.amount ?? 0))}</strong>
                    </div>

                    <div className="expense-approval-meta">
                      <span>Submitted by <strong>{approval.submitted_by_name || 'Staff'} ({approval.submitted_role})</strong></span>
                      <span>Branch <strong>{approval.branch_id === 1 ? 'Labadi' : approval.branch_id === 2 ? 'Madina' : 'Branch ' + approval.branch_id}</strong></span>
                      <span>Submitted <strong>{approval.submitted_at}</strong></span>
                    </div>

                    <div className="expense-document-preview">
                      <strong>{document.title || 'Supporting document'}</strong>
                      {approval.document_type === 'expense_memo' ? (
                        <>
                          <p><b>Subject:</b> {document.memo_subject || 'Expense approval memo'}</p>
                          <p><b>To:</b> {document.memo_to || 'General Manager'} · <b>From:</b> {document.memo_from || approval.submitted_by_name || 'Accountant'} · <b>Date:</b> {document.memo_date || approval.date}</p>
                          <p><b>Memo body:</b></p>
                          <p className="expense-approval-memo-body">{document.memo_body || document.business_purpose || 'Not provided'}</p>
                          <ExpenseApprovalMemoSignature request={approval} token={props.token} />
                          <p>This memo and expense are submitted together for your approval.</p>
                        </>
                      ) : approval.document_type === 'certificate_of_honour' ? (
                        <>
                          <p>{document.declaration || 'The submitter certifies that this expense is for official business and the amount is accurate.'}</p>
                          <p className="expense-approval-clearance">{approval.status === 'approved' ? 'Approved by the General Manager and recorded in the expense ledger.' : approval.status === 'rejected' ? 'Rejected by the General Manager. This expense was not recorded.' : 'General Manager clearance is required before this expense is recorded.'}</p>
                          {approval.status === 'approved' && document.gm_signature_path ? <ExpenseApprovalMemoSignature request={approval} token={props.token} signerRole="gm" /> : null}
                        </>
                      ) : (
                        <p className="expense-approval-clearance">General Manager approval is required before this expense is recorded.</p>
                      )}
                      {document.receipt_unavailable ? <p><strong>No receipt available:</strong> the approved expense will be marked for backup Certificate of Honour export.</p> : null}
                      <small>Prepared by {document.prepared_by || approval.submitted_by_name || 'Staff'} · {document.branch || 'Branch'}</small>
                    </div>

                    {!isPending && approval.decision_note ? <p className="expense-approval-decision-note"><strong>GM note:</strong> {approval.decision_note}</p> : null}
                    {!isPending && approval.reviewed_by_name ? <p className="muted-copy">Reviewed by {approval.reviewed_by_name} · {approval.reviewed_at}</p> : null}

                    {canReviewExpenseApprovals && isPending ? (
                      <>
                        {approval.document_type === 'certificate_of_honour' && !gmExpenseSignatureAvailable ? (
                          <p className="expense-signature-required" role="alert">Save your reusable General Manager signature in the <a href="#/memos">Memos Signature Library</a> before approving this Certificate of Honour.</p>
                        ) : null}
                        <label className="expense-approval-note-field">
                          Decision note {approvalNotes[approval.id] ? '(required to reject)' : '(optional)'}
                          <textarea
                            rows="2"
                            value={approvalNotes[approval.id] ?? ''}
                            onChange={(event) => setApprovalNotes((current) => ({ ...current, [approval.id]: event.target.value }))}
                            placeholder="Add a reason or approval note"
                          />
                        </label>
                        <div className="filter-actions-row expense-approval-actions">
                          <button type="button" className="primary-button" disabled={isReviewing || (approval.document_type === 'certificate_of_honour' && !gmExpenseSignatureAvailable)} onClick={() => reviewExpenseRequest(approval.id, 'approve')}>
                            {isReviewing ? 'Saving decision...' : 'Approve and record expense'}
                          </button>
                          <button type="button" className="ghost-button" disabled={isReviewing || !(approvalNotes[approval.id] ?? '').trim()} onClick={() => reviewExpenseRequest(approval.id, 'reject')}>
                            Reject request
                          </button>
                        </div>
                      </>
                    ) : null}
                  </section>
                )
              })}
            </div>
            ) : (
              <p className="muted-copy expense-approval-empty">No {approvalStatusFilter} expense requests for this branch. Choose another status to review requests.</p>
            )}
            </>
          ) : (
            <p className="muted-copy expense-approval-empty">
              {canReviewExpenseApprovals ? 'There are no expense requests for this branch.' : 'You have no expense requests yet.'}
            </p>
          )}
        </article>
      ) : null}

      {activeExpenseWorkspace === 'ledger' ? (
      <section className={`finance-layout-expenses${usePremiumExpenseLayout ? ' finance-layout-expenses-premium' : ''}${canManageExpenses ? ' finance-layout-expenses-editable' : ''}`}>
        {canCreateExpenses ? (
          <div className="expense-page-toolbar">
            <button type="button" className="primary-button expense-add-button" onClick={openCreateExpenseModal}>
              Add Expense
            </button>
          </div>
        ) : null}

        <article className={`panel panel-wide expense-filters-panel expense-ledger-panel${usePremiumExpenseLayout ? ' expense-premium-panel' : ''}`}>
            <div className="panel-heading expense-filter-heading">
              <div className="expense-filter-heading-copy">
                <p className="eyebrow">Search & Filters</p>
                <h3>Find branch expenses fast</h3>
                <p className="muted-copy">Search branch expense history by description, category, and date range.</p>
              </div>
              <span className="panel-tag">{props.financeExpenses?.pagination?.total ?? 0} records</span>
            </div>

            <form
              className={`expense-page-stack expense-filter-grid-horizontal table-attached-filter${usePremiumExpenseLayout ? ' expense-premium-form expense-premium-filter-form' : ''}`}
              onSubmit={applyExpenseFilters}
            >
              <label>
                Search
                <input
                  value={props.financeExpenseFilters.search}
                  onChange={(event) => commitExpenseFilters({ ...props.financeExpenseFilters, search: event.target.value, page: 1 })}
                  placeholder="Description or note"
                />
              </label>
              <label>
                Category
                <select
                  value={props.financeExpenseFilters.category}
                  onChange={(event) => commitExpenseFilters({ ...props.financeExpenseFilters, category: event.target.value, page: 1 })}
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                Certificate filter
                <select
                  value={props.financeExpenseFilters.no_receipt_coh ?? 'all'}
                  onChange={(event) => commitExpenseFilters({ ...props.financeExpenseFilters, no_receipt_coh: event.target.value, page: 1 })}
                >
                  <option value="all">All expenses</option>
                  <option value="1">No-Receipt CoH / GM-approved</option>
                </select>
              </label>
              <label>
                Start date
                <input
                  type="date"
                  value={props.financeExpenseFilters.start_date}
                  onChange={(event) => commitExpenseFilters({ ...props.financeExpenseFilters, start_date: event.target.value, page: 1 })}
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  value={props.financeExpenseFilters.end_date}
                  onChange={(event) => commitExpenseFilters({ ...props.financeExpenseFilters, end_date: event.target.value, page: 1 })}
                />
              </label>
              <label>
                Sort ledger
                <select
                  value={props.financeExpenseFilters.sort ?? 'date_desc'}
                  onChange={(event) => commitExpenseFilters({ ...props.financeExpenseFilters, sort: event.target.value, page: 1 })}
                >
                  <option value="date_desc">Date: newest first</option>
                  <option value="date_asc">Date: oldest first</option>
                  <option value="amount_desc">Amount: highest first</option>
                  <option value="amount_asc">Amount: lowest first</option>
                  <option value="category_asc">Category: A to Z</option>
                  <option value="category_desc">Category: Z to A</option>
                </select>
              </label>
              <div className="filter-actions-row full-span">
                <button type="submit" className="primary-button">Apply filters</button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    commitExpenseFilters(expenseFilterDefaults)
                  }}
                >
                  Reset
                </button>
              </div>
            </form>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Expense Ledger</p>
              <h3>Branch expense history</h3>
            </div>
            <span className="panel-tag">{currency.format(visibleExpenseTotal)} total</span>
          </div>

          {canManageExpenses ? (
            <div className="expense-coh-bulk-toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={eligibleExpensesOnPage.length > 0 && eligibleExpensesOnPage.every((expense) => selectedExpenseIds.includes(String(expense.expense_id)))}
                  onChange={toggleCurrentPageExpenseCertificates}
                  disabled={!eligibleExpensesOnPage.length}
                />
                Select eligible on this page ({eligibleExpensesOnPage.length})
              </label>
              <span>{selectedExpenseIds.length} certificate{selectedExpenseIds.length === 1 ? '' : 's'} selected across pages</span>
              <span>Includes manual expenses marked without a receipt and expenses approved by the GM.</span>
              <button type="button" className="primary-button" disabled={!selectedExpenseRecords.length} onClick={printSelectedExpenseCertificates}>
                Print / Save selected PDFs{selectedExpenseRecords.length ? ` (${selectedExpenseRecords.length})` : ''}
              </button>
            </div>
          ) : null}

          <TableShell>
            <table className="portal-table">
              <thead>
                <tr>
                  {canManageExpenses ? <th>Select CoH</th> : null}
                  <th>Expense ID</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Branch</th>
                  <th>Entered by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(props.financeExpenses?.records ?? []).map((expense) => (
                  <tr
                    key={expense.expense_id}
                    className="clickable-table-row"
                    onClick={() => openExpenseModal(expense)}
                  >
                    {canManageExpenses ? (
                      <td>
                        {isManualExpenseEligibleForCertificate(expense) ? (
                          <input
                            type="checkbox"
                            aria-label={`Select no-receipt Certificate of Honour for expense ${expense.expense_id}`}
                            checked={selectedExpenseIds.includes(String(expense.expense_id))}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => toggleExpenseCertificate(expense)}
                          />
                        ) : <span className="muted-copy">-</span>}
                      </td>
                    ) : null}
                    <td>{expense.expense_id}</td>
                    <td>{expense.description}</td>
                    <td>{expense.category}</td>
                    <td>{expense.date}</td>
                    <td>{currency.format(Number(expense.amount ?? 0))}</td>
                    <td>{props.financeExpenses?.branch_name ?? 'Active branch'}</td>
                    <td>{expense.entered_by || 'Unknown'}</td>
                    <td>
                      <div className="expense-row-actions">
                        <button
                          type="button"
                          className="mini-action"
                          onClick={(event) => {
                            event.stopPropagation()
                            openExpenseModal(expense)
                          }}
                        >
                          {canEditExpenseRecords && (!expense.is_frame_reserved || canEditFrameReservationDate) ? 'Edit' : 'View'}
                        </button>
                        {canManageExpenses && isManualExpenseEligibleForCertificate(expense) ? (
                          <button
                            type="button"
                            className="mini-action expense-certificate-action"
                            title="Print or save a no-receipt Certificate of Honour for this expense"
                            onClick={(event) => {
                              event.stopPropagation()
                              printManualExpenseCertificate(expense)
                            }}
                          >
                            No-Receipt CoH
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <Pagination
            pagination={props.financeExpenses?.pagination}
            onPageChange={(page) => props.setFinanceExpenseQuery((current) => ({ ...current, page }))}
            showPageNumbers
            onPerPageChange={(perPage) => {
              props.setFinanceExpenseFilters((current) => ({ ...current, per_page: perPage, page: 1 }))
              props.setFinanceExpenseQuery((current) => ({ ...current, per_page: perPage, page: 1 }))
            }}
          />
        </article>

        {!isReceptionistExpenseView ? (
          <article className="panel panel-wide expense-trend-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Spend Trend</p>
                <h3>Daily expense movement</h3>
              </div>
              <span className="panel-tag">{(props.financeExpenses?.trend ?? []).length} points</span>
            </div>

            <div className="expense-visual-grid">
              <LineTrendCard
                title="Spend Trend"
                items={(props.financeExpenses?.trend ?? []).map((item) => ({
                  label: item.expense_date,
                  value: Number(item.total ?? 0),
                }))}
              />

              <BarChartCard
                title="Expense Categories"
                items={(props.financeExpenses?.category_breakdown ?? []).slice(0, 6).map((item) => ({
                  label: item.category,
                  value: Number(item.total ?? 0),
                  tone: 'danger',
                }))}
                total={visibleExpenseTotal}
                emptyLabel="No expense graph data yet"
                compact
              />
            </div>
          </article>
        ) : null}

        {isCategoryManager ? (
          <article className="panel panel-wide">
            <div className="category-manager-inline">
              <details>
                <summary>
                  Manage Expense Categories ({props.financeExpenses?.category_records?.length ?? 0})
                </summary>

              <div className="stack-list category-manager-content">
              <form
                className="patient-filter-grid"
                onSubmit={(event) => {
                  event.preventDefault()
                  props.saveExpenseCategory(newCategoryName)
                  setNewCategoryName('')
                }}
              >
                <label className="full-span">
                  Add category
                  <input
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="e.g. Marketing, Optical Supplies, Repairs"
                    required
                  />
                </label>
                <div className="filter-actions-row full-span">
                  <button type="submit" className="mini-action" disabled={props.isSavingExpenseCategory}>Add</button>
                </div>
              </form>

              {(props.financeExpenses?.category_records ?? []).map((category) => {
                const isEditing = editingCategoryId === category.id

                return (
                  <div key={category.id} className="stack-item">
                    <div style={{ flex: 1 }}>
                      {isEditing ? (
                        <input
                          value={editingCategoryName}
                          onChange={(event) => setEditingCategoryName(event.target.value)}
                          className="inventory-inline-input"
                        />
                      ) : (
                        <>
                          <strong>{category.name}</strong>
                          <span>Used in receptionist and accountant expense entry.</span>
                        </>
                      )}
                    </div>
                    <div className="filter-actions-row">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="mini-action"
                            disabled={props.isSavingExpenseCategory}
                            onClick={async () => {
                              try {
                                await props.updateExpenseCategory(category.id, editingCategoryName)
                                setEditingCategoryId(null)
                                setEditingCategoryName('')
                              } catch {
                              }
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => {
                              setEditingCategoryId(null)
                              setEditingCategoryName('')
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="mini-action"
                            onClick={() => {
                              setEditingCategoryId(category.id)
                              setEditingCategoryName(category.name)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ghost-button danger-outline"
                            disabled={props.isDeletingExpenseCategoryId === category.id}
                            onClick={async () => {
                              try {
                                await props.deleteExpenseCategory(category.id)
                              } catch {
                              }
                            }}
                          >
                            {props.isDeletingExpenseCategoryId === category.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              </div>
              </details>
            </div>
          </article>
        ) : null}
      </section>
      ) : null}

      {selectedExpense ? (
        <div className="modal-overlay" onClick={closeExpenseModal}>
          <article className="modal-panel expense-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Expense Record</p>
                <h3>{canEditSelectedExpense ? 'Edit expense entry' : 'Expense details'}</h3>
              </div>
              <div className="filter-actions-row">
                {canDeleteSelectedExpense ? (
                  <button
                    type="button"
                    className="ghost-button danger-outline"
                    disabled={props.deletingExpenseRecordId === selectedExpense.expense_id}
                    onClick={async () => {
                      const confirmMessage = selectedExpense.is_lens_linked
                        ? 'Delete this Lens Tracker expense row? Use this for clearing duplicates. If the lens cost still exists in Lens Tracker, one expense entry may be recreated automatically.'
                        : selectedExpense.is_frame_reserved
                          ? 'Delete this frame reservation expense and its linked reservation? This will remove the reserved amount from the Monitor frame set-aside total.'
                        : 'Delete this expense record?'
                      if (!window.confirm(confirmMessage)) return
                      try {
                        await props.deleteExpenseRecord(selectedExpense.expense_id)
                        closeExpenseModal()
                      } catch {
                      }
                    }}
                  >
                    {props.deletingExpenseRecordId === selectedExpense.expense_id ? 'Deleting...' : 'Delete expense'}
                  </button>
                ) : null}
                <button type="button" className="ghost-button" onClick={closeExpenseModal}>Close</button>
              </div>
            </div>

            {selectedExpense.is_lens_linked ? (
              <div className="message-banner">
                This expense was created from Lens Tracker. Amount and details are controlled there.
                {canDeleteLinkedLensExpense ? ' You can delete duplicate rows from here.' : ''}
              </div>
            ) : null}
            {selectedExpense.is_frame_reserved ? (
              <div className="message-banner">
                This expense was created from Frames Tracker. Its amount and description stay linked to the reservation; the General Manager can correct its date here.
              </div>
            ) : null}

            <form
              className="patient-form-grid"
              onSubmit={async (event) => {
                event.preventDefault()
                if (!canEditSelectedExpense) return
                try {
                  await props.updateExpenseRecord(selectedExpense.expense_id, expenseModalForm)
                  if (!expenseModalForm.receipt_unavailable && !selectedExpense.gm_approved) {
                    const updatedId = String(selectedExpense.expense_id)
                    setSelectedExpenseIds((current) => current.filter((id) => id !== updatedId))
                    setSelectedExpenseRecords((current) => current.filter((expense) => String(expense.expense_id) !== updatedId))
                  }
                  closeExpenseModal()
                } catch {
                }
              }}
            >
              <label className="full-span">
                Description
                <textarea
                  rows="4"
                  value={expenseModalForm.description}
                  onChange={(event) => setExpenseModalForm((current) => ({ ...current, description: event.target.value }))}
                  readOnly={!canEditSelectedExpenseDetails}
                  required
                />
              </label>
              <label>
                Amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseModalForm.amount}
                  onChange={(event) => setExpenseModalForm((current) => ({ ...current, amount: event.target.value }))}
                  readOnly={!canEditSelectedExpenseDetails}
                  required
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={expenseModalForm.date}
                  onChange={(event) => setExpenseModalForm((current) => ({ ...current, date: event.target.value }))}
                  readOnly={!canEditSelectedExpense}
                  required
                />
              </label>
              <label className="full-span">
                Category
                <select
                  value={expenseModalForm.category}
                  onChange={(event) => setExpenseModalForm((current) => ({ ...current, category: event.target.value }))}
                  disabled={!canEditSelectedExpenseDetails}
                >
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>

              {canEditSelectedExpenseDetails ? (
                <label className="memo-checkbox full-span expense-receipt-unavailable-option">
                  <input
                    type="checkbox"
                    checked={Boolean(expenseModalForm.receipt_unavailable)}
                    onChange={(event) => setExpenseModalForm((current) => ({ ...current, receipt_unavailable: event.target.checked }))}
                  />
                  <span><strong>No supplier receipt available</strong><small>Save this flag to include the entry in the No-Receipt CoH filter.</small></span>
                </label>
              ) : null}

              {canEditSelectedExpense ? (
                <div className="filter-actions-row full-span">
                  <button type="submit" className="primary-button" disabled={props.isUpdatingExpenseRecord}>
                    {props.isUpdatingExpenseRecord ? 'Saving changes...' : isSelectedFrameReserved ? 'Save date' : 'Save changes'}
                  </button>
                </div>
              ) : null}
            </form>
          </article>
        </div>
      ) : null}

      {isCreateExpenseModalOpen && canCreateExpenses ? (
        <div className="modal-overlay" onClick={closeCreateExpenseModal}>
          <article className="modal-panel expense-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Add Expense</p>
                <h3>Record a new branch expense</h3>
              </div>
              <button type="button" className="ghost-button" onClick={closeCreateExpenseModal}>Close</button>
            </div>

            <form
              className="expense-create-modal-form expense-create-modal-form-premium"
              onSubmit={async (event) => {
                event.preventDefault()
                try {
                  await props.saveExpenseRecord(event)
                  closeCreateExpenseModal()
                } catch {
                }
              }}
            >
              <label className="full-span">
                Description
                <textarea
                  rows="4"
                  value={props.expenseForm.description}
                  onChange={(event) => props.setExpenseForm((current) => updateExpenseMemoFields(current, { description: event.target.value }))}
                  required
                />
              </label>
              <label>
                Amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={props.expenseForm.amount}
                  onChange={(event) => props.setExpenseForm((current) => updateExpenseMemoFields(current, { amount: event.target.value }))}
                  required
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={props.expenseForm.date}
                  onChange={(event) => props.setExpenseForm((current) => updateExpenseMemoFields(current, { date: event.target.value }))}
                  required
                />
              </label>
              <label className="full-span">
                Category
                <select
                  value={props.expenseForm.category}
                  onChange={(event) => props.setExpenseForm((current) => updateExpenseMemoFields(current, { category: event.target.value }))}
                  required
                >
                  {!categoryOptions.length ? <option value="">No categories yet</option> : null}
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              {!isReceptionistExpenseView ? (
                <label className="memo-checkbox full-span expense-receipt-unavailable-option">
                  <input
                    type="checkbox"
                    checked={Boolean(props.expenseForm.receipt_unavailable)}
                    onChange={(event) => props.setExpenseForm((current) => ({ ...current, receipt_unavailable: event.target.checked }))}
                  />
                  <span><strong>No supplier receipt available</strong><small>Mark this expense so it can be filtered and exported with a backup Certificate of Honour.</small></span>
                </label>
              ) : null}
              {submitsExpenseApprovals ? (
                <div className="expense-approval-rule full-span">
                  <strong>General Manager approval required</strong>
                  <span>{isReceptionistExpenseView
                    ? `At or below ${currency.format(Number(expenseWorkflowSettings.receptionist_direct_limit ?? 1000))}, submit a Certificate of Honour for GM approval. Above the limit, contact the Accountant. Nothing is recorded before approval.`
                    : `At or below ${currency.format(Number(expenseWorkflowSettings.accountant_memo_threshold ?? 1000))}, submit a Certificate of Honour for GM approval. Above the limit, complete the Expense Memo below; it will go to the GM with the expense request.`}</span>
                </div>
              ) : null}
              {submitsExpenseApprovals && (isReceptionistExpenseView || isAccountantExpenseView) && draftExpenseAmount > 0 && !receptionistAboveLimit && !isMemoThresholdExpense ? (
                <section className="certificate-of-honour full-span">
                  <div className="certificate-of-honour-heading">
                    <span>Supporting Document</span>
                    <h4>Certificate of Honour</h4>
                  </div>
                  <div className="certificate-of-honour-details">
                    <span><small>Expense</small><strong>{props.expenseForm.description || 'Description to be completed'}</strong></span>
                    <span><small>Category</small><strong>{props.expenseForm.category || 'Select category'}</strong></span>
                    <span><small>Date</small><strong>{props.expenseForm.date || 'Select date'}</strong></span>
                    <span><small>Amount</small><strong>{currency.format(draftExpenseAmount)}</strong></span>
                  </div>
                  <p>I certify that this expense was incurred for official business and that the details and amount above are accurate.</p>
                  <p className="certificate-clearance-notice">This request goes directly to the General Manager. General Manager clearance is required before this expense is recorded.</p>
                  <label className="certificate-confirmation">
                    <input
                      type="checkbox"
                      checked={Boolean(props.expenseForm.certificate_confirmed)}
                      onChange={(event) => props.setExpenseForm((current) => ({ ...current, certificate_confirmed: event.target.checked }))}
                      required
                    />
                    I confirm and submit this Certificate of Honour for General Manager approval.
                  </label>
                </section>
              ) : null}
              {submitsExpenseApprovals && (isMemoThresholdExpense || receptionistAboveLimit) ? (
                receptionistAboveLimit ? (
                  <div className="expense-threshold-block full-span" role="alert">
                    <strong>Contact the Accountant to record this expense.</strong>
                    <span>This amount is above the current Receptionist limit of {currency.format(Number(expenseWorkflowSettings.receptionist_direct_limit ?? 1000))}. An Accountant must handle it using the Finance memo workflow.</span>
                  </div>
                ) : (
                  <section className="expense-memo-document full-span">
                    <div>
                      <span>Supporting Document · Required</span>
                      <h4>Expense Memo</h4>
                    </div>
                  <label>
                    Memo subject
                    <input
                      value={props.expenseForm.memo_subject ?? ''}
                      onChange={(event) => props.setExpenseForm((current) => ({ ...current, memo_subject: event.target.value }))}
                      maxLength="255"
                      required
                    />
                  </label>
                  <div className="memo-template-grid">
                    <label>
                      Purpose / Reason
                      <input
                        value={props.expenseForm.memo_purpose ?? ''}
                        onChange={(event) => props.setExpenseForm((current) => updateExpenseMemoFields(current, { memo_purpose: event.target.value }))}
                        maxLength="255"
                        placeholder="What is this expense for?"
                      />
                    </label>
                    <label>
                      Period / Description
                      <input
                        value={props.expenseForm.memo_period ?? ''}
                        onChange={(event) => props.setExpenseForm((current) => updateExpenseMemoFields(current, { memo_period: event.target.value }))}
                        maxLength="255"
                        placeholder="Period or additional details"
                      />
                    </label>
                    <label>
                      Payment method
                      <select
                        value={props.expenseForm.memo_payment_method ?? 'bank'}
                        onChange={(event) => props.setExpenseForm((current) => updateExpenseMemoFields(current, { memo_payment_method: event.target.value }))}
                      >
                        <option value="bank">Bank</option>
                        <option value="cash">Cash</option>
                        <option value="mobile money">Mobile money</option>
                        <option value="cash / bank">Cash / bank</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Memo body
                    <textarea
                      rows="7"
                      value={props.expenseForm.memo_justification ?? ''}
                      onChange={(event) => props.setExpenseForm((current) => ({ ...current, memo_justification: event.target.value }))}
                      maxLength="4000"
                      required
                    />
                  </label>
                  {accountantMemoSignatureAvailable ? (
                    <p className="expense-signature-ready">Your reusable Accountant signature will be attached to this memo.</p>
                  ) : (
                    <p className="expense-signature-required" role="alert">A saved reusable Accountant signature is required. Upload it in the <a href="#/memos">Memos signature library</a>, then return here to submit the expense.</p>
                  )}
                  <p className="certificate-clearance-notice">This completed memo will be attached to the expense request for the General Manager to review and approve. You do not need to leave this page or create a separate memo.</p>
                  </section>
                )
              ) : null}
              <div className="filter-actions-row full-span">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={props.isSavingExpense || receptionistAboveLimit || ((isReceptionistExpenseView || isAccountantExpenseView) && draftExpenseAmount > 0 && !receptionistAboveLimit && !isMemoThresholdExpense && !props.expenseForm.certificate_confirmed) || (submitsExpenseApprovals && isMemoThresholdExpense && (!accountantMemoSignatureAvailable || !props.expenseForm.memo_subject?.trim() || !props.expenseForm.memo_justification?.trim()))}
                >
                  {props.isSavingExpense ? 'Submitting expense...' : submitsExpenseApprovals ? 'Submit for General Manager approval' : 'Save expense'}
                </button>
              </div>
            </form>
          </article>
        </div>
      ) : null}
    </>
  )
}

function ReceiptReprintsOnlyView(props) {
  const activeDateRange = props.financePaymentQuery.date_from || props.financePaymentQuery.date_to
    ? `${props.financePaymentQuery.date_from || 'Start'} to ${props.financePaymentQuery.date_to || 'Today'}`
    : 'All dates'
  const activeSearch = props.financePaymentQuery.search?.trim() ? props.financePaymentQuery.search : 'No search term'
  const activeReceiptSearch = props.financePaymentQuery.receipt_search?.trim() ? props.financePaymentQuery.receipt_search : 'All receipt records'

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">{props.pageHeader.eyebrow}</p>
          <h3>{props.pageHeader.title}</h3>
          <p className="header-copy">{props.pageHeader.copy}</p>
        </div>
      </div>

      {props.financeError ? <div className="message-banner error">{props.financeError}</div> : null}
      {props.financeSuccess ? <div className="message-banner success">{props.financeSuccess}</div> : null}

      <section className="finance-layout">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Receipt Reprints</p>
              <h3>Find and print past receipts</h3>
            </div>
            <span className="panel-tag">{props.financePayments?.transactions_pagination?.total ?? 0} receipts</span>
          </div>

          <form
          className="patient-filter-grid table-attached-filter"
            onSubmit={(event) => {
              event.preventDefault()
              props.setFinancePaymentQuery((current) => ({
                ...current,
                ...props.financePaymentFilters,
                page: 1,
                receipt_page: 1,
              }))
            }}
          >
            <label>
              Date from
              <input
                type="date"
                value={props.financePaymentFilters.date_from}
                onChange={(event) =>
                  props.setFinancePaymentFilters((current) => ({ ...current, date_from: event.target.value }))
                }
              />
            </label>
            <label>
              Date to
              <input
                type="date"
                value={props.financePaymentFilters.date_to}
                onChange={(event) =>
                  props.setFinancePaymentFilters((current) => ({ ...current, date_to: event.target.value }))
                }
              />
            </label>
            <label>
              Search billing / patient
              <input
                value={props.financePaymentFilters.search}
                onChange={(event) =>
                  props.setFinancePaymentFilters((current) => ({ ...current, search: event.target.value }))
                }
                placeholder="Folder ID, billing ID, patient name, receipt..."
              />
            </label>
            <label>
              Search receipt reprints
              <input
                value={props.financePaymentFilters.receipt_search}
                onChange={(event) =>
                  props.setFinancePaymentFilters((current) => ({ ...current, receipt_search: event.target.value }))
                }
                placeholder="Receipt number, patient, folder, method, reference..."
              />
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button">Search receipts</button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const defaults = { date_from: '', date_to: '', search: '', receipt_search: '', page: 1, per_page: 12, receipt_page: 1, receipt_per_page: 10 }
                  props.setFinancePaymentFilters(defaults)
                  props.setFinancePaymentQuery(defaults)
                }}
              >
                Clear
              </button>
            </div>
          </form>

          <div className="finance-chip-row payment-filter-chip-row">
            <div className="finance-chip">
              <span>Active Date Range</span>
              <strong>{activeDateRange}</strong>
            </div>
            <div className="finance-chip">
              <span>Search Term</span>
              <strong>{activeSearch}</strong>
            </div>
            <div className="finance-chip">
              <span>Receipt Search</span>
              <strong>{activeReceiptSearch}</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Receipt List</p>
              <h3>Print any earlier receipt</h3>
            </div>
            <span className="panel-tag">
              Page {props.financePayments?.transactions_pagination?.page ?? 1} of {props.financePayments?.transactions_pagination?.total_pages || 1}
            </span>
          </div>

          <TableShell>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Folder ID</th>
                  <th>Receipt</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(props.financePayments?.transactions ?? []).map((transaction) => (
                  <tr key={`receipt-only-${transaction.id}`}>
                    <td>{transaction.name || 'N/A'}</td>
                    <td>{transaction.folder_id}</td>
                    <td>{transaction.receipt_number}</td>
                    <td>{transaction.date}</td>
                    <td>{transaction.payment_method}</td>
                    <td>{currency.format(Number(transaction.amount_paid ?? 0))}</td>
                    <td>{transaction.reference || transaction.transaction_id || 'N/A'}</td>
                    <td>
                      <button type="button" className="mini-action" onClick={() => props.printFinanceReceipt(transaction)}>
                        Reprint
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <Pagination
            pagination={props.financePayments?.transactions_pagination}
            onPageChange={(page) => props.setFinancePaymentQuery((current) => ({ ...current, receipt_page: page }))}
          />
        </article>
      </section>
    </section>
  )
}

function localDateIso(value) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function currentMonthDateRange() {
  const now = new Date()

  return {
    start_date: localDateIso(new Date(now.getFullYear(), now.getMonth(), 1)),
    end_date: localDateIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

function CeoExpenseReviewView(props) {
  const summaryStats = props.financeSummary?.stats ?? {}
  const expenseStats = props.financeExpenses?.stats ?? {}
  const recordedSales = Number(summaryStats.sales_month ?? 0)
  const insuredSales = Number(summaryStats.insurance_billed_month ?? 0)
  const totalBusinessValue = Number(summaryStats.sales_with_insurance_month ?? (recordedSales + insuredSales))
  const filteredExpenseTotal = Number(expenseStats.filtered_total ?? expenseStats.total ?? 0)
  const monthlyExpenses = Number(expenseStats.monthly ?? summaryStats.expenses_month ?? 0)
  const outstandingBalance = Number(summaryStats.outstanding_balance ?? 0)
  const trendItems = (props.financeExpenses?.trend ?? []).map((item) => ({
    label: item.expense_date,
    value: Number(item.total ?? 0),
  }))
  const categoryItems = (props.financeExpenses?.category_breakdown ?? []).slice(0, 6)

  function commitExpenseFilters(nextFilters) {
    props.setFinanceExpenseFilters(nextFilters)
    props.setFinanceExpenseQuery((current) => ({
      ...current,
      ...nextFilters,
      page: 1,
    }))
  }

  useEffect(() => {
    const liveUpdateDelay = props.financeExpenseFilters.search ? 220 : 0
    const timeoutId = window.setTimeout(() => {
      props.setFinanceExpenseQuery((current) => {
        const next = {
          ...current,
          filter: props.financeExpenseFilters.filter,
          start_date: props.financeExpenseFilters.start_date,
          end_date: props.financeExpenseFilters.end_date,
          category: props.financeExpenseFilters.category,
          search: props.financeExpenseFilters.search,
          sort: props.financeExpenseFilters.sort ?? 'date_desc',
          page: 1,
          per_page: current?.per_page ?? props.financeExpenseFilters.per_page ?? 12,
        }

        return ['filter', 'start_date', 'end_date', 'category', 'search', 'sort', 'page', 'per_page']
          .every((key) => (current?.[key] ?? '') === (next?.[key] ?? ''))
          ? current
          : next
      })
    }, liveUpdateDelay)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [props.financeExpenseFilters, props.setFinanceExpenseQuery])

  function applyCeoExpenseFilters(event) {
    event.preventDefault()
    props.setFinanceExpenseQuery((current) => ({
      ...current,
      ...props.financeExpenseFilters,
      page: 1,
      refresh_token: Date.now(),
    }))
  }

  function resetCeoExpenseFilters() {
    const defaults = { filter: 'all', start_date: '', end_date: '', category: 'all', search: '', sort: 'date_desc', page: 1, per_page: 12 }
    commitExpenseFilters(defaults)
  }

  return (
    <section className="ceo-expense-review">
      <article className="panel ceo-expense-panel">
        <div className="panel-heading expense-filter-heading">
          <div className="expense-filter-heading-copy">
            <p className="eyebrow">Review Filters</p>
            <h3>Narrow the expense window cleanly</h3>
            <p className="muted-copy">Use a simple full-width review form to trace a category, a note, or a date span without any compressed two-column layout.</p>
          </div>
          <span className="panel-tag">{props.financeExpenses?.pagination?.total ?? 0} records</span>
        </div>

        <form className="ceo-expense-filter-form table-attached-filter" onSubmit={applyCeoExpenseFilters}>
          <label>
            Search expense notes
            <input
              value={props.financeExpenseFilters.search}
              onChange={(event) => commitExpenseFilters({ ...props.financeExpenseFilters, search: event.target.value, page: 1 })}
              placeholder="Description or note"
            />
          </label>
          <label>
            Category
            <select
              value={props.financeExpenseFilters.category}
              onChange={(event) => commitExpenseFilters({ ...props.financeExpenseFilters, category: event.target.value, page: 1 })}
            >
              <option value="all">All categories</option>
              {props.categoryOptions.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Start date
            <input
              type="date"
              value={props.financeExpenseFilters.start_date}
              onChange={(event) => commitExpenseFilters({ ...props.financeExpenseFilters, start_date: event.target.value, page: 1 })}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={props.financeExpenseFilters.end_date}
              onChange={(event) => commitExpenseFilters({ ...props.financeExpenseFilters, end_date: event.target.value, page: 1 })}
            />
          </label>
          <label>
            Sort ledger
            <select
              value={props.financeExpenseFilters.sort ?? 'date_desc'}
              onChange={(event) => commitExpenseFilters({ ...props.financeExpenseFilters, sort: event.target.value, page: 1 })}
            >
              <option value="date_desc">Date: newest first</option>
              <option value="date_asc">Date: oldest first</option>
              <option value="amount_desc">Amount: highest first</option>
              <option value="amount_asc">Amount: lowest first</option>
              <option value="category_asc">Category: A to Z</option>
              <option value="category_desc">Category: Z to A</option>
            </select>
          </label>
          <div className="filter-actions-row full-span">
            <button type="submit" className="primary-button">Apply review filters</button>
            <button type="button" className="ghost-button" onClick={resetCeoExpenseFilters}>Reset</button>
          </div>
        </form>
      </article>

      <article className="panel ceo-expense-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Expense Ledger</p>
            <h3>Open any expense record for detail review</h3>
          </div>
          <span className="panel-tag">{currency.format(filteredExpenseTotal)} total</span>
        </div>

        <TableShell>
          <table className="portal-table">
            <thead>
              <tr>
                <th>Expense ID</th>
                <th>Description</th>
                <th>Category</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Branch</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(props.financeExpenses?.records ?? []).map((expense) => (
                <tr
                  key={expense.expense_id}
                  className="clickable-table-row"
                  onClick={() => props.openExpenseModal(expense)}
                >
                  <td>{expense.expense_id}</td>
                  <td>{expense.description}</td>
                  <td>{expense.category}</td>
                  <td>{expense.date}</td>
                  <td>{currency.format(Number(expense.amount ?? 0))}</td>
                  <td>{props.financeExpenses?.branch_name ?? 'Active branch'}</td>
                  <td>
                    <button
                      type="button"
                      className="mini-action"
                      onClick={(event) => {
                        event.stopPropagation()
                        props.openExpenseModal(expense)
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>

        <Pagination
          pagination={props.financeExpenses?.pagination}
          onPageChange={(page) => props.setFinanceExpenseQuery((current) => ({ ...current, page }))}
        />
      </article>

      <article className="panel ceo-expense-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Spend Trend</p>
            <h3>How expense movement is developing</h3>
          </div>
          <span className="panel-tag">{trendItems.length} points</span>
        </div>
        <LineTrendCard items={trendItems} title="Daily Expense Trend" />
      </article>

      <article className="panel ceo-expense-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Category Pressure</p>
            <h3>Where the biggest expense weight is sitting</h3>
          </div>
          <span className="panel-tag">{categoryItems.length} categories</span>
        </div>
        <BarChartCard
          title="Top Expense Categories"
          items={categoryItems.map((item) => ({
            label: item.category,
            value: Number(item.total ?? 0),
            tone: 'danger',
          }))}
          total={filteredExpenseTotal}
          emptyLabel="No category breakdown available yet"
        />
      </article>
    </section>
  )
}

function TableShell({ children }) {
  return <div className="table-shell">{children}</div>
}

function Pagination({ pagination, onPageChange, showPageNumbers = false, onPerPageChange = null }) {
  if (!pagination) return null
  const totalPages = Math.max(Number(pagination.total_pages ?? 1), 1)
  return (
    <div className={`pagination-bar${showPageNumbers ? ' pagination-bar-numbered' : ''}`}>
      <div className="pagination-summary">
        <span className="muted-copy">Page {pagination.page} of {totalPages} · {pagination.total ?? 0} records</span>
        {onPerPageChange ? (
          <label className="pagination-size-control">
            Rows per page
            <select value={pagination.per_page ?? 12} onChange={(event) => onPerPageChange(Number(event.target.value))}>
              <option value="12">12</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
        ) : null}
      </div>
      <div className="pagination-actions">
        <button type="button" className="mini-action" disabled={pagination.page <= 1} onClick={() => onPageChange(Math.max(pagination.page - 1, 1))}>Previous</button>
        {showPageNumbers ? (
          <div className="pagination-number-list" aria-label="Expense ledger pages">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button
                key={page}
                type="button"
                className={Number(pagination.page) === page ? 'pagination-number is-current' : 'pagination-number'}
                aria-current={Number(pagination.page) === page ? 'page' : undefined}
                aria-label={`Page ${page}`}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            ))}
          </div>
        ) : null}
        <button type="button" className="mini-action" disabled={pagination.page >= totalPages} onClick={() => onPageChange(Math.min(pagination.page + 1, totalPages))}>Next</button>
      </div>
    </div>
  )
}

function Metric({ label, value, raw = false }) {
  const resolvedValue = raw
    ? typeof value === 'string'
      ? value
      : Number(value ?? 0)
    : currency.format(Number(value ?? 0))

  return (
    <div className="inline-metric">
      <span>{label}:</span>
      <strong>{resolvedValue}</strong>
    </div>
  )
}

function MetricCard({ label, value }) {
  return (
    <div className="expense-summary-card inline-metric-card">
      <span>{label}:</span>
      <strong>{currency.format(Number(value ?? 0))}</strong>
    </div>
  )
}

function BarChartCard({ title, items, total, emptyLabel = 'No data available', compact = false }) {
  const rows = (items ?? []).filter((item) => Number(item.value ?? 0) > 0)

  return (
    <div className={compact ? 'visual-card' : 'panel'}>
      <div className={compact ? 'visual-card-head' : 'panel-heading'}>
        <div>
          <p className="eyebrow">{compact ? 'Category Chart' : 'Chart'}</p>
          <h3>{title}</h3>
        </div>
      </div>

      {rows.length ? (
        <div className="stack-list">
          {rows.map((item) => {
            const percent = total > 0 ? Math.max((Number(item.value ?? 0) / total) * 100, 2) : 0

            return (
              <div key={item.label} className="stack-item">
                <div style={{ width: '100%' }}>
                  <div className="panel-top">
                    <strong>{item.label}</strong>
                    <span className="chart-value">{currency.format(Number(item.value ?? 0))}</span>
                  </div>
                  <div className="chart-track">
                    <div className={`chart-bar tone-${item.tone ?? 'info'}`} style={{ width: `${Math.min(percent, 100)}%` }} />
                  </div>
                  <span className="muted-copy">{percent.toFixed(1)}% of current total</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="muted-copy">{emptyLabel}</p>
      )}
    </div>
  )
}

function LineTrendCard({ items, title }) {
  const rows = (items ?? []).filter((item) => Number(item.value ?? 0) >= 0)

  if (!rows.length) {
    return <p className="muted-copy">No trend data available yet.</p>
  }

  const maxValue = Math.max(...rows.map((item) => Number(item.value ?? 0)), 1)
  const points = rows.map((item, index) => {
    const x = rows.length === 1 ? 160 : (index / (rows.length - 1)) * 320
    const y = 120 - (Number(item.value ?? 0) / maxValue) * 100
    return `${x},${y}`
  }).join(' ')
  const peak = rows.reduce((current, item) => (Number(item.value ?? 0) > Number(current.value ?? 0) ? item : current), rows[0])
  const latest = rows[rows.length - 1]

  return (
    <div className="visual-card">
      <div className="visual-card-head">
        <div>
          <p className="eyebrow">Trend</p>
          <h3>{title}</h3>
        </div>
        <span className="panel-tag">{rows.length} days</span>
      </div>

      <div className="trend-hero">
        <div className="trend-hero-stat">
          <span>Latest</span>
          <strong>{currency.format(Number(latest.value ?? 0))}</strong>
          <p>{formatShortDate(latest.label)}</p>
        </div>
        <div className="trend-hero-stat">
          <span>Peak</span>
          <strong>{currency.format(Number(peak.value ?? 0))}</strong>
          <p>{formatShortDate(peak.label)}</p>
        </div>
      </div>

      <svg viewBox="0 0 320 140" className="trend-svg" aria-hidden="true">
        <path d="M0 120 H320" className="trend-axis" />
        <polyline fill="none" points={points} className="trend-line" />
        {rows.map((item, index) => {
          const x = rows.length === 1 ? 160 : (index / (rows.length - 1)) * 320
          const y = 120 - (Number(item.value ?? 0) / maxValue) * 100

          return <circle key={`${item.label}-${index}`} cx={x} cy={y} r="4" className="trend-point" />
        })}
      </svg>
      <div className="trend-labels">
        {rows.slice(-6).map((item) => (
          <div key={item.label} className="trend-label">
            <strong>{currency.format(Number(item.value ?? 0))}</strong>
            <span>{formatShortDate(item.label)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatShortDate(value) {
  if (!value) return 'Unknown date'

  return new Date(`${value}T00:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(value) {
  if (!value) return 'Unknown'
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function buildPaymentFamilyBreakdown(methods) {
  const totals = new Map()

  for (const method of methods) {
    const label = normalizePaymentMethod(method.payment_method)
    totals.set(label, (totals.get(label) ?? 0) + Number(method.total ?? 0))
  }

  return Array.from(totals.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total)
}

function normalizePaymentMethod(method) {
  const value = String(method ?? '').trim().toLowerCase()

  if (['cash'].includes(value)) return 'Cash'
  if (['momo', 'mobile money', 'momO', 'moMo'].map((item) => item.toLowerCase()).includes(value)) return 'Mobile Money'
  if (value === 'paystack') return 'Paystack'
  if (!value) return 'Other'

  return method
}

function formatPercent(amount, total) {
  if (!total) return '0.0%'
  return `${((amount / total) * 100).toFixed(1)}%`
}
