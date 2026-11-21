import { useState } from 'react'

const complaintLabels = {
  blurred_vision: 'Vision still blurry',
  headache: 'Headache or strain',
  discomfort_fit: 'Comfort or fit',
  adaptation: 'Adjusting to new lenses',
  damage: 'Damage or defect',
  other: 'Other concern',
}

function displayDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString()
}

function displayDateTime(value) {
  if (!value) return '—'
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

export default function OptometristReferralInbox({ data, query, setQuery, error, isLoading }) {
  const [search, setSearch] = useState(query.search || '')
  const referrals = data?.referrals ?? []
  const pagination = data?.pagination

  function applySearch(event) {
    event.preventDefault()
    setQuery((current) => ({ ...current, search: search.trim(), page: 1 }))
  }

  function resetSearch() {
    setSearch('')
    setQuery((current) => ({ ...current, search: '', page: 1 }))
  }

  return (
    <section className="module-section optometrist-referrals">
      <header className="panel-heading optometrist-referrals__heading">
        <div>
          <p className="eyebrow">Clinical hand-offs · assigned to you</p>
          <h2>Concern referrals</h2>
          <p className="muted-copy">Review concerns referred by the reception team. Only patients assigned to your account at this branch are shown. Ask the General Manager to assign a patient if a referral is missing.</p>
        </div>
        <span className="panel-tag">{pagination?.total ?? 0} referrals</span>
      </header>

      {error ? <div className="message-banner error">{error}</div> : null}

      <form className="optometrist-referrals__filters" onSubmit={applySearch}>
        <label>
          Search assigned referrals
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Patient name, folder or receipt"
          />
        </label>
        <div className="filter-actions-row">
          <button type="submit" className="primary-button">Search</button>
          <button type="button" className="ghost-button" onClick={resetSearch}>Reset</button>
        </div>
      </form>

      <div className="table-shell">
        <table className="portal-table optometrist-referrals__table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Concern</th>
              <th>Pickup &amp; check-in</th>
              <th>Referred by</th>
              <th>Clinical notes</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((referral) => (
              <tr key={referral.id}>
                <td>
                  <strong>{referral.patient_name || 'Patient record unavailable'}</strong>
                  <span className="optometrist-referrals__subline">{referral.folder_id || 'No folder ID'}</span>
                </td>
                <td>
                  <strong>{complaintLabels[referral.complaint_category] || referral.complaint_category || 'Concern referred'}</strong>
                  <span className="optometrist-referrals__subline">{displayDateTime(referral.attempted_at)}</span>
                </td>
                <td>
                  <strong>{referral.milestone_label}</strong>
                  <span className="optometrist-referrals__subline">Pickup {displayDate(referral.pickup_at)}{referral.receipt_number ? ` · ${referral.receipt_number}` : ''}</span>
                </td>
                <td>
                  <strong>{referral.referred_by || 'Receptionist'}</strong>
                  <span className="optometrist-referrals__subline">{referral.contact_result?.replaceAll('_', ' ') || 'Reached'}</span>
                </td>
                <td>
                  <details className="optometrist-referrals__details">
                    <summary>Read referral</summary>
                    <div>
                      <strong>Customer concern</strong>
                      <p>{referral.complaint_notes || 'No additional concern details were recorded.'}</p>
                      {referral.vision_response && referral.vision_response !== 'not_asked' ? (
                        <p><b>Vision response:</b> {referral.vision_response.replaceAll('_', ' ')}</p>
                      ) : null}
                      {referral.wearing_frequency && referral.wearing_frequency !== 'not_asked' ? (
                        <p><b>Wearing frequency:</b> {referral.wearing_frequency.replaceAll('_', ' ')}</p>
                      ) : null}
                      {referral.call_notes ? <p><b>Reception note:</b> {referral.call_notes}</p> : null}
                    </div>
                  </details>
                </td>
              </tr>
            ))}
            {!referrals.length && !isLoading ? (
              <tr>
                <td colSpan="5">
                  <div className="optometrist-referrals__empty">
                    <strong>No assigned referrals</strong>
                    <p>New concerns referred to you will appear here. Referrals for unassigned patients remain with the General Manager for assignment.</p>
                  </div>
                </td>
              </tr>
            ) : null}
            {isLoading && !data ? (
              <tr><td colSpan="5">Loading clinical referrals...</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="pagination-bar">
        <span>Page {pagination?.page ?? 1} of {Math.max(pagination?.total_pages ?? 1, 1)}</span>
        <div className="pagination-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={(pagination?.page ?? 1) <= 1}
            onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}
          >
            Previous
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={(pagination?.page ?? 1) >= (pagination?.total_pages ?? 1)}
            onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}
