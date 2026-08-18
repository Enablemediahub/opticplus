import PortalIcon from './PortalIcon.jsx'
import StatWidget from './StatWidget.jsx'

export default function TechnicianDashboardSection({
  dashboard,
  lensOrdersData,
  isLoadingDashboard,
  isLoadingLensOrders,
  setActiveView,
}) {
  if (isLoadingDashboard && !dashboard) {
    return (
      <section className="stats-grid dashboard-stats-grid">
        <StatWidget
          label="Loading"
          value="Preparing technician workspace..."
          note="Pulling the live branch queue and lens order data."
          icon="glasses"
        />
      </section>
    )
  }

  const stats = [
    {
      label: "Today's Appointments",
      value: dashboard?.stats?.appointments_today ?? 0,
      note: 'Scheduled for the active branch',
      icon: 'calendar',
      className: 'today',
    },
    {
      label: 'Patients Today',
      value: dashboard?.stats?.patients_today ?? 0,
      note: 'Branch visits logged today',
      icon: 'patients',
      className: 'seen',
    },
    {
      label: 'Lens Orders Ready',
      value: lensOrdersData?.summary?.ready_orders ?? dashboard?.stats?.completed_prescriptions ?? 0,
      note: 'Ready for factory production or fitting',
      icon: 'check-badge',
      className: 'total',
    },
    {
      label: 'Waiting Orders',
      value: lensOrdersData?.summary?.pending_orders ?? 0,
      note: 'Orders still pending review or completion',
      icon: 'alert',
      className: 'pending',
    },
  ]

  const weeklyAppointments = dashboard?.weekly_appointments ?? []
  const upcomingAppointments = dashboard?.appointments ?? []
  const readyOrders = (lensOrdersData?.orders ?? []).filter((order) => order.ready_for_order).slice(0, 6)

  return (
    <section className="patients-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Technician Dashboard</p>
          <h3>Clinical order tracking without finance clutter</h3>
          <p className="header-copy">
            Focused on patient flow, lens orders, and production readiness for the active branch.
          </p>
        </div>
      </div>

      <section className="stats-grid patient-stats-grid">
        {stats.map((stat) => (
          <StatWidget
            key={stat.label}
            label={stat.label}
            value={stat.value}
            note={stat.note}
            icon={stat.icon}
            className={stat.className}
          />
        ))}
      </section>

      <section className="content-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Weekly Rhythm</p>
              <h3>Schedule and queue overview</h3>
            </div>
            <span className="panel-tag">{dashboard?.branch_name ?? 'Branch'}</span>
          </div>

          <div className="module-grid">
            {weeklyAppointments.map((entry) => (
              <article key={entry.label} className="module-card compact">
                <div className="module-card-icon">
                  <PortalIcon name="calendar" className="module-icon" />
                </div>
                <strong>{entry.count}</strong>
                <p>{entry.label}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Quick Actions</p>
              <h3>Technician shortcuts</h3>
            </div>
          </div>

          <div className="optometrist-quick-actions-grid">
            <button type="button" className="module-card optometrist-action-card" onClick={() => setActiveView('Lens Tracker')}>
              <div className="module-card-icon">
                <PortalIcon name="glasses" className="module-icon" />
              </div>
              <strong>Lens Tracker</strong>
              <p>Review tracked lens costs and prescription context.</p>
            </button>

            <button type="button" className="module-card optometrist-action-card" onClick={() => setActiveView('Lens Orders')}>
              <div className="module-card-icon">
                <PortalIcon name="receipt" className="module-icon" />
              </div>
              <strong>Lens Orders</strong>
              <p>Prepare the factory order pack for the current branch.</p>
            </button>

            <button type="button" className="module-card optometrist-action-card" onClick={() => setActiveView('Notes')}>
              <div className="module-card-icon">
                <PortalIcon name="message" className="module-icon" />
              </div>
              <strong>Notes</strong>
              <p>Open technician notes and reminders.</p>
            </button>
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Ready Orders</p>
              <h3>Lens jobs ready to send or fit</h3>
            </div>
            <span className="panel-tag">
              {isLoadingLensOrders ? 'Refreshing...' : `${readyOrders.length} ready`}
            </span>
          </div>

          {readyOrders.length === 0 ? (
            <p className="muted-copy">No ready orders yet for this branch.</p>
          ) : (
            <div className="stack-list">
              {readyOrders.map((order) => (
                <div key={String(order.prescription_id ?? `${order.folder_id}-${order.order_date}`)} className="stack-item">
                  <div>
                    <strong>{order.patient_name || 'Unknown patient'}</strong>
                    <span>{order.folder_id} | Staff ID {order.assigned_optometrist_id ?? 'N/A'}</span>
                  </div>
                  <div className="stack-meta">
                    <strong>{order.lens_type || 'Lens pending'}</strong>
                    <span>{order.assigned_optometrist_name || 'Unassigned'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Upcoming Appointments</p>
              <h3>Next patients on the schedule</h3>
            </div>
            <span className="panel-tag">{upcomingAppointments.length} listed</span>
          </div>

          {upcomingAppointments.length === 0 ? (
            <p className="muted-copy">No upcoming appointments are currently available.</p>
          ) : (
            <div className="stack-list">
              {upcomingAppointments.map((appointment) => (
                <div key={appointment.id} className="stack-item">
                  <div>
                    <strong>{appointment.patient}</strong>
                    <span>{appointment.appointment_date} {appointment.appointment_time}</span>
                  </div>
                  <div className="stack-meta">
                    <strong>{appointment.optometrist || 'Unassigned'}</strong>
                    <span>{appointment.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </section>
  )
}
