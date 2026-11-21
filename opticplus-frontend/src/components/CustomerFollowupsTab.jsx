import { useState } from 'react'
import StatWidget from './StatWidget.jsx'

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const displayDate = (value) => {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString()
}

const displayDateTime = (value) => {
  if (!value) return 'No calls yet'
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

const contactLabels = {
  reached: 'Reached',
  no_answer: 'No answer',
  callback_requested: 'Callback requested',
  wrong_number: 'Wrong number',
  unreachable: 'Could not reach',
}

const complaintLabels = {
  none: 'No concern',
  blurred_vision: 'Vision still blurry',
  headache: 'Headache or strain',
  discomfort_fit: 'Comfort or fit',
  adaptation: 'Adjusting to new lenses',
  damage: 'Damage or defect',
  other: 'Other concern',
}

const emptyCallForm = () => ({
  contact_result: 'reached',
  wearing_frequency: 'not_asked',
  vision_response: 'not_asked',
  complaint_category: 'none',
  complaint_notes: '',
  needs_optometrist_review: false,
  next_attempt_at: '',
  call_notes: '',
})

function milestoneLabel(followup) {
  return followup.milestone_label || ({
    week_1: '1-week check-in',
    six_months: '6-month check-up',
    two_years: '2-year check-up',
  }[followup.milestone] ?? 'Customer check-in')
}

function queueStatus(followup) {
  if (followup.status === 'completed') return { label: 'Completed', className: 'is-completed' }
  if (followup.due_at < today()) return { label: 'Overdue', className: 'is-overdue' }
  if (followup.due_at === today()) return { label: 'Due today', className: 'is-due' }
  return { label: 'Upcoming', className: 'is-upcoming' }
}

export default function CustomerFollowupsTab({
  data,
  filters,
  setFilters,
  setQuery,
  isManager,
  isReceptionist,
  isLoading,
  isSaving,
  error,
  success,
  recordAttempt,
  resolveComplaint,
}) {
  const [selectedFollowup, setSelectedFollowup] = useState(null)
  const [callForm, setCallForm] = useState(emptyCallForm)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [formError, setFormError] = useState('')

  function openFollowup(followup) {
    setSelectedFollowup(followup)
    setCallForm(emptyCallForm())
    setResolutionNotes('')
    setFormError('')
  }

  function closeFollowup() {
    if (isSaving) return
    setSelectedFollowup(null)
    setFormError('')
  }

  async function submitAttempt(event) {
    event.preventDefault()
    if (!selectedFollowup) return
    if (callForm.contact_result === 'callback_requested' && !callForm.next_attempt_at) {
      setFormError('Choose a date and time for the requested callback.')
      return
    }

    const saved = await recordAttempt(selectedFollowup.id, {
      ...callForm,
      wearing_frequency: callForm.contact_result === 'reached' ? callForm.wearing_frequency : null,
      vision_response: callForm.contact_result === 'reached' ? callForm.vision_response : null,
      next_attempt_at: callForm.next_attempt_at || null,
    })
    if (saved) {
      setSelectedFollowup(null)
      setFormError('')
    }
  }

  async function submitComplaintResolution(event) {
    event.preventDefault()
    if (!selectedFollowup || !resolutionNotes.trim()) {
      setFormError('Add a short resolution note before closing this concern.')
      return
    }
    const saved = await resolveComplaint(selectedFollowup.id, resolutionNotes.trim())
    if (saved) {
      setSelectedFollowup((current) => current ? { ...current, complaint_status: 'resolved' } : current)
      setResolutionNotes('')
      setFormError('')
    }
  }

  const stats = data?.stats ?? {}
  const followups = data?.followups ?? []
  const selectedCanCall = selectedFollowup
    && (selectedFollowup.status !== 'completed' || selectedFollowup.complaint_status === 'open')

  return (
    <section className="customer-aftercare">
      <header className="customer-aftercare-hero">
        <div className="customer-aftercare-hero__copy">
          <span className="customer-aftercare-hero__mark" aria-hidden="true">✦</span>
          <div>
            <p className="eyebrow">Customer aftercare · {data?.branch_name || 'Your branch'}</p>
            <h3>Great care continues after pickup.</h3>
            <p>Thoughtful check-ins help every customer feel confident in their glasses—and help us act quickly when something is not right.</p>
          </div>
        </div>
        <div className="customer-aftercare-hero__rhythm" aria-label="Scheduled check-ins">
          <span><b>01</b> 1 week</span>
          <i aria-hidden="true" />
          <span><b>02</b> 6 months</span>
          <i aria-hidden="true" />
          <span><b>03</b> 2 years</span>
        </div>
      </header>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <div className="customer-aftercare-stats">
        <StatWidget label="Due today" value={stats.due_today ?? '…'} note="Check-ins ready for a call" icon="calendar" className="today" />
        <StatWidget label="Overdue" value={stats.overdue ?? '…'} note="Keep these customers close" icon="alert" className="pending" />
        <StatWidget label="Open concerns" value={stats.open_complaints ?? '…'} note="Needs a documented next step" icon="support" className="seen" />
        <StatWidget label="Completed this month" value={stats.completed_this_month ?? '…'} note={`${Number(stats.completion_rate ?? 0).toFixed(1)}% of this month’s due check-ins completed`} icon="check-badge" className="total" />
      </div>

      {isManager || isReceptionist ? (
        <article className="panel customer-aftercare-kpi">
          <div className="panel-heading customer-aftercare-section-heading">
            <div>
              <p className="eyebrow">{isManager ? 'Monthly KPI evidence' : 'Your monthly care activity'}</p>
              <h3>{isManager ? 'Receptionist care activity' : 'Your follow-up contribution'}</h3>
              <p className="muted-copy">{isManager
                ? 'Objective call and check-up records to support the GM’s monthly review; these metrics do not change weighted KPI scores automatically.'
                : 'Your logged calls and completed check-ups are visible here. The GM uses these records as evidence during monthly review.'}</p>
            </div>
            <label className="customer-aftercare-month">
              Review month
              <input
                type="month"
                value={filters.kpi_month || ''}
                onChange={(event) => {
                  const next = { ...filters, kpi_month: event.target.value }
                  setFilters(next)
                  setQuery((current) => ({ ...current, kpi_month: next.kpi_month, page: 1 }))
                }}
              />
            </label>
          </div>
          <div className="table-shell">
            <table className="portal-table customer-aftercare-kpi-table">
              <thead>
                <tr>
                  <th>Receptionist</th>
                  <th>Calls logged</th>
                  <th>Reached</th>
                  <th>Check-ups completed</th>
                  <th>On time</th>
                  <th>Concerns noted</th>
                </tr>
              </thead>
              <tbody>
                {(data?.kpi_evidence?.staff ?? []).map((staff) => (
                  <tr key={staff.user_id}>
                    <td><strong>{staff.staff_name}</strong></td>
                    <td>{staff.calls_logged}</td>
                    <td>{staff.patients_reached}</td>
                    <td>{staff.checkups_completed}</td>
                    <td>{staff.completed_on_time}</td>
                    <td>{staff.complaints_logged}</td>
                  </tr>
                ))}
                {!data?.kpi_evidence?.staff?.length ? (
                  <tr><td colSpan="6">No receptionist activity recorded for this month.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="customer-aftercare-kpi__foot">
            <span>{Number(stats.completed_due_this_month ?? 0)} of {Number(stats.due_this_month ?? 0)} scheduled check-ups due this month are complete.</span>
            <strong>{Number(stats.on_time_rate ?? 0).toFixed(1)}% on time</strong>
          </div>
        </article>
      ) : null}

      <article className="panel customer-aftercare-queue">
        <div className="panel-heading customer-aftercare-section-heading">
          <div>
            <p className="eyebrow">Follow-up desk</p>
            <h3>Every check-in, clearly in view</h3>
            <p className="muted-copy">
              Each confirmed pickup creates 1-week, 6-month, and 2-year check-ins, so repeated names can be separate milestones rather than duplicate customers. Use the receipt and check-in columns to distinguish them.{' '}
              {isManager
                ? 'To review notes, choose Open concerns or All follow-ups, then select Review concern or Review history.'
                : 'Overdue calls and open concerns are prioritized; concerns stay visible until the GM records resolution.'}
            </p>
          </div>
          <span className="panel-tag">{data?.pagination?.total ?? 0} records</span>
        </div>

        <form
          className="customer-aftercare-filters"
          onSubmit={(event) => {
            event.preventDefault()
            setQuery((current) => ({ ...current, ...filters, page: 1 }))
          }}
        >
          <label>
            Search customers
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Name, phone, folder or receipt"
            />
          </label>
          <label>
            Follow-up view
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="queue">Active check-ins &amp; open concerns</option>
              <option value="due">Due today</option>
              <option value="overdue">Overdue</option>
              <option value="upcoming">Upcoming</option>
              <option value="complaints">Open concerns</option>
              <option value="completed">Completed</option>
              <option value="all">All follow-ups</option>
            </select>
          </label>
          <label>
            Due from
            <input
              type="date"
              value={filters.date_from}
              onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))}
            />
          </label>
          <label>
            Due to
            <input
              type="date"
              value={filters.date_to}
              onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))}
            />
          </label>
          <div className="filter-actions-row">
            <button type="submit" className="primary-button">Apply filters</button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                const next = { ...filters, search: '', status: 'queue', date_from: '', date_to: '' }
                setFilters(next)
                setQuery((current) => ({ ...current, ...next, page: 1 }))
              }}
            >
              Reset
            </button>
          </div>
        </form>

        {isLoading && !data ? <p className="muted-copy">Preparing the aftercare desk…</p> : null}
        <div className="table-shell">
          <table className="portal-table customer-aftercare-table">
            <thead>
              <tr>
                <th>Customer &amp; due date</th>
                <th>Check-in</th>
                <th>Pickup</th>
                <th>Last call</th>
                <th>Call history</th>
                <th>Concern</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {followups.map((followup) => {
                const state = queueStatus(followup)
                const latestAttempt = followup.attempts?.[0]
                return (
                  <tr key={followup.id}>
                    <td>
                      <strong>{followup.patient_name || 'Patient record unavailable'}</strong>
                      <span className="customer-aftercare-subline">{followup.phone || 'No phone on record'} · {followup.folder_id || 'No folder ID'}</span>
                      <span className={`customer-aftercare-status ${state.className}`}>{state.label} · {displayDate(followup.due_at)}</span>
                    </td>
                    <td><strong>{milestoneLabel(followup)}</strong><span className="customer-aftercare-subline">{followup.receipt_number ? `Receipt ${followup.receipt_number}` : 'Glasses pickup'}</span></td>
                    <td>{displayDate(followup.pickup_at)}</td>
                    <td>{displayDateTime(followup.last_attempt_at)}</td>
                    <td>{followup.attempt_count} {Number(followup.attempt_count) === 1 ? 'attempt' : 'attempts'}{latestAttempt ? <span className="customer-aftercare-subline">{contactLabels[latestAttempt.contact_result] || latestAttempt.contact_result}</span> : null}</td>
                    <td>
                      {followup.complaint_status === 'open'
                        ? <span className="customer-aftercare-status is-concern">Open concern</span>
                        : followup.complaint_status === 'resolved'
                          ? <span className="customer-aftercare-status is-completed">Resolved</span>
                          : '—'}
                      {latestAttempt?.complaint_category && latestAttempt.complaint_category !== 'none'
                        ? <span className="customer-aftercare-subline">{complaintLabels[latestAttempt.complaint_category] || latestAttempt.complaint_category}</span>
                        : null}
                    </td>
                    <td>
                      <button type="button" className="mini-action" onClick={() => openFollowup(followup)}>
                        {isManager
                          ? followup.complaint_status === 'open' ? 'Review concern' : 'Review history'
                          : followup.status === 'completed' && followup.complaint_status !== 'open' ? 'View history' : 'Log check-in'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!followups.length && !isLoading ? (
                <tr><td colSpan="7"><div className="customer-aftercare-empty"><span aria-hidden="true">✦</span><strong>You’re all caught up.</strong><p>No follow-ups match this view. Upcoming aftercare is scheduled automatically when glasses are marked picked up.</p></div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <span>Page {data?.pagination?.page ?? 1} of {Math.max(data?.pagination?.total_pages ?? 1, 1)}</span>
          <div className="pagination-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={(data?.pagination?.page ?? 1) <= 1}
              onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}
            >
              Previous
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={(data?.pagination?.page ?? 1) >= (data?.pagination?.total_pages ?? 1)}
              onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}
            >
              Next
            </button>
          </div>
        </div>
      </article>

      {selectedFollowup ? (
        <div className="modal-overlay customer-aftercare-overlay" onClick={closeFollowup}>
          <article
            className="modal-panel customer-aftercare-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-aftercare-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-heading customer-aftercare-modal__heading">
              <div>
                <p className="eyebrow">Customer check-in · {milestoneLabel(selectedFollowup)}</p>
                <h3 id="customer-aftercare-modal-title">{selectedFollowup.patient_name || 'Patient follow-up'}</h3>
                <p>{selectedFollowup.phone || 'No phone on record'} · Due {displayDate(selectedFollowup.due_at)}</p>
              </div>
              <button type="button" className="ghost-button" onClick={closeFollowup} disabled={isSaving}>Close</button>
            </div>

            {formError ? <div className="message-banner error">{formError}</div> : null}
            {error ? <div className="message-banner error">{error}</div> : null}
            {selectedFollowup.complaint_status === 'open' ? (
              <div className="customer-aftercare-alert">
                <span aria-hidden="true">!</span>
                <div><strong>Open customer concern</strong><p>Record the next step carefully. Refer clinical concerns to the optometrist; this workflow does not provide diagnosis or treatment advice.</p></div>
              </div>
            ) : null}
            {selectedFollowup.complaint_status === 'resolved' ? (
              <div className="customer-aftercare-resolution-summary">
                <strong>Concern resolution</strong>
                <p>{selectedFollowup.complaint_resolution_notes || 'This concern was marked resolved without a resolution note.'}</p>
              </div>
            ) : null}

            <div className="customer-aftercare-history">
              <div className="customer-aftercare-history__heading"><strong>Outreach history</strong><span>{selectedFollowup.attempts?.length ?? 0} logged</span></div>
              {selectedFollowup.attempts?.length ? selectedFollowup.attempts.map((attempt) => (
                <article key={attempt.id}>
                  <span className="customer-aftercare-history__dot" aria-hidden="true" />
                  <div>
                    <strong>{contactLabels[attempt.contact_result] || attempt.contact_result} · {displayDateTime(attempt.attempted_at)}</strong>
                    <small>{attempt.staff_name || 'Receptionist'}{attempt.vision_response && attempt.vision_response !== 'not_asked' ? ` · Vision: ${attempt.vision_response}` : ''}{attempt.wearing_frequency && attempt.wearing_frequency !== 'not_asked' ? ` · Wearing: ${attempt.wearing_frequency.replaceAll('_', ' ')}` : ''}</small>
                    {attempt.complaint_category !== 'none' ? <p><b>{complaintLabels[attempt.complaint_category] || attempt.complaint_category}:</b> {attempt.complaint_notes || 'No extra details recorded.'}</p> : null}
                    {attempt.needs_optometrist_review ? <em>Referred for optometrist review</em> : null}
                    {attempt.call_notes ? <p>{attempt.call_notes}</p> : null}
                    {attempt.next_attempt_at ? <small>Next attempt: {displayDateTime(attempt.next_attempt_at)}</small> : null}
                  </div>
                </article>
              )) : <p className="muted-copy">No call attempts have been recorded for this check-in.</p>}
            </div>

            {selectedCanCall ? (
              <form className="customer-aftercare-call-form" onSubmit={submitAttempt}>
                <div className="customer-aftercare-form-heading"><span>01</span><div><strong>Record this call</strong><small>Capture the customer’s own feedback and any next step.</small></div></div>
                <label>
                  Call outcome
                  <select value={callForm.contact_result} onChange={(event) => setCallForm((current) => ({ ...current, contact_result: event.target.value }))}>
                    {Object.entries(contactLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
                {callForm.contact_result === 'reached' ? (
                  <>
                    <label>
                      How often are they wearing the glasses?
                      <select value={callForm.wearing_frequency} onChange={(event) => setCallForm((current) => ({ ...current, wearing_frequency: event.target.value }))}>
                        <option value="not_asked">Not asked</option>
                        <option value="daily">Every day</option>
                        <option value="most_days">Most days</option>
                        <option value="sometimes">Sometimes</option>
                        <option value="not_using">Not using them</option>
                      </select>
                    </label>
                    <label>
                      How is their vision with the glasses?
                      <select value={callForm.vision_response} onChange={(event) => setCallForm((current) => ({ ...current, vision_response: event.target.value }))}>
                        <option value="not_asked">Not asked</option>
                        <option value="improved">Better</option>
                        <option value="same">About the same</option>
                        <option value="worse">Worse</option>
                        <option value="unsure">Unsure / still adapting</option>
                      </select>
                    </label>
                    <label>
                      Concern raised
                      <select value={callForm.complaint_category} onChange={(event) => setCallForm((current) => ({ ...current, complaint_category: event.target.value }))}>
                        {Object.entries(complaintLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                      </select>
                    </label>
                    {callForm.complaint_category !== 'none' ? (
                      <>
                        <label className="customer-aftercare-form-wide">
                          Customer’s description of the concern
                          <textarea rows="3" maxLength="3000" value={callForm.complaint_notes} onChange={(event) => setCallForm((current) => ({ ...current, complaint_notes: event.target.value }))} placeholder="Record the customer’s words and when the issue happens." />
                        </label>
                        <label className="customer-aftercare-checkbox customer-aftercare-form-wide">
                          <input type="checkbox" checked={callForm.needs_optometrist_review} onChange={(event) => setCallForm((current) => ({ ...current, needs_optometrist_review: event.target.checked }))} />
                          Refer this concern to the optometrist for review
                        </label>
                      </>
                    ) : null}
                  </>
                ) : (
                  <label>
                    Retry date and time {callForm.contact_result === 'callback_requested' ? '(required)' : '(optional)'}
                    <input type="datetime-local" required={callForm.contact_result === 'callback_requested'} value={callForm.next_attempt_at} onChange={(event) => setCallForm((current) => ({ ...current, next_attempt_at: event.target.value }))} />
                  </label>
                )}
                <label className="customer-aftercare-form-wide">
                  Receptionist note
                  <textarea rows="3" maxLength="3000" value={callForm.call_notes} onChange={(event) => setCallForm((current) => ({ ...current, call_notes: event.target.value }))} placeholder="Useful service context or the agreed next step." />
                </label>
                <div className="modal-actions customer-aftercare-modal__actions customer-aftercare-form-wide">
                  <span>{callForm.contact_result === 'reached' ? 'Reached check-ups are marked complete; open concerns remain visible to the GM.' : 'Unreached calls stay in the queue until a check-up is completed.'}</span>
                  <button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Saving call…' : 'Save call record'}</button>
                </div>
              </form>
            ) : null}

            {isManager && selectedFollowup.complaint_status === 'open' ? (
              <form className="customer-aftercare-resolution" onSubmit={submitComplaintResolution}>
                <div className="customer-aftercare-form-heading"><span>02</span><div><strong>Close the customer concern</strong><small>Record the action taken so the service loop is complete.</small></div></div>
                <label>
                  Resolution / hand-off note
                  <textarea rows="3" maxLength="3000" value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} placeholder="For example: optometrist review arranged; customer contacted with next steps." required />
                </label>
                <button type="submit" className="mini-action success" disabled={isSaving}>{isSaving ? 'Saving…' : 'Mark concern resolved'}</button>
              </form>
            ) : null}

            {selectedFollowup.status === 'completed' && selectedFollowup.complaint_status !== 'open' ? (
              <p className="customer-aftercare-complete-note">This check-in is complete{selectedFollowup.complaint_status === 'resolved' ? ' and the customer concern has been closed' : ''}.</p>
            ) : null}
          </article>
        </div>
      ) : null}
    </section>
  )
}
