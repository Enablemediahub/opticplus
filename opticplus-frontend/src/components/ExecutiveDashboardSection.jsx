import StatWidget from './StatWidget.jsx'
import PortalIcon from './PortalIcon.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const executiveLinks = [
  { title: 'Sales', view: 'Sales', note: 'Review daily collections, receipts, and payment channels.', icon: 'money' },
  { title: 'Revenue Tracking', view: 'Revenue Tracking', note: 'Compare collected revenue, insurance value, and gross profit.', icon: 'trend' },
  { title: 'Expenses', view: 'Expenses', note: 'Inspect operating spend without changing records.', icon: 'alert' },
  { title: 'Insurance Claims', view: 'Insurance Claims', note: 'Monitor insurer exposure, pending claims, and settlements.', icon: 'shield' },
  { title: 'Reports', view: 'Reports', note: 'Read branch and financial reports with export-ready breakdowns.', icon: 'reports' },
]

export default function ExecutiveDashboardSection(props) {
  const stats = [
    ['Sales Today', props.dashboard?.stats?.revenue_today, 'Immediate revenue posted today', 'money', 'seen'],
    ['Expenses Today', props.dashboard?.stats?.expenses_today, 'Operating spend captured today', 'alert', 'pending'],
    ['Insurance Today', props.dashboard?.stats?.insurance_revenue_today, 'Insurance-backed value raised today', 'shield', 'today'],
    ['Outstanding Balance', props.financeSummary?.stats?.outstanding_balance, 'Customer balances still open for recovery', 'finance', 'total'],
  ]

  const financeSnapshot = [
    ['Collected This Month', props.financeSummary?.stats?.sales_month],
    ['Sales + Insurance', props.financeSummary?.stats?.sales_with_insurance_month],
    ['Expenses This Month', props.financeSummary?.stats?.expenses_month],
    ['Insurance Value', props.financeSummary?.stats?.insurance_billed_month],
  ]

  const recentSales = props.dashboard?.payments ?? []
  const recentExpenses = props.financeExpenses?.records?.slice(0, 5) ?? []
  const insuranceClaims = props.insuranceData?.claims?.slice(0, 5) ?? []

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Executive Dashboard</p>
          <h3>Daily company visibility for directors and the CEO</h3>
          <p className="header-copy">
            Review sales, revenue, expenses, insurance exposure, and formal reports from a read-only executive workspace.
          </p>
        </div>
      </div>

      <section className="stats-grid patient-stats-grid dashboard-stats-grid">
        {stats.map(([label, value, note, icon, className]) => (
          <StatWidget
            key={label}
            label={label}
            value={isLoadingExecutive(props) ? '...' : currency.format(Number(value ?? 0))}
            note={note}
            icon={icon}
            className={className}
          />
        ))}
      </section>

      <section className="content-grid manager-dashboard-grid executive-dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Executive Snapshot</p>
              <h3>{props.dashboard?.branch_name ?? props.session?.branch ?? 'Active branch'} financial posture</h3>
            </div>
            <span className="panel-tag">Read only</span>
          </div>

          <div className="manager-overview-grid">
            {financeSnapshot.map(([label, value], index) => (
              <div key={label} className={`manager-metric-card ${executiveTone(index)}`}>
                <span>{label}</span>
                <strong>{isLoadingExecutive(props) ? '...' : currency.format(Number(value ?? 0))}</strong>
                <p className="muted-copy">Executive monitoring only. Editing stays disabled on this desk.</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Internal Messaging</p>
              <h3>Reach any staff member</h3>
            </div>
          </div>

          <div className="stack-list">
            <div className="stack-item">
              <div>
                <strong>Messenger is available across the portal</strong>
                <span>Use the message bubble to search staff, open a thread, and send internal instructions instantly.</span>
              </div>
              <div className="stack-meta">
                <strong>All staff</strong>
                <span>CEO and directors can message any user</span>
              </div>
            </div>
            <div className="stack-item">
              <div>
                <strong>Executive workflow tip</strong>
                <span>Open the chat after reviewing sales or reports to follow up with the accountant, manager, or reception desk.</span>
              </div>
              <div className="stack-meta">
                <strong>Fast follow-up</strong>
                <span>No page switching required</span>
              </div>
            </div>
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Quick Navigation</p>
              <h3>Executive finance surfaces</h3>
            </div>
            <span className="panel-tag">{executiveLinks.length} pages</span>
          </div>

          <div className="module-grid">
            {executiveLinks.map((item) => (
              <button key={item.view} type="button" className="module-card manager-link-card" onClick={() => props.setActiveView(item.view)}>
                <div className="module-card-icon">
                  <PortalIcon name={item.icon} className="module-icon" />
                </div>
                <strong>{item.title}</strong>
                <p>{item.note}</p>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent Sales</p>
              <h3>Latest payment activity</h3>
            </div>
          </div>

          <div className="stack-list">
            {recentSales.length ? recentSales.map((payment) => (
              <div key={payment.id} className="stack-item">
                <div>
                  <strong>{payment.patient}</strong>
                  <span>{payment.receipt_number || 'No receipt number'}</span>
                </div>
                <div className="stack-meta">
                  <strong>{currency.format(Number(payment.amount ?? 0))}</strong>
                  <span>{payment.status}</span>
                </div>
              </div>
            )) : <p className="muted-copy">No recent sales records are available yet.</p>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent Expenses</p>
              <h3>Latest spending entries</h3>
            </div>
          </div>

          <div className="stack-list">
            {recentExpenses.length ? recentExpenses.map((expense) => (
              <div key={expense.expense_id} className="stack-item">
                <div>
                  <strong>{expense.description}</strong>
                  <span>{expense.category || 'Uncategorized'}</span>
                </div>
                <div className="stack-meta">
                  <strong>{currency.format(Number(expense.amount ?? 0))}</strong>
                  <span>{expense.date || 'Unknown date'}</span>
                </div>
              </div>
            )) : <p className="muted-copy">No expense entries are available for the current scope yet.</p>}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Insurance Watch</p>
              <h3>Pending and paid claims in view</h3>
            </div>
            <span className="panel-tag">{props.insuranceData?.pagination?.total ?? 0} claims</span>
          </div>

          <div className="table-shell">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Provider</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {insuranceClaims.map((claim) => (
                  <tr key={claim.id}>
                    <td>{claim.name || claim.folder_id || 'Unknown patient'}</td>
                    <td>{claim.insurance_provider || 'N/A'}</td>
                    <td>{currency.format(Number(claim.amount_paid ?? 0))}</td>
                    <td>{claim.date || 'N/A'}</td>
                    <td>{claim.status || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!insuranceClaims.length ? <p className="muted-copy">No insurance claims are available in the current scope.</p> : null}
          </div>
        </article>
      </section>
    </section>
  )
}

function isLoadingExecutive(props) {
  return props.isLoadingDashboard || props.isLoadingFinanceSummary || props.isLoadingFinanceSales || props.isLoadingFinanceExpenses || props.isLoadingInsuranceData
}

function executiveTone(index) {
  return ['tone-info', 'tone-success', 'tone-danger', 'tone-warning'][index] ?? 'tone-info'
}
