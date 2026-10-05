import { useMemo, useState } from 'react'
import PortalIcon from './PortalIcon.jsx'
import StatWidget from './StatWidget.jsx'

export default function OptometristAppointmentsSection({ dashboard, isLoadingDashboard, setActiveView }) {
  const appointments = dashboard?.appointments ?? []
  const weeklyAppointments = dashboard?.weekly_appointments ?? []
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [optometristFilter, setOptometristFilter] = useState('all')

  const statusOptions = useMemo(() => {
    return Array.from(new Set(appointments.map((appointment) => String(appointment.status || '').trim()).filter(Boolean)))
  }, [appointments])

  const optometristOptions = useMemo(() => {
    return Array.from(new Set(appointments.map((appointment) => String(appointment.optometrist || '').trim()).filter(Boolean)))
  }, [appointments])

  const dateOptions = useMemo(() => {
    return Array.from(new Set(appointments.map((appointment) => String(appointment.appointment_date || '').trim()).filter(Boolean)))
      .sort((left, right) => right.localeCompare(left))
  }, [appointments])

  const filteredAppointments = useMemo(() => {
    const query = search.trim().toLowerCase()

    return appointments.filter((appointment) => {
      const patient = String(appointment.patient || '').toLowerCase()
      const optometrist = String(appointment.optometrist || '').toLowerCase()
      const status = String(appointment.status || '').toLowerCase()
      const appointmentDate = String(appointment.appointment_date || '')
      const appointmentTime = String(appointment.appointment_time || '').toLowerCase()

      const matchesSearch = !query
        || patient.includes(query)
        || optometrist.includes(query)
        || status.includes(query)
        || appointmentDate.toLowerCase().includes(query)
        || appointmentTime.includes(query)

      const matchesStatus = statusFilter === 'all' || String(appointment.status || '') === statusFilter
      const matchesDate = dateFilter === 'all' || appointmentDate === dateFilter
      const matchesOptometrist = optometristFilter === 'all' || String(appointment.optometrist || '') === optometristFilter

      return matchesSearch && matchesStatus && matchesDate && matchesOptometrist
    })
  }, [appointments, dateFilter, optometristFilter, search, statusFilter])

  const stats = [
    {
      label: 'Listed Appointments',
      value: appointments.length,
      note: 'Records currently loaded into the workspace',
      icon: 'calendar',
      className: 'total',
    },
    {
      label: 'Filtered Results',
      value: filteredAppointments.length,
      note: search || statusFilter !== 'all' || dateFilter !== 'all' || optometristFilter !== 'all'
        ? 'Appointments matching the active search and filters'
        : 'No filters applied yet',
      icon: 'search',
      className: 'pending',
    },
    {
      label: 'Appointments Today',
      value: dashboard?.stats?.appointments_today ?? 0,
      note: 'Today on the branch schedule',
      icon: 'clock',
      className: 'seen',
    },
  ]

  if (isLoadingDashboard && !dashboard) {
    return (
      <section className="module-section">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Appointments</p>
              <h3>Loading appointment workspace...</h3>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="module-section">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Appointments</p>
          <h3>Appointment register for the optometrist workspace</h3>
          <p className="header-copy">
            Use a single wide schedule table to search, filter, and review the branch bookings without working through split columns.
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

      <div className="optometrist-workspace-stack">
        <article className="panel optometrist-workspace-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Appointment List</p>
              <h3>Search and filter scheduled patients</h3>
            </div>
            <span className="panel-tag">{filteredAppointments.length} visible</span>
          </div>

          <form className="patient-filter-grid" onSubmit={(event) => event.preventDefault()}>
            <label className="field">
              <span>Search</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search patient, optometrist, status, date, or time"
              />
            </label>

            <label className="field">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Date</span>
              <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
                <option value="all">All dates</option>
                {dateOptions.map((dateValue) => (
                  <option key={dateValue} value={dateValue}>
                    {formatDate(dateValue)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Optometrist</span>
              <select value={optometristFilter} onChange={(event) => setOptometristFilter(event.target.value)}>
                <option value="all">All optometrists</option>
                {optometristOptions.map((optometrist) => (
                  <option key={optometrist} value={optometrist}>
                    {optometrist}
                  </option>
                ))}
              </select>
            </label>

            <div className="filter-actions-row full-span">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setSearch('')
                  setStatusFilter('all')
                  setDateFilter('all')
                  setOptometristFilter('all')
                }}
              >
                Reset Filters
              </button>
              <button type="button" className="primary-button" onClick={() => setActiveView('Patient Review')}>
                Open Patient Review
              </button>
              <button type="button" className="ghost-button" onClick={() => setActiveView('Patient Records')}>
                Open Patient Records
              </button>
            </div>
          </form>

          {filteredAppointments.length === 0 ? (
            <div className="empty-state-panel">
              <PortalIcon name="calendar" className="module-icon" />
              <h3>No appointments match the current filters</h3>
              <p className="muted-copy">Adjust the search or filter selections to widen the schedule view.</p>
            </div>
          ) : (
            <div className="table-shell optometrist-records-table-shell">
              <table className="portal-table optometrist-records-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Appointment Date</th>
                    <th>Time</th>
                    <th>Optometrist</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td>
                        <div className="patient-table-primary">
                          <strong>{appointment.patient || 'Unknown patient'}</strong>
                          <span>ID: {appointment.id}</span>
                        </div>
                      </td>
                      <td>{formatDate(appointment.appointment_date)}</td>
                      <td>{appointment.appointment_time || 'Not set'}</td>
                      <td>{appointment.optometrist || 'Unassigned'}</td>
                      <td>
                        <span className={`status-pill status-${String(appointment.status || '').toLowerCase().replaceAll(' ', '-')}`}>
                          {appointment.status || 'pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="panel optometrist-workspace-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Weekly Pulse</p>
              <h3>Appointment counts across the week</h3>
            </div>
            <span className="panel-tag">{weeklyAppointments.length} days</span>
          </div>

          {weeklyAppointments.length === 0 ? (
            <p className="muted-copy">No weekly appointment summary is available right now.</p>
          ) : (
            <div className="table-shell">
              <table className="portal-table inventory-table-wide">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Appointments</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyAppointments.map((day) => (
                    <tr key={day.label}>
                      <td>{day.label}</td>
                      <td>{day.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>
    </section>
  )
}

function formatDate(dateValue) {
  if (!dateValue) return 'Not scheduled'
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return dateValue
  return parsed.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
