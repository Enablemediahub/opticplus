import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

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

export default function FinanceSection(props) {
  const pageMode = props.pageMode ?? 'default'
  const financeTabs = useMemo(() => tabsByMode[pageMode] ?? tabsByMode.default, [pageMode])
  const [activeTab, setActiveTab] = useState(defaultTabByMode[pageMode] ?? 'Payments')

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
      ['Sales', props.financeSales?.stats.total_sales, 'Collected sales in the current filter scope', 'seen', 'money'],
      ['Insurance Value', props.financeSales?.stats.insurance_billed_value, 'Insurance value in the same date and search scope', 'today', 'shield'],
      ['Sales + Insurance', props.financeSales?.stats.sales_with_insurance, 'Combined sales value for the active filters', 'total', 'trend'],
      ['Transactions', props.financeSales?.stats.transaction_count, 'Sales entries included in the current result set', 'pending', 'receipt', true],
    ],
    expenses: [
      ['Today', props.financeExpenses?.stats.today ?? props.financeSummary?.stats.expenses_month, 'Expenses posted today', 'seen', 'alert'],
      ['This Week', props.financeExpenses?.stats.weekly, 'Weekly expense total', 'today', 'finance'],
      ['This Month', props.financeExpenses?.stats.monthly ?? props.financeSummary?.stats.expenses_month, 'Monthly expense pressure', 'pending', 'trend'],
      ['This Year', props.financeExpenses?.stats.yearly, 'Year-to-date spending', 'total', 'money'],
    ],
    debt: [
      ['Collected', props.financePayments?.stats.total_collected, 'Payments received for the active search window', 'seen', 'money'],
      ['Outstanding', props.financePayments?.stats.outstanding_balance, 'Balances still open for recovery', 'pending', 'finance'],
      ['Insurance Pending', props.financePayments?.stats.insurance_pending, 'Claims still awaiting insurer settlement', 'today', 'shield'],
      ['Transactions', props.financePayments?.stats.transaction_count, 'Payment movements in the selected period', 'total', 'receipt', true],
    ],
  }
  const summaryCards = summaryCardsByMode[pageMode] ?? summaryCardsByMode.default

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
      <div className="patients-header">
        <div>
          <p className="eyebrow">{pageHeader.eyebrow}</p>
          <h3>{pageHeader.title}</h3>
          <p className="header-copy">{pageHeader.copy}</p>
        </div>
      </div>

      {props.financeError ? <div className="message-banner error">{props.financeError}</div> : null}
      {props.financeSuccess ? <div className="message-banner success">{props.financeSuccess}</div> : null}

      <section className="stats-grid patient-stats-grid">
        {summaryCards.map(([label, value, note, className, icon]) => (
          <StatWidget
            key={label}
            label={label}
            value={label === 'Transactions'
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

      {activeTab === 'Payments' ? <PaymentsTab {...props} /> : null}
      {activeTab === 'Sales' ? <SalesTab {...props} /> : null}
      {activeTab === 'Expenses' ? <ExpensesTab {...props} /> : null}
    </section>
  )
}

function RevenueTrackingView(props) {
  const salesStats = props.financeSales?.stats ?? {}
  const expenseStats = props.financeExpenses?.stats ?? {}
  const summaryStats = props.financeSummary?.stats ?? {}
  const salesTotal = Number(salesStats.total_sales ?? 0)
  const insuranceValue = Number(salesStats.insurance_billed_value ?? summaryStats.insurance_billed_month ?? 0)
  const combinedRevenue = Number(salesStats.sales_with_insurance ?? salesTotal + insuranceValue)
  const expenseTotal = Number(expenseStats.total ?? 0)
  const grossProfit = combinedRevenue - expenseTotal
  const netCollected = salesTotal - expenseTotal
  const collectionRate = combinedRevenue > 0 ? (salesTotal / combinedRevenue) * 100 : 0
  const grossProfitClassName = grossProfit < 0 ? 'finance-loss' : 'finance-profit'
  const paymentBreakdown = buildPaymentFamilyBreakdown(props.financeSales?.payment_methods ?? [])
  const topExpenseCategories = (props.financeExpenses?.category_breakdown ?? []).slice(0, 5)

  function applyRevenueFilters(event) {
    event.preventDefault()
    props.setFinanceSalesQuery((current) => ({
      ...current,
      ...props.financeSalesFilters,
      page: 1,
    }))
    props.setFinanceExpenseQuery((current) => ({
      ...current,
      filter: 'all',
      start_date: props.financeExpenseFilters.start_date,
      end_date: props.financeExpenseFilters.end_date,
      category: props.financeExpenseFilters.category,
      search: props.financeExpenseFilters.search,
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
        <StatWidget label="Collected Revenue" value={props.isLoadingFinanceSales && !props.financeSales ? '...' : currency.format(salesTotal)} note="Realized sales from cash, MoMo, Paystack, and other posted payments" icon="money" className="seen" />
        <StatWidget label="Insurance Revenue" value={props.isLoadingFinanceSales && !props.financeSales ? '...' : currency.format(insuranceValue)} note="Insured billing value tracked alongside collected sales" icon="shield" className="pending" />
        <StatWidget label="Total Expenses" value={props.isLoadingFinanceExpenses && !props.financeExpenses ? '...' : currency.format(expenseTotal)} note="Expenses in the currently selected expense window" icon="alert" className="today" />
        <StatWidget label="Gross Profit" value={currency.format(grossProfit)} note="Sales plus insurance value minus tracked expenses" icon="trend" className="total" valueClassName={grossProfitClassName} />
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

          <form className="patient-filter-grid" onSubmit={applyRevenueFilters}>
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
            <span className="panel-tag">{props.financeExpenses?.pagination?.total ?? 0} records</span>
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

  function exportSalesCsv() {
    const headers = ['Date', 'Transactions', 'Collected Sales', 'Insurance Value', 'Sales + Insurance', 'Billed Total', 'Consultation', 'Frames', 'Lenses', 'Cases', 'Discount', 'Tax']
    const rows = dailyBreakdown.map((day) => [
      day.sale_date || '',
      Number(day.transaction_count ?? 0),
      Number(day.collected_sales ?? 0).toFixed(2),
      Number(day.insurance_total ?? 0).toFixed(2),
      Number(day.sales_with_insurance ?? 0).toFixed(2),
      Number(day.billed_total ?? 0).toFixed(2),
      Number(day.consultation_total ?? 0).toFixed(2),
      Number(day.frame_total ?? 0).toFixed(2),
      Number(day.lens_total ?? 0).toFixed(2),
      Number(day.case_total ?? 0).toFixed(2),
      Number(day.discount_total ?? 0).toFixed(2),
      Number(day.tax_total ?? 0).toFixed(2),
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
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Sales Filters</p>
              <h3>Search and control the daily sales view</h3>
            </div>
            <span className="panel-tag">{props.financeSales?.branch_name ?? props.financeSummary?.branch_name ?? 'Sales'}</span>
          </div>

          <form className="patient-filter-grid" onSubmit={applySalesFilters}>
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
            <Metric label="Consultation" value={salesStats.consultation_total} />
            <Metric label="Frames" value={salesStats.frame_total} />
            <Metric label="Lenses" value={salesStats.lens_total} />
            <Metric label="Average Sale" value={salesStats.average_sale} />
          </div>
        </article>

        <article className="panel panel-wide">
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
                  <th>Billed Total</th>
                  <th>Consultation</th>
                  <th>Lenses</th>
                  <th>Frames</th>
                  <th>Cases</th>
                  <th>Discount</th>
                  <th>Tax</th>
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
                    <td>{currency.format(Number(day.billed_total ?? 0))}</td>
                    <td>{currency.format(Number(day.consultation_total ?? 0))}</td>
                    <td>{currency.format(Number(day.lens_total ?? 0))}</td>
                    <td>{currency.format(Number(day.frame_total ?? 0))}</td>
                    <td>{currency.format(Number(day.case_total ?? 0))}</td>
                    <td>{currency.format(Number(day.discount_total ?? 0))}</td>
                    <td>{currency.format(Number(day.tax_total ?? 0))}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="12">No daily sales matched the current filters.</td>
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
          <Metric label="Insurance Pending" value={props.financePayments?.stats.insurance_pending} />
        </div>

        <form
          className="patient-filter-grid"
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
          <Metric label="Insurance" value={props.paymentDetail.billing.insurance_claimed} />
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
  const todayBreakdown = props.financeSales?.stats?.today_breakdown ?? {}

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      props.setFinanceSalesQuery((current) => ({ ...current, ...props.financeSalesFilters, page: 1 }))
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [props.financeSalesFilters.date_from, props.financeSalesFilters.date_to, props.financeSalesFilters.payment_method, props.financeSalesFilters.search])

  return (
    <section className="finance-layout">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Sales Overview</p>
            <h3>Live sales ledger</h3>
          </div>
          <span className="panel-tag">{props.financeSales?.branch_name ?? props.financeSummary?.branch_name ?? 'Finance'}</span>
        </div>

        <div className="payment-summary-row">
          <Metric label="Cash Today" value={todayBreakdown.cash} />
          <Metric label="MoMo Today" value={todayBreakdown.mobile_money} />
          <Metric label="Paystack Today" value={todayBreakdown.paystack} />
          <Metric label="Insurance Today" value={todayBreakdown.insurance} />
          <Metric label="Today Total" value={todayBreakdown.grand_total} />
        </div>

        <div className="payment-summary-row">
          <Metric label="Collected Sales" value={props.financeSales?.stats.total_sales} />
          <Metric label="Insurance Value" value={props.financeSales?.stats.insurance_billed_value} />
          <Metric label="Sales + Insurance" value={props.financeSales?.stats.sales_with_insurance} />
          <Metric label="Transactions" value={props.financeSales?.stats.transaction_count} raw />
          <Metric label="Average Sale" value={props.financeSales?.stats.average_sale} />
        </div>

        <form
          className="patient-filter-grid"
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
      </article>

      <article className="panel">
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
  const canManageExpenses = (['manager', 'accountant'].includes(props.session?.role) || props.session?.is_admin) && !props.readOnly
  const canCreateExpenses = (['manager', 'accountant', 'receptionist'].includes(props.session?.role) || props.session?.is_admin) && !props.readOnly
  const isCategoryManager = canManageExpenses
  const isAccountantExpenseView = props.session?.role === 'accountant' && !props.readOnly
  const isReceptionistExpenseView = props.session?.role === 'receptionist' && !props.readOnly
  const isCeoReadOnlyExpenseView = props.session?.role === 'ceo' && props.readOnly
  const usePremiumExpenseLayout = isAccountantExpenseView || isReceptionistExpenseView || isCeoReadOnlyExpenseView
  const [isCreateExpenseModalOpen, setIsCreateExpenseModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [selectedExpense, setSelectedExpense] = useState(null)
  const [expenseModalForm, setExpenseModalForm] = useState({
    description: '',
    amount: '',
    date: '',
    category: '',
  })
  const categoryOptions = props.financeExpenses?.categories ?? []

  function openExpenseModal(expense) {
    setSelectedExpense(expense)
    setExpenseModalForm({
      description: expense.description ?? '',
      amount: expense.amount ?? '',
      date: expense.date ?? '',
      category: expense.category ?? categoryOptions[0] ?? '',
    })
  }

  function closeExpenseModal() {
    setSelectedExpense(null)
    setExpenseModalForm({
      description: '',
      amount: '',
      date: '',
      category: '',
    })
  }

  function openCreateExpenseModal() {
    props.setExpenseForm((current) => ({
      ...current,
      description: '',
      amount: '',
      date: '',
      category: categoryOptions[0] ?? current.category ?? '',
    }))
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
      {props.financeError ? <div className="message-banner error">{props.financeError}</div> : null}
      {props.financeSuccess ? <div className="message-banner success">{props.financeSuccess}</div> : null}

      <section className={`finance-layout-expenses${usePremiumExpenseLayout ? ' finance-layout-expenses-premium' : ''}${canManageExpenses ? ' finance-layout-expenses-editable' : ''}`}>
        {canCreateExpenses ? (
          <div className="expense-page-toolbar">
            <button type="button" className="primary-button expense-add-button" onClick={openCreateExpenseModal}>
              Add Expense
            </button>
          </div>
        ) : null}

        {!isReceptionistExpenseView ? (
          <article className={`panel panel-wide expense-filters-panel${usePremiumExpenseLayout ? ' expense-premium-panel' : ''}`}>
            <div className="panel-heading expense-filter-heading">
              <div className="expense-filter-heading-copy">
                <p className="eyebrow">Search & Filters</p>
                <h3>Find the right expense fast</h3>
                <p className="muted-copy">Search by description, narrow by category, and trim the date range from one tidy filter bar.</p>
              </div>
              <span className="panel-tag">{props.financeExpenses?.pagination?.total ?? 0} records</span>
            </div>

            <form
              className={`expense-page-stack expense-filter-grid-horizontal${usePremiumExpenseLayout ? ' expense-premium-form expense-premium-filter-form' : ''}`}
              onSubmit={(event) => {
                event.preventDefault()
                props.setFinanceExpenseQuery((current) => ({
                  ...current,
                  ...props.financeExpenseFilters,
                  page: 1,
                }))
              }}
            >
              <label>
                Search
                <input
                  value={props.financeExpenseFilters.search}
                  onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Description or note"
                />
              </label>
              <label>
                Category
                <select
                  value={props.financeExpenseFilters.category}
                  onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, category: event.target.value }))}
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                Start date
                <input
                  type="date"
                  value={props.financeExpenseFilters.start_date}
                  onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, start_date: event.target.value }))}
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  value={props.financeExpenseFilters.end_date}
                  onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, end_date: event.target.value }))}
                />
              </label>
              <div className="filter-actions-row full-span">
                <button type="submit" className="primary-button">Apply filters</button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    const defaults = { filter: 'all', start_date: '', end_date: '', category: 'all', search: '', page: 1, per_page: 12 }
                    props.setFinanceExpenseFilters(defaults)
                    props.setFinanceExpenseQuery(defaults)
                  }}
                >
                  Reset
                </button>
              </div>
            </form>
          </article>
        ) : (
          <article className="panel panel-wide expense-filters-panel expense-premium-panel">
            <div className="panel-heading expense-filter-heading">
              <div className="expense-filter-heading-copy">
                <p className="eyebrow">Today Only</p>
                <h3>Expenses recorded today</h3>
                <p className="muted-copy">This receptionist view shows only today&apos;s expense entries without search or filter controls.</p>
              </div>
              <span className="panel-tag">{props.financeExpenses?.pagination?.total ?? 0} records</span>
            </div>
          </article>
        )}

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Expense Ledger</p>
              <h3>Branch expense history</h3>
            </div>
            <span className="panel-tag">{currency.format(Number(props.financeExpenses?.stats.total ?? 0))} total</span>
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
                    onClick={() => openExpenseModal(expense)}
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
                          openExpenseModal(expense)
                        }}
                      >
                        {canManageExpenses ? 'Edit' : 'View'}
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
                total={Number(props.financeExpenses?.stats.total ?? 0)}
                emptyLabel="No expense graph data yet"
                compact
              />
            </div>
          </article>
        ) : null}

        {isCategoryManager ? (
          <article className="panel panel-wide">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Manage Expense Categories</p>
                <h3>Keep category names clean and consistent</h3>
              </div>
              <span className="panel-tag">{props.financeExpenses?.category_records?.length ?? 0} categories</span>
            </div>

            <div className="stack-list">
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
          </article>
        ) : null}
      </section>

      {selectedExpense ? (
        <div className="modal-overlay" onClick={closeExpenseModal}>
          <article className="modal-panel expense-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Expense Record</p>
                <h3>{canManageExpenses ? 'Edit expense entry' : 'Expense details'}</h3>
              </div>
              <div className="filter-actions-row">
                {canManageExpenses ? (
                  <button
                    type="button"
                    className="ghost-button danger-outline"
                    disabled={props.deletingExpenseRecordId === selectedExpense.expense_id}
                    onClick={async () => {
                      if (!window.confirm('Delete this expense record?')) return
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

            <form
              className="patient-form-grid"
              onSubmit={async (event) => {
                event.preventDefault()
                try {
                  await props.updateExpenseRecord(selectedExpense.expense_id, expenseModalForm)
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
                  readOnly={!canManageExpenses}
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
                  readOnly={!canManageExpenses}
                  required
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={expenseModalForm.date}
                  onChange={(event) => setExpenseModalForm((current) => ({ ...current, date: event.target.value }))}
                  readOnly={!canManageExpenses}
                  required
                />
              </label>
              <label className="full-span">
                Category
                <select
                  value={expenseModalForm.category}
                  onChange={(event) => setExpenseModalForm((current) => ({ ...current, category: event.target.value }))}
                  disabled={!canManageExpenses}
                >
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>

              {canManageExpenses ? (
                <div className="filter-actions-row full-span">
                  <button type="submit" className="primary-button" disabled={props.isUpdatingExpenseRecord}>
                    {props.isUpdatingExpenseRecord ? 'Saving changes...' : 'Save changes'}
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
                  onChange={(event) => props.setExpenseForm((current) => ({ ...current, description: event.target.value }))}
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
                  onChange={(event) => props.setExpenseForm((current) => ({ ...current, amount: event.target.value }))}
                  required
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={props.expenseForm.date}
                  onChange={(event) => props.setExpenseForm((current) => ({ ...current, date: event.target.value }))}
                  required
                />
              </label>
              <label className="full-span">
                Category
                <select
                  value={props.expenseForm.category}
                  onChange={(event) => props.setExpenseForm((current) => ({ ...current, category: event.target.value }))}
                  required
                >
                  {!categoryOptions.length ? <option value="">No categories yet</option> : null}
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <div className="filter-actions-row full-span">
                <button type="submit" className="primary-button" disabled={props.isSavingExpense}>
                  {props.isSavingExpense ? 'Saving expense...' : 'Save expense'}
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
            className="patient-filter-grid"
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

function CeoExpenseReviewView(props) {
  const summaryStats = props.financeSummary?.stats ?? {}
  const expenseStats = props.financeExpenses?.stats ?? {}
  const recordedSales = Number(summaryStats.sales_month ?? 0)
  const insuredSales = Number(summaryStats.insurance_billed_month ?? 0)
  const totalBusinessValue = Number(summaryStats.sales_with_insurance_month ?? (recordedSales + insuredSales))
  const monthlyExpenses = Number(expenseStats.monthly ?? summaryStats.expenses_month ?? 0)
  const outstandingBalance = Number(summaryStats.outstanding_balance ?? 0)
  const trendItems = (props.financeExpenses?.trend ?? []).map((item) => ({
    label: item.expense_date,
    value: Number(item.total ?? 0),
  }))
  const categoryItems = (props.financeExpenses?.category_breakdown ?? []).slice(0, 6)

  function applyCeoExpenseFilters(event) {
    event.preventDefault()
    props.setFinanceExpenseQuery((current) => ({
      ...current,
      ...props.financeExpenseFilters,
      page: 1,
    }))
  }

  function resetCeoExpenseFilters() {
    const defaults = { filter: 'all', start_date: '', end_date: '', category: 'all', search: '', page: 1, per_page: 12 }
    props.setFinanceExpenseFilters(defaults)
    props.setFinanceExpenseQuery(defaults)
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

        <form className="ceo-expense-filter-form" onSubmit={applyCeoExpenseFilters}>
          <label>
            Search expense notes
            <input
              value={props.financeExpenseFilters.search}
              onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Description or note"
            />
          </label>
          <label>
            Category
            <select
              value={props.financeExpenseFilters.category}
              onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, category: event.target.value }))}
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
              onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, start_date: event.target.value }))}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={props.financeExpenseFilters.end_date}
              onChange={(event) => props.setFinanceExpenseFilters((current) => ({ ...current, end_date: event.target.value }))}
            />
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
          <span className="panel-tag">{currency.format(Number(props.financeExpenses?.stats.total ?? 0))} total</span>
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
          total={Number(props.financeExpenses?.stats.total ?? 0)}
          emptyLabel="No category breakdown available yet"
        />
      </article>
    </section>
  )
}

function TableShell({ children }) {
  return <div className="table-shell">{children}</div>
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
