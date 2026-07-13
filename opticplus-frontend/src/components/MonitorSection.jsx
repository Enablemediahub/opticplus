import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const branchOptions = [
  { id: 0, name: 'Merged' },
  { id: 1, name: 'Labadi' },
  { id: 2, name: 'Madina' },
]

const defaultFilters = () => ({
  period: 'monthly',
  date_from: '',
  date_to: '',
  branch_id: '1',
})

export default function MonitorSection({ apiFetch, token, selectedBranchId, session }) {
  const [filters, setFilters] = useState(() => ({
    ...defaultFilters(),
    branch_id: String(selectedBranchId ?? 1),
  }))
  const [query, setQuery] = useState(() => ({
    ...defaultFilters(),
    branch_id: String(selectedBranchId ?? 1),
  }))
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setFilters((current) => ({ ...current, branch_id: String(selectedBranchId ?? 1) }))
    setQuery((current) => ({ ...current, branch_id: String(selectedBranchId ?? 1) }))
  }, [selectedBranchId])

  useEffect(() => {
    let cancelled = false

    async function loadMonitor() {
      if (!token || session?.role !== 'manager') return
      setIsLoading(true)
      setError('')
      try {
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(query)) {
          if (value === '' || value == null) continue
          params.set(key, String(value))
        }
        const response = await apiFetch(`/finance/monitor?${params.toString()}`, { token })
        if (!cancelled) setData(response)
      } catch (requestError) {
        if (!cancelled) setError(requestError.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadMonitor()
    return () => {
      cancelled = true
    }
  }, [apiFetch, query, session?.role, token])

  const stats = data?.stats ?? {}
  const collections = data?.collections ?? {}
  const netTone = Number(stats.cash_position ?? 0) < 0 ? 'pending' : 'total'
  const lensMargin = Number(stats.lens_revenue ?? 0) > 0
    ? (Number(stats.lens_profit ?? 0) / Number(stats.lens_revenue ?? 0)) * 100
    : 0
  const frameMargin = Number(stats.frame_revenue ?? 0) > 0
    ? (Number(stats.frame_profit ?? 0) / Number(stats.frame_revenue ?? 0)) * 100
    : 0

  const collectionRows = useMemo(() => ([
    ['Cash', collections.cash],
    ['MoMo', collections.mobile_money],
    ['Paystack', collections.paystack],
    ['Bank Transfer', collections.bank_transfer],
    ['Insurance Paid', collections.insurance_paid],
    ['Insurance Claimed', collections.insurance_claimed],
    ['Insurance Pending', collections.insurance_pending],
    ['Other', collections.other],
  ]), [collections])

  function applyFilters(event) {
    event.preventDefault()
    setQuery({ ...filters })
  }

  function resetFilters() {
    const defaults = { ...defaultFilters(), branch_id: String(selectedBranchId ?? 1) }
    setFilters(defaults)
    setQuery(defaults)
  }

  if (session?.role !== 'manager') {
    return (
      <section className="finance-section">
        <div className="message-banner error">Only the General Manager can access The Monitor.</div>
      </section>
    )
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">The Monitor</p>
          <h3>General Manager finance control room</h3>
          <p className="header-copy">Track sales, consultation fees, lens and frame profit, spending pressure, and cash position across the selected scope.</p>
        </div>
        <span className="panel-tag">{data?.filters?.label ?? 'This Month'} | {data?.branch_name ?? 'Branch'}</span>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}

      <article className="panel panel-wide expense-filters-panel">
        <div className="panel-heading expense-filter-heading">
          <div className="expense-filter-heading-copy">
            <p className="eyebrow">Monitor Filters</p>
            <h3>Choose the exact accountability window</h3>
            <p className="muted-copy">Every widget, collection figure, expense total, and table row below responds to this scope.</p>
          </div>
          <span className="panel-tag">{isLoading ? 'Refreshing...' : `${data?.filters?.date_from ?? ''} - ${data?.filters?.date_to ?? ''}`}</span>
        </div>

        <form className="expense-page-stack expense-filter-grid-horizontal" onSubmit={applyFilters}>
          <label>
            Branch
            <select value={filters.branch_id} onChange={(event) => setFilters((current) => ({ ...current, branch_id: event.target.value }))}>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          <label>
            Period
            <select value={filters.period} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value }))}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            From
            <input type="date" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, period: 'custom', date_from: event.target.value }))} />
          </label>
          <label>
            To
            <input type="date" value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, period: 'custom', date_to: event.target.value }))} />
          </label>
          <div className="filter-actions-row full-span">
            <button type="submit" className="primary-button">Apply monitor</button>
            <button type="button" className="ghost-button" onClick={resetFilters}>Reset</button>
          </div>
        </form>
      </article>

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Company Cash Position" value={isLoading && !data ? '...' : currency.format(Number(stats.cash_position ?? 0))} note="Cash, MoMo, digital, bank, and paid insurance less expenses" icon="money" className={netTone} />
        <StatWidget label="Gross Profit Watch" value={currency.format(Number(stats.gross_profit ?? 0))} note="Lens profit plus frame surplus plus consultation fees" icon="trend" className="total" />
        <StatWidget label="Total Spending" value={currency.format(Number(stats.total_expenses ?? 0))} note="All expenses posted in this filter window" icon="alert" className="pending" />
        <StatWidget label="Consultation Fees" value={currency.format(Number(stats.consultation_revenue ?? 0))} note="Revenue made from consultation fees alone" icon="receipt" className="seen" />
      </section>

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Lenses Sold" value={Number(stats.lens_count ?? 0)} note={`${currency.format(Number(stats.lens_revenue ?? 0))} lens revenue`} icon="glasses" className="seen" count />
        <StatWidget label="Lens Profit" value={currency.format(Number(stats.lens_profit ?? 0))} note={`${currency.format(Number(stats.lens_cost ?? 0))} spent on lens cost | ${lensMargin.toFixed(1)}% margin`} icon="trend" className={Number(stats.lens_profit ?? 0) < 0 ? 'pending' : 'total'} />
        <StatWidget label="Frames Sold" value={Number(stats.frame_count ?? 0)} note={`${currency.format(Number(stats.frame_revenue ?? 0))} frame revenue`} icon="inventory" className="today" count />
        <StatWidget label="Frame Profit" value={currency.format(Number(stats.frame_profit ?? 0))} note={`BSMI surplus-based margin | ${frameMargin.toFixed(1)}%`} icon="finance" className="total" />
      </section>

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Collected Revenue" value={currency.format(Number(stats.collected_revenue ?? 0))} note="Actual receipts inside the filter" icon="money" className="seen" />
        <StatWidget label="Insurance Expected" value={currency.format(Number(stats.insurance_expected ?? 0))} note="Claimed plus pending insurance still being watched" icon="shield" className="pending" />
        <StatWidget label="Outstanding Balance" value={currency.format(Number(stats.outstanding_balance ?? 0))} note="Customer balances on bills in this scope" icon="receipt" className="today" />
        <StatWidget label="Bills Monitored" value={Number(stats.bill_count ?? 0)} note="Billing records inside the selected window" icon="reports" className="total" count />
      </section>

      <section className="finance-layout">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Collection Mix</p>
              <h3>Money expected and received</h3>
            </div>
            <span className="panel-tag">{currency.format(Number(stats.collected_revenue ?? 0))} collected</span>
          </div>
          <div className="stack-list">
            {collectionRows.map(([label, value]) => (
              <div key={label} className="stack-item">
                <div>
                  <strong>{label}</strong>
                  <span>{label.includes('Pending') || label.includes('Claimed') ? 'Expected but not yet company cash' : 'Counted inside available company cash'}</span>
                </div>
                <strong>{currency.format(Number(value ?? 0))}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Expense Pressure</p>
              <h3>Where money went</h3>
            </div>
            <span className="panel-tag">{currency.format(Number(stats.total_expenses ?? 0))}</span>
          </div>
          <div className="stack-list">
            {(data?.expense_breakdown ?? []).map((item) => (
              <div key={item.category || 'Expense'} className="stack-item">
                <div>
                  <strong>{item.category || 'Uncategorized'}</strong>
                  <span>{item.category === 'Lens' ? 'Auto-synced from Lens Tracker' : 'Posted expense category'}</span>
                </div>
                <strong>{currency.format(Number(item.total ?? 0))}</strong>
              </div>
            ))}
            {(data?.expense_breakdown ?? []).length === 0 ? <p className="muted-copy">No expenses in this scope.</p> : null}
          </div>
        </article>
      </section>

      <article className="panel panel-wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Daily Trail</p>
            <h3>Revenue, spending, and net movement</h3>
          </div>
          <span className="panel-tag">{data?.daily_rows?.length ?? 0} days</span>
        </div>
        <div className="table-shell">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Consultation</th>
                <th>Lens Sales</th>
                <th>Frame Sales</th>
                <th>Collected</th>
                <th>Insurance Expected</th>
                <th>Expenses</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {(data?.daily_rows ?? []).map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{currency.format(Number(row.consultation_total ?? 0))}</td>
                  <td>{currency.format(Number(row.lens_total ?? 0))}</td>
                  <td>{currency.format(Number(row.frame_total ?? 0))}</td>
                  <td>{currency.format(Number(row.collected_total ?? 0))}</td>
                  <td>{currency.format(Number(row.insurance_expected ?? 0))}</td>
                  <td>{currency.format(Number(row.expense_total ?? 0))}</td>
                  <td>{currency.format(Number(row.net_position ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}
