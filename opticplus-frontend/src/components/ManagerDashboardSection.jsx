import { useEffect, useState } from 'react'
import StatWidget from './StatWidget.jsx'
import PortalIcon from './PortalIcon.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

export default function ManagerDashboardSection({ token, selectedBranchId, apiFetch, setActiveView }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [presence, setPresence] = useState(null)
  const [presenceError, setPresenceError] = useState('')
  const [isLoadingPresence, setIsLoadingPresence] = useState(false)
  const [presenceUpdatedAt, setPresenceUpdatedAt] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadOverview() {
      setIsLoading(true)
      setError('')
      try {
        const response = await apiFetch(`/manager/overview?branch_id=${selectedBranchId}`, { token })
        if (!cancelled) setData(response)
      } catch (nextError) {
        if (!cancelled) setError(nextError.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadOverview()
    return () => {
      cancelled = true
    }
  }, [apiFetch, selectedBranchId, token])

  useEffect(() => {
    let cancelled = false

    async function loadPresence() {
      if (document.visibilityState !== 'visible') return
      setIsLoadingPresence(true)
      setPresenceError('')
      try {
        const response = await apiFetch(`/manager/user-presence?branch_id=${selectedBranchId}`, { token })
        if (!cancelled) {
          setPresence(response)
          setPresenceUpdatedAt(new Date())
        }
      } catch (nextError) {
        if (!cancelled) setPresenceError(nextError.message)
      } finally {
        if (!cancelled) setIsLoadingPresence(false)
      }
    }

    loadPresence()
    const intervalId = window.setInterval(loadPresence, 30_000)
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') loadPresence()
    }
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [apiFetch, selectedBranchId, token])

  const stats = [
    ['Today Sales', currency.format(Number(data?.stats.today_sales ?? 0)), 'Revenue recorded today', 'money', 'seen'],
    ['Today Patients', data?.stats.today_patients ?? '...', 'Patients registered today', 'patients', 'today'],
    ['Today Expenses', currency.format(Number(data?.stats.today_expenses ?? 0)), 'Branch spending posted today', 'alert', 'pending'],
    [
      'Sales + Insurance',
      currency.format(Number(data?.stats.today_sales_plus_insurance ?? 0)),
      `Insurance today: ${currency.format(Number(data?.stats.today_insurance_sales ?? 0))}`,
      'shield',
      'total',
    ],
  ]
  const quickLinks = buildManagerQuickLinks(data?.quick_links ?? [])
  const presenceByBranch = (presence?.users ?? []).reduce((groups, user) => {
    const key = user.branch_name || 'Unknown branch'
    groups[key] = [...(groups[key] ?? []), user]
    return groups
  }, {})
  const onlineUsers = (presence?.users ?? []).filter((user) => user.is_online).length

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">General Manager</p>
          <h3>Command center for branch operations and authority controls</h3>
          <p className="header-copy">
            Monitor live performance, inspect exceptions, and jump straight into the pages where decisions get made.
          </p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}

      <section className="stats-grid patient-stats-grid dashboard-stats-grid">
        {stats.map(([label, value, note, icon, className]) => (
          <StatWidget key={label} label={label} value={isLoading && !data ? '...' : value} note={note} icon={icon} className={className} />
        ))}
      </section>

      <section className="panel manager-user-presence">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">User Sign-ins</p>
            <h3>Online users and last login by branch</h3>
            <p className="header-copy">Online means the user made an authenticated request within the last 2 minutes. This list refreshes every 30 seconds.</p>
          </div>
          <span className="panel-tag">
            {isLoadingPresence && !presence ? 'Loading users...' : `${onlineUsers} online`}
          </span>
        </div>

        {presenceError ? <div className="message-banner error">{presenceError}</div> : null}

        {Object.entries(presenceByBranch).length ? (
          <div className="manager-presence-branches">
            {Object.entries(presenceByBranch).map(([branchName, users]) => (
              <section className="manager-presence-branch" key={branchName}>
                <div className="manager-presence-branch-heading">
                  <h4>{branchName}</h4>
                  <span>{users.filter((user) => user.is_online).length} online of {users.length} users</span>
                </div>
                <div className="manager-presence-list">
                  {users.map((user) => (
                    <article className="manager-presence-user" key={user.id}>
                      <div className="manager-presence-user-name">
                        <span className={`presence-indicator${user.is_online ? ' is-online' : ''}`} aria-label={user.is_online ? 'Online' : 'Offline'} />
                        <div>
                          <strong>{user.name}</strong>
                          <span>{user.username} · {titleize(user.role)}{user.employee_status === 'inactive' ? ' · Inactive account' : ''}</span>
                        </div>
                      </div>
                      <div className="manager-presence-user-meta">
                        <span className={`presence-status${user.is_online ? ' is-online' : ''}`}>{user.is_online ? 'Online' : 'Offline'}</span>
                        <span>Last login: {user.last_login_at ? formatDateTime(user.last_login_at) : 'Not recorded yet'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="muted-copy">{presenceError ? 'User sign-in activity could not be loaded.' : 'No users were found for this branch selection.'}</p>
        )}
        {presenceUpdatedAt ? <p className="muted-copy manager-presence-updated">Last refreshed {presenceUpdatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p> : null}
      </section>

      <section className="content-grid manager-dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Monthly Overview</p>
              <h3>{data?.branch_name ?? 'Active branch'} performance</h3>
            </div>
            <span className="panel-tag">{data?.branch_name ?? 'Branch'}</span>
          </div>

          <div className="manager-overview-grid">
            <MetricCard label="Sales" value={currency.format(Number(data?.stats.monthly_sales ?? 0))} change={data?.changes.sales ?? 0} tone="success" />
            <MetricCard label="Patients" value={String(data?.stats.monthly_patients ?? 0)} change={data?.changes.patients ?? 0} tone="info" />
            <MetricCard label="Expenses" value={currency.format(Number(data?.stats.monthly_expenses ?? 0))} change={data?.changes.expenses ?? 0} tone="warning" />
            <MetricCard label="Profit" value={currency.format(Number(data?.stats.monthly_profit ?? 0))} change={data?.changes.profit ?? 0} subtext="Sales minus expenses" tone="success" />
            <MetricCard label="Profit + Insurance" value={currency.format(Number(data?.stats.monthly_profit_with_insurance ?? 0))} change={data?.changes.profit_with_insurance ?? 0} subtext="Sales plus insurance minus expenses" tone="total" />
            <MetricCard label="New Patients" value={String(data?.stats.monthly_new_patients ?? 0)} subtext="First-time registrations this month" tone="info" />
            <MetricCard label="Old Patients" value={String(data?.stats.monthly_old_patients ?? 0)} subtext="Returning registrations this month" tone="warning" />
          </div>

          <div className="manager-performance">
            {(data?.weekly_performance ?? []).map((day) => {
              const maxSales = Math.max(...(data?.weekly_performance ?? []).map((item) => Number(item.sales || 0)), 1)
              const height = Math.max(18, (Number(day.sales || 0) / maxSales) * 120)

              return (
                <div key={day.label} className="manager-bar">
                  <div className="manager-bar-column" style={{ height }}>
                    <span>{day.patients}</span>
                  </div>
                  <strong>{day.label}</strong>
                  <small>{currency.format(Number(day.sales || 0))}</small>
                </div>
              )
            })}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Today&apos;s Attendance</p>
              <h3>Staff presence</h3>
            </div>
          </div>

          <div className="stack-list">
            {(data?.today_attendance ?? []).length ? (
              data.today_attendance.map((entry) => (
                <div key={entry.id} className="stack-item">
                  <div>
                    <strong>{entry.name}</strong>
                    <span>{entry.staff_id || 'Staff ID unavailable'}</span>
                  </div>
                  <div className="stack-meta">
                    <strong>{entry.clock_in_time ? formatTime(entry.clock_in_time) : 'No clock-in'}</strong>
                    <span>{entry.location_verified ? 'GPS verified' : 'Location pending'}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted-copy">No attendance recorded today.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent Operations</p>
              <h3>Appointments and patient activity</h3>
            </div>
          </div>

          <div className="stack-list">
            {(data?.recent_operations ?? []).map((item) => (
              <div key={`${item.type}-${item.ref_id}`} className="stack-item">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.ref_id}</span>
                </div>
                <div className="stack-meta">
                  <strong>{item.type}</strong>
                  <span>{item.status}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="module-section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Quick Navigation</p>
            <h3>Manager pages</h3>
          </div>
        </div>

        <div className="module-grid">
          {quickLinks.map((item) => (
            <button key={item.title} type="button" className="module-card manager-link-card" onClick={() => setActiveView(item.view)}>
              <div className="module-card-icon">
                <PortalIcon name={iconForView(item.view)} className="module-icon" />
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

function buildManagerQuickLinks(items) {
  const nextItems = [...items]

  if (!nextItems.some((item) => item.view === 'Reports')) {
    nextItems.push({
      title: 'Reports',
      view: 'Reports',
      note: 'Preview, configure, and export branch reports before printing.',
    })
  }

  return nextItems
}

function titleize(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatDateTime(value) {
  return new Date(value).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function MetricCard({ label, value, change = null, subtext = '', tone = 'info' }) {
  const changeClass = change >= 0 ? 'positive' : 'negative'
  const changePrefix = change >= 0 ? '+' : ''

  return (
    <div className={`manager-metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {typeof change === 'number' ? <p className={`manager-change ${changeClass}`}>{changePrefix}{change}% vs last month</p> : null}
      {subtext ? <p className="muted-copy">{subtext}</p> : null}
    </div>
  )
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function iconForView(view) {
  return {
    Patients: 'patients',
    'Staff Profiles': 'support',
    Inventory: 'inventory',
    Billing: 'receipt',
    'Revenue Tracking': 'finance',
    'Insurance Claims': 'shield',
    Finance: 'finance',
    Users: 'settings',
  }[view] || 'dashboard'
}
