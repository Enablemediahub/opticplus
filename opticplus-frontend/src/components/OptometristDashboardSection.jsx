import PortalIcon from './PortalIcon.jsx'
import StatWidget from './StatWidget.jsx'

export default function OptometristDashboardSection({
  dashboard,
  patientData,
  isLoadingDashboard,
  isLoadingPatients,
  rowBusyId,
  markAsSeen,
  setActiveView,
  currency,
}) {
  if (isLoadingDashboard && !dashboard) {
    return (
      <section className="stats-grid">
        <StatWidget
          label="Loading"
          value="Preparing optometrist workspace..."
          note="Pulling today’s appointments, queue data, and clinical shortcuts."
          icon="glasses"
        />
      </section>
    )
  }

  const stats = [
    {
      label: "Today's Appointments",
      value: dashboard?.stats?.appointments_today ?? 0,
      note: 'Scheduled for the branch today',
      icon: 'calendar',
      className: 'today',
    },
    {
      label: 'Pending Patients',
      value: patientData?.stats?.pending_count ?? (isLoadingPatients ? '...' : 0),
      note: 'Waiting in the review queue',
      icon: 'alert',
      className: 'pending',
    },
    {
      label: 'Patients Seen',
      value: patientData?.stats?.seen_count ?? (isLoadingPatients ? '...' : 0),
      note: 'Completed consultations in filtered records',
      icon: 'patients',
      className: 'seen',
    },
    {
      label: 'Completed Prescriptions',
      value: dashboard?.stats?.completed_prescriptions ?? 0,
      note: 'Glasses prescriptions marked completed',
      icon: 'glasses',
      className: 'total',
    },
  ]

  const pendingRecords = (patientData?.records ?? []).filter((record) => record.status === 'pending')
  const appointments = dashboard?.appointments ?? []
  const weeklyAppointments = dashboard?.weekly_appointments ?? []

  return (
    <section className="patients-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Optometrist Dashboard</p>
          <h3>Appointments, patient review, and clinical follow-up in one workspace</h3>
          <p className="header-copy">
            Built to match the optometrist dashboard flow from the legacy PHP panel: today’s schedule, pending patients, exam entry points, and prescription visibility.
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
              <p className="eyebrow">Weekly Appointments</p>
              <h3>Schedule rhythm for this week</h3>
            </div>
            <span className="panel-tag">{dashboard?.branch_name ?? 'Branch schedule'}</span>
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
              <h3>Clinical shortcuts</h3>
            </div>
          </div>

          <div className="optometrist-quick-actions-grid">
            <button type="button" className="module-card optometrist-action-card" onClick={() => setActiveView('Patient Management')}>
              <div className="module-card-icon">
                <PortalIcon name="patients" className="module-icon" />
              </div>
              <strong>Patient Management</strong>
              <p>Open the queue and manage pending records.</p>
            </button>

            <button type="button" className="module-card optometrist-action-card" onClick={() => setActiveView('Appointments')}>
              <div className="module-card-icon">
                <PortalIcon name="calendar" className="module-icon" />
              </div>
              <strong>Appointments</strong>
              <p>Review today’s and upcoming bookings.</p>
            </button>

            <button type="button" className="module-card optometrist-action-card" onClick={() => setActiveView('Patient Form')}>
              <div className="module-card-icon">
                <PortalIcon name="glasses" className="module-icon" />
              </div>
              <strong>Patient Form</strong>
              <p>Jump straight into examination-ready records.</p>
            </button>
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Patients Pending Review</p>
              <h3>Patients waiting to be seen</h3>
            </div>
            <span className="panel-tag">{patientData?.stats?.pending_count ?? 0} pending</span>
          </div>

          {isLoadingPatients && !patientData ? <p className="muted-copy">Loading pending patients...</p> : null}

          {pendingRecords.length === 0 ? (
            <p className="muted-copy">No patients are currently pending review.</p>
          ) : (
            <div className="patient-records">
              {pendingRecords.map((record) => (
                <article key={record.id} className="patient-record today-pending">
                  <div className="patient-record-top">
                    <div>
                      <strong>{record.patient_name || record.name}</strong>
                      <span>{record.folder_id}</span>
                    </div>
                    <span className="status-pill status-pending">{record.status}</span>
                  </div>

                  <div className="patient-record-meta">
                    <span>Sex: {record.sex || 'N/A'}</span>
                    <span>DOB: {record.dob || 'N/A'}</span>
                    <span>Phone: {record.phone || 'N/A'}</span>
                    <span>Appointment: {record.appointment_date || 'Not scheduled'}</span>
                  </div>

                  <div className="patient-record-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={rowBusyId === record.id}
                      onClick={() => markAsSeen(record.id, 'seen')}
                    >
                      {rowBusyId === record.id ? 'Saving...' : 'Mark as Seen'}
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setActiveView('Patient Review')}>
                      Manage Patient
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setActiveView('Patient Records')}>
                      View Record
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Upcoming Appointments</p>
              <h3>Next patients on the schedule</h3>
            </div>
            <span className="panel-tag">{appointments.length} listed</span>
          </div>

          {appointments.length === 0 ? (
            <p className="muted-copy">No upcoming appointments are currently available.</p>
          ) : (
            <div className="stack-list">
              {appointments.map((appointment) => (
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

          <div className="filter-actions-row top-gap">
            <button type="button" className="ghost-button" onClick={() => setActiveView('Appointments')}>
              View All Appointments
            </button>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Clinical Snapshot</p>
              <h3>Today at a glance</h3>
            </div>
          </div>

          <div className="finance-grid">
            <div>
              <span>Appointments Today</span>
              <strong>{dashboard?.stats?.appointments_today ?? 0}</strong>
            </div>
            <div>
              <span>Pending Queue</span>
              <strong>{patientData?.stats?.today_pending_count ?? 0}</strong>
            </div>
            <div>
              <span>Revenue Today</span>
              <strong>{currency.format(Number(dashboard?.stats?.revenue_today ?? 0))}</strong>
            </div>
          </div>
        </article>
      </section>
    </section>
  )
}
