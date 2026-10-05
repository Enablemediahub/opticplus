import { useEffect, useState } from 'react'

function formatTimestamp(value) {
  if (!value) return 'Unknown time'

  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export default function AuditLogSection({ apiFetch, token, selectedBranchId, session }) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState({
    search: '',
    action_type: 'all',
    page: 1,
    per_page: 15,
  })
  const [draftSearch, setDraftSearch] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadAuditLogs() {
      if (!token) return

      setIsLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          search: query.search,
          action_type: query.action_type,
          page: String(query.page),
          per_page: String(query.per_page),
        })

        if (session?.is_admin) {
          params.set('branch_id', String(selectedBranchId))
        }

        const response = await apiFetch(`/manager/audit-logs?${params.toString()}`, { token })
        if (!cancelled) {
          setData(response)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadAuditLogs()

    return () => {
      cancelled = true
    }
  }, [apiFetch, query, selectedBranchId, session?.is_admin, token])

  function handleSubmit(event) {
    event.preventDefault()
    setQuery((current) => ({
      ...current,
      search: draftSearch.trim(),
      page: 1,
    }))
  }

  function handleReset() {
    setDraftSearch('')
    setQuery({
      search: '',
      action_type: 'all',
      page: 1,
      per_page: 15,
    })
  }

  const records = data?.records ?? []
  const pagination = data?.pagination

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Audit Log</p>
          <h3>Track edits, deletions, and sensitive record changes</h3>
          <p className="header-copy">
            Review successful write actions across the portal so the general manager can follow who changed what, when, and on which record.
          </p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <article className="stat-card patient-stat-card total">
          <span>Logged actions</span>
          <strong>{pagination?.total ?? 0}</strong>
          <p>Total audit entries in the current filter window.</p>
        </article>
        <article className="stat-card patient-stat-card seen">
          <span>Branch scope</span>
          <strong>{data?.branch_name ?? session?.branch ?? 'Active branch'}</strong>
          <p>The branch currently represented in this audit view.</p>
        </article>
        <article className="stat-card patient-stat-card today">
          <span>Visible rows</span>
          <strong>{records.length}</strong>
          <p>Entries loaded on this page right now.</p>
        </article>
        <article className="stat-card patient-stat-card pending">
          <span>Action filter</span>
          <strong>{query.action_type === 'all' ? 'All' : query.action_type}</strong>
          <p>Current action type narrowed in the log.</p>
        </article>
      </section>

      <section className="finance-layout">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Audit Filters</p>
              <h3>Search the change trail</h3>
            </div>
            <span className="panel-tag">{pagination?.total ?? 0} entries</span>
          </div>

          <form className="patient-filter-grid" onSubmit={handleSubmit}>
            <label>
              Search
              <input
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder="User, route, record id, or summary"
              />
            </label>
            <label>
              Action type
              <select
                value={query.action_type}
                onChange={(event) => setQuery((current) => ({ ...current, action_type: event.target.value, page: 1 }))}
              >
                <option value="all">All actions</option>
                <option value="edit">Edits</option>
                <option value="delete">Deletions</option>
              </select>
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button" disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Apply filters'}
              </button>
              <button type="button" className="ghost-button" onClick={handleReset}>
                Reset
              </button>
            </div>
          </form>
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Security Trail</p>
              <h3>Recent edits and deletions</h3>
            </div>
            <span className="panel-tag">Page {pagination?.page ?? 1} of {pagination?.last_page ?? 1}</span>
          </div>

          <div className="table-shell">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Route</th>
                  <th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {records.length ? records.map((record) => (
                  <tr key={record.id}>
                    <td>{formatTimestamp(record.created_at)}</td>
                    <td>
                      <strong>{record.user_name || 'Unknown user'}</strong>
                      <div className="muted-copy">{record.user_role || 'Unknown role'}</div>
                    </td>
                    <td>
                      <span className={`status-pill ${record.action_type === 'delete' ? 'status-pending' : 'status-seen'}`}>
                        {record.action_type}
                      </span>
                    </td>
                    <td>
                      <strong>{record.entity_type || 'Unknown target'}</strong>
                      <div className="muted-copy">{record.target_identifier || 'No record id captured'}</div>
                    </td>
                    <td>
                      <div>{record.route_uri || record.request_path || 'Unknown route'}</div>
                      <div className="muted-copy">{record.summary || 'No summary available'}</div>
                    </td>
                    <td>
                      {record.payload && Object.keys(record.payload).length ? (
                        <details className="audit-log-details">
                          <summary>View payload</summary>
                          <pre className="audit-log-payload">{JSON.stringify(record.payload, null, 2)}</pre>
                        </details>
                      ) : (
                        <span className="muted-copy">No payload captured</span>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="6">{isLoading ? 'Loading audit log...' : 'No audit entries matched the current filters.'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="filter-actions-row top-gap">
            <button
              type="button"
              className="ghost-button"
              disabled={!pagination || pagination.page <= 1 || isLoading}
              onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}
            >
              Previous
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={!pagination || pagination.page >= pagination.last_page || isLoading}
              onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}
            >
              Next
            </button>
          </div>
        </article>
      </section>
    </section>
  )
}
