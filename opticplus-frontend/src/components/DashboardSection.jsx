import StatWidget from './StatWidget.jsx'

export default function DashboardSection({ dashboard, stats, isLoadingDashboard, currency, onPatientIntakeClick, hideFinanceSnapshot = false }) {
  if (isLoadingDashboard && !dashboard) {
    return (
      <section className="stats-grid dashboard-stats-grid">
        <StatWidget
          label="Loading"
          value="Fetching live branch data..."
          note="Pulling the latest branch metrics into the dashboard."
          icon="dashboard"
        />
      </section>
    )
  }

  if (!dashboard) return null

  return (
    <>
      {typeof onPatientIntakeClick === 'function' ? (
        <section className="dashboard-intake-cta panel">
          <div className="dashboard-intake-cta-copy">
            <p className="eyebrow">Front desk</p>
            <h3>Register a new patient</h3>
            <p className="header-copy muted-copy">Opens registration immediately without leaving the dashboard.</p>
          </div>
          <button type="button" className="primary-button" onClick={onPatientIntakeClick}>
            Patient Intake
          </button>
        </section>
      ) : null}

      <section className="stats-grid dashboard-stats-grid">
        {stats.map((stat) => (
          <StatWidget
            key={stat.label}
            label={stat.label}
            value={stat.value}
            note={stat.note}
            icon={dashboardIconFor(stat.label)}
          />
        ))}
      </section>

      <section className="content-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Live Queue</p>
              <h3>Appointments</h3>
            </div>
            <span className="panel-tag">{dashboard.branch_name}</span>
          </div>

          <div className="table-list">
            {dashboard.appointments.map((appointment) => (
              <div key={appointment.id} className="table-row">
                <div>
                  <strong>{appointment.patient}</strong>
                  <span>{appointment.optometrist || 'Unassigned'}</span>
                </div>
                <span>
                  {appointment.appointment_date} {appointment.appointment_time}
                </span>
                <span className={`status-pill status-${String(appointment.status).toLowerCase().replaceAll(' ', '-')}`}>
                  {appointment.status}
                </span>
              </div>
            ))}
          </div>
        </article>

        {!hideFinanceSnapshot ? (
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Cashflow</p>
                <h3>Finance snapshot</h3>
              </div>
            </div>

            <div className="finance-grid">
              <div>
                <span>Bank balance</span>
                <strong>{currency.format(Number(dashboard.finance.bank_balance ?? 0))}</strong>
              </div>
              <div>
                <span>Deposits today</span>
                <strong>{currency.format(Number(dashboard.finance.deposits_today ?? 0))}</strong>
              </div>
              <div>
                <span>Last updated</span>
                <strong>{dashboard.finance.last_updated ?? 'N/A'}</strong>
              </div>
            </div>
          </article>
        ) : null}

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Collections</p>
              <h3>Recent billing</h3>
            </div>
          </div>

          <div className="stack-list">
            {dashboard.payments.map((payment) => (
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
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Collections Mix</p>
              <h3>Today's payment channels</h3>
            </div>
          </div>

          <div className="stack-list">
            {[
              ['Cash', dashboard.finance?.payment_mix_today?.cash_paid, 'Cash collections logged today'],
              ['Mobile Money', dashboard.finance?.payment_mix_today?.mobile_paid, 'MoMo collections logged today'],
              ['Paystack', dashboard.finance?.payment_mix_today?.paystack_paid, 'Paystack collections logged today'],
              ['Insurance', dashboard.finance?.payment_mix_today?.insurance_paid, 'Insurance-paid sales captured today'],
            ].map(([label, amount, note]) => (
              <div key={label} className="stack-item">
                <div>
                  <strong>{label}</strong>
                  <span>{note}</span>
                </div>
                <div className="stack-meta">
                  <strong>{currency.format(Number(amount ?? 0))}</strong>
                  <span>Today</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  )
}

function dashboardIconFor(label) {
  if (label.toLowerCase().includes('appointment')) return 'calendar'
  if (label.toLowerCase().includes('revenue') || label.toLowerCase().includes('sales')) return 'money'
  if (label.toLowerCase().includes('expense')) return 'alert'
  if (label.toLowerCase().includes('insurance')) return 'shield'
  if (label.toLowerCase().includes('patient')) return 'patients'
  if (label.toLowerCase().includes('attendance') || label.toLowerCase().includes('staff')) return 'clock'
  return 'dashboard'
}
