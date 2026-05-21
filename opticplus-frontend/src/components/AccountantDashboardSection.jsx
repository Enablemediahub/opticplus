import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'
import PortalIcon from './PortalIcon.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const quickLinks = [
  { title: 'Billing', view: 'Billing', note: 'Review invoices, balances, and receipts.', icon: 'receipt' },
  { title: 'Revenue Tracking', view: 'Revenue Tracking', note: 'Inspect realized revenue and insured value.', icon: 'finance' },
  { title: 'Expenses', view: 'Expenses', note: 'Track spend and post new expense entries.', icon: 'alert' },
  { title: 'Insurance Claims', view: 'Insurance Claims', note: 'Follow pending insurer recoveries.', icon: 'shield' },
  { title: 'Debt Management', view: 'Debt Management', note: 'Monitor outstanding balances due.', icon: 'money' },
  { title: 'Extract', view: 'Extract', note: 'Prepare finance records for export workflows.', icon: 'reports' },
]

export default function AccountantDashboardSection({ token, selectedBranchId, apiFetch, setActiveView }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setIsLoading(true)
      setError('')

      try {
        const branch = `branch_id=${selectedBranchId}`
        const [summary, sales, expenses, payments] = await Promise.all([
          apiFetch(`/finance/summary?${branch}`, { token }),
          apiFetch(`/finance/sales?${branch}&page=1&per_page=5`, { token }),
          apiFetch(`/finance/expenses?${branch}&page=1&per_page=5&filter=monthly`, { token }),
          apiFetch(`/finance/payments?${branch}&page=1&per_page=5&receipt_page=1&receipt_per_page=6`, { token }),
        ])

        if (!cancelled) {
          setData({ summary, sales, expenses, payments })
        }
      } catch (nextError) {
        if (!cancelled) setError(nextError.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadDashboard()
    return () => {
      cancelled = true
    }
  }, [apiFetch, selectedBranchId, token])

  const stats = [
    ['Revenue Today', currency.format(Number(data?.summary?.stats.sales_today ?? 0)), 'Posted collections captured today', 'money', 'seen'],
    ['Expenses This Month', currency.format(Number(data?.summary?.stats.expenses_month ?? 0)), 'Operating spend since month start', 'alert', 'pending'],
    ['Net This Month', currency.format(Number(data?.summary?.stats.net_month ?? 0)), 'Collected sales minus expenses', 'trend', 'total'],
    ['Outstanding Balance', currency.format(Number(data?.summary?.stats.outstanding_balance ?? 0)), 'Open balances awaiting recovery', 'receipt', 'today'],
  ]

  const paymentMethods = data?.summary?.payment_methods ?? []
  const totalPaymentMethods = paymentMethods.reduce((sum, item) => sum + Number(item.total ?? 0), 0)
  const topExpenses = (data?.expenses?.category_breakdown ?? data?.summary?.top_expense_categories ?? []).slice(0, 5)
  const recentTransactions = data?.payments?.transactions ?? []
  const outstandingRecords = (data?.payments?.outstanding_records ?? []).slice(0, 5)
  const monthLabel = useMemo(() => new Date().toLocaleDateString([], { month: 'long', year: 'numeric' }), [])
  const calendar = useMemo(() => buildCalendar(new Date()), [])

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Accountant Dashboard</p>
          <h3>Financial control center with the same grouped workflow as the legacy portal</h3>
          <p className="header-copy">
            Move between billing, revenue, expenses, claims, and debt recovery from one focused accounting workspace.
          </p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}

      <section className="stats-grid patient-stats-grid">
        {stats.map(([label, value, note, icon, className]) => (
          <StatWidget key={label} label={label} value={isLoading && !data ? '...' : value} note={note} icon={icon} className={className} />
        ))}
      </section>

      <section className="content-grid accountant-dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Monthly Summary</p>
              <h3>{data?.summary?.branch_name ?? 'Active branch'} finance picture</h3>
            </div>
            <span className="panel-tag">{monthLabel}</span>
          </div>

          <div className="accountant-summary-grid">
            <MetricCard
              label="Collected Sales"
              value={currency.format(Number(data?.summary?.stats.sales_month ?? 0))}
              subtext={`${Number(data?.sales?.stats.transaction_count ?? 0)} posted sales transactions`}
              tone="success"
            />
            <MetricCard
              label="Insurance Value"
              value={currency.format(Number(data?.summary?.stats.insurance_billed_month ?? 0))}
              subtext={`${Number(data?.sales?.stats.insurance_bill_count ?? 0)} insured billings`}
              tone="info"
            />
            <MetricCard
              label="Claims Pending"
              value={currency.format(Number(data?.summary?.stats.insurance_pending ?? 0))}
              subtext="Awaiting insurer settlement"
              tone="warning"
            />
            <MetricCard
              label="Average Sale"
              value={currency.format(Number(data?.sales?.stats.average_sale ?? 0))}
              subtext="Based on the current sales window"
              tone="danger"
            />
          </div>

          <div className="accountant-method-list">
            {paymentMethods.length ? paymentMethods.map((method) => {
              const total = Number(method.total ?? 0)
              const width = totalPaymentMethods > 0 ? `${Math.max((total / totalPaymentMethods) * 100, 8)}%` : '8%'

              return (
                <div key={method.payment_method} className="accountant-method-row">
                  <div>
                    <strong>{method.payment_method}</strong>
                    <span>{currency.format(total)}</span>
                  </div>
                  <div className="chart-track">
                    <span style={{ width }} />
                  </div>
                </div>
              )
            }) : (
              <p className="muted-copy">No payment activity is available yet for this period.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent Transactions</p>
              <h3>Collections log</h3>
            </div>
          </div>

          <div className="stack-list">
            {recentTransactions.length ? recentTransactions.map((entry) => (
              <div key={`${entry.id}-${entry.created_at ?? entry.date}`} className="stack-item">
                <div>
                  <strong>{entry.name || entry.description || 'Transaction entry'}</strong>
                  <span>{entry.receipt_number || entry.folder_id || formatDate(entry.date)}</span>
                </div>
                <div className="stack-meta">
                  <strong>{currency.format(Number(entry.amount_paid ?? 0))}</strong>
                  <span>{entry.payment_method || 'Payment'}</span>
                </div>
              </div>
            )) : (
              <p className="muted-copy">No recent transactions found.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Expense Categories</p>
              <h3>Highest cost buckets</h3>
            </div>
          </div>

          <div className="stack-list">
            {topExpenses.length ? topExpenses.map((entry) => (
              <div key={entry.category || 'uncategorized'} className="stack-item">
                <div>
                  <strong>{entry.category || 'Uncategorized'}</strong>
                  <span>Recent 3-month total</span>
                </div>
                <div className="stack-meta">
                  <strong>{currency.format(Number(entry.total ?? 0))}</strong>
                </div>
              </div>
            )) : (
              <p className="muted-copy">No expense breakdown is available yet.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Outstanding Bills</p>
              <h3>Follow-up queue</h3>
            </div>
          </div>

          <div className="stack-list">
            {outstandingRecords.length ? outstandingRecords.map((record) => (
              <div key={record.id} className="stack-item">
                <div>
                  <strong>{record.name}</strong>
                  <span>{record.receipt_number || record.folder_id || 'Pending receipt'}</span>
                </div>
                <div className="stack-meta">
                  <strong>{currency.format(Number(record.outstanding_balance ?? record.balance ?? 0))}</strong>
                  <span>{record.status || 'Pending'}</span>
                </div>
              </div>
            )) : (
              <p className="muted-copy">No outstanding billing records in the current window.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Calendar</p>
              <h3>{monthLabel}</h3>
            </div>
          </div>

          <div className="accountant-calendar">
            {calendar.weekdays.map((day) => (
              <span key={day} className="accountant-calendar-heading">{day}</span>
            ))}
            {calendar.days.map((day, index) => (
              <div
                key={`${day.value ?? 'blank'}-${index}`}
                className={day.isToday ? 'accountant-calendar-day is-today' : day.value ? 'accountant-calendar-day' : 'accountant-calendar-day is-blank'}
              >
                {day.value ?? ''}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="module-section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Quick Navigation</p>
            <h3>Accounting modules</h3>
          </div>
        </div>

        <div className="module-grid">
          {quickLinks.map((item) => (
            <button key={item.title} type="button" className="module-card manager-link-card" onClick={() => setActiveView(item.view)}>
              <div className="module-card-icon">
                <PortalIcon name={item.icon} className="module-icon" />
              </div>
              <strong>{item.title}</strong>
              <p>{item.note}</p>
            </button>
          ))}
        </div>
      </section>
    </section>
  )
}

function MetricCard({ label, value, subtext = '', tone = 'info' }) {
  return (
    <div className={`manager-metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {subtext ? <p className="muted-copy">{subtext}</p> : null}
    </div>
  )
}

function formatDate(value) {
  if (!value) return 'No date'
  return new Date(value).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

function buildCalendar(baseDate) {
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const totalDays = new Date(year, month + 1, 0).getDate()
  const leadingBlanks = firstDay.getDay()
  const today = new Date()

  const days = Array.from({ length: leadingBlanks }, () => ({ value: null, isToday: false }))

  for (let day = 1; day <= totalDays; day += 1) {
    const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
    days.push({ value: day, isToday })
  }

  while (days.length % 7 !== 0) {
    days.push({ value: null, isToday: false })
  }

  return {
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    days,
  }
}
