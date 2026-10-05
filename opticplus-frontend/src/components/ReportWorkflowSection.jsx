import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

export default function ReportWorkflowSection({
  apiFetch,
  token,
  session,
  selectedBranchId,
  submissionPayload = null,
}) {
  const role = session?.role
  const isAccountant = role === 'accountant'
  const isManager = role === 'manager'
  const isExecutive = ['ceo', 'director'].includes(role)
  const [data, setData] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [signatureFile, setSignatureFile] = useState(null)
  const [submissionNotes, setSubmissionNotes] = useState('')
  const [gmSignatureFile, setGmSignatureFile] = useState(null)
  const [gmNotes, setGmNotes] = useState('')
  const [pushNotes, setPushNotes] = useState('')

  async function loadWorkflow() {
    if (!token || !session) return

    setIsLoading(true)
    setError('')
    try {
      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      const response = await apiFetch(`/reports/workflow?branch_id=${branchId}`, { token })
      setData(response)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadWorkflow()
  }, [selectedBranchId, session, token])

  async function openDetail(reportId) {
    setIsLoadingDetail(true)
    setError('')
    try {
      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      const response = await apiFetch(`/reports/submissions/${reportId}?branch_id=${branchId}`, { token })
      setDetail(response)
      setGmNotes(response.report?.gm_notes || '')
      setPushNotes('')
      setGmSignatureFile(null)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  async function submitFinalReport(event) {
    event.preventDefault()
    if (!submissionPayload) return

    setIsSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      const body = new FormData()
      body.append('branch_id', String(branchId))
      body.append('title', submissionPayload.title)
      body.append('report_type', submissionPayload.report_type)
      body.append('month', submissionPayload.month)
      if (submissionPayload.comparison_branch_id !== '' && submissionPayload.comparison_branch_id != null) {
        body.append('comparison_branch_id', String(submissionPayload.comparison_branch_id))
      }
      if (submissionPayload.comparison_month) {
        body.append('comparison_month', submissionPayload.comparison_month)
      }
      body.append('accountant_notes', submissionNotes)
      body.append('payload_json', JSON.stringify(submissionPayload))
      if (signatureFile) body.append('accountant_signature', signatureFile)

      await apiFetch('/reports/submissions', {
        method: 'POST',
        token,
        body,
      })

      setSuccess('Final report submitted to the General Manager.')
      setSignatureFile(null)
      setSubmissionNotes('')
      await loadWorkflow()
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function reviewReport(decision) {
    if (!detail?.report?.id) return

    setIsSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const body = new FormData()
      body.append('decision', decision)
      body.append('gm_notes', gmNotes)
      if (gmSignatureFile) body.append('gm_signature', gmSignatureFile)

      await apiFetch(`/reports/submissions/${detail.report.id}/review`, {
        method: 'POST',
        token,
        body,
      })

      setSuccess(decision === 'validated' ? 'Report validated successfully.' : 'Report rejected successfully.')
      await Promise.all([loadWorkflow(), openDetail(detail.report.id)])
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function pushToCeo() {
    if (!detail?.report?.id) return

    setIsSubmitting(true)
    setError('')
    setSuccess('')

    try {
      await apiFetch(`/reports/submissions/${detail.report.id}/push`, {
        method: 'POST',
        token,
        body: {
          push_notes: pushNotes,
        },
      })

      setSuccess('Validated report pushed to the CEO.')
      await Promise.all([loadWorkflow(), openDetail(detail.report.id)])
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const stats = useMemo(() => ([
    ['Submitted', String(data?.stats?.submitted ?? 0), 'Waiting for GM review', 'pending', 'reports'],
    ['Validated', String(data?.stats?.validated ?? 0), 'Ready to push to the CEO', 'today', 'shield'],
    ['Pushed to CEO', String(data?.stats?.pushed_to_ceo ?? 0), 'Visible in the executive reports page', 'seen', 'briefcase'],
    ['Rejected', String(data?.stats?.rejected ?? 0), 'Returned for accountant revision', 'total', 'alert'],
  ]), [data])

  const heading = isExecutive
    ? {
        eyebrow: 'Executive Reports',
        title: 'Reports pushed by the General Manager',
        copy: 'This page only shows validated reports formally pushed to executive leadership.',
      }
    : isManager
      ? {
          eyebrow: 'Report Validation',
          title: 'Validate accountant reports and push them to the CEO',
          copy: 'Review the final report, append your signature, validate it, then push the approved version upward.',
        }
      : {
          eyebrow: 'Submission Workflow',
          title: 'Sign and route the final report for approval',
          copy: 'Once the preview is ready, attach the accountant signature and submit the final report to the General Manager.',
        }

  const list = isExecutive
    ? data?.ceo_inbox ?? []
    : isManager
      ? data?.pending_validation ?? []
      : data?.reports ?? []

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">{heading.eyebrow}</p>
          <h3>{heading.title}</h3>
          <p className="header-copy">{heading.copy}</p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <section className="stats-grid patient-stats-grid">
        {stats.map(([label, value, note, className, icon]) => (
          <StatWidget key={label} label={label} value={isLoading && !data ? '...' : value} note={note} icon={icon} className={className} />
        ))}
      </section>

      {isAccountant ? (
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Accountant Submission</p>
              <h3>Submit the previewed report to the General Manager</h3>
            </div>
            <span className="panel-tag">{submissionPayload ? 'Preview ready' : 'Preview required'}</span>
          </div>

          {submissionPayload ? (
            <form className="patient-form-grid" onSubmit={submitFinalReport}>
              <label className="full-span">
                Final report title
                <input value={submissionPayload.title} readOnly />
              </label>
              <label className="full-span">
                Accountant notes for the GM
                <textarea rows="4" value={submissionNotes} onChange={(event) => setSubmissionNotes(event.target.value)} placeholder="Add the submission note, context, or anything the GM should review before validation." />
              </label>
              <label className="full-span">
                Accountant signature
                <input type="file" accept="image/*" onChange={(event) => setSignatureFile(event.target.files?.[0] ?? null)} required />
              </label>
              <div className="filter-actions-row full-span">
                <button type="submit" className="primary-button" disabled={isSubmitting || !signatureFile}>
                  {isSubmitting ? 'Submitting report...' : 'Submit final report'}
                </button>
              </div>
            </form>
          ) : (
            <div className="message-banner">
              Preview a report first. The final report that gets signed and routed will be built from the current preview.
            </div>
          )}
        </article>
      ) : null}

      <section className="content-grid manager-dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{isExecutive ? 'CEO Inbox' : isManager ? 'Pending Validation' : 'My Submitted Reports'}</p>
              <h3>{isExecutive ? 'Reports formally pushed by General Manager' : isManager ? 'Submitted reports waiting for your signature' : 'Submission register and workflow history'}</h3>
            </div>
            <span className="panel-tag">{list.length} items</span>
          </div>

          <div className="table-shell">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Branch</th>
                  <th>Month</th>
                  <th>Status</th>
                  <th>Prepared By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.length ? list.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.report_type}</td>
                    <td>{item.branch_name}</td>
                    <td>{item.month}</td>
                    <td>{formatStatus(item.status)}</td>
                    <td>{item.prepared_by_name}</td>
                    <td>
                      <button type="button" className="mini-action" onClick={() => openDetail(item.id)}>
                        View
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="7">No reports match this workflow view yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        {isManager ? (
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Validated Queue</p>
                <h3>Ready for CEO delivery</h3>
              </div>
            </div>

            <div className="stack-list">
              {(data?.validated_reports ?? []).length ? (data.validated_reports ?? []).map((item) => (
                <div key={`validated-${item.id}`} className="stack-item">
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.branch_name} | {item.month}</span>
                  </div>
                  <div className="stack-meta">
                    <strong>{formatStatus(item.status)}</strong>
                    <button type="button" className="mini-action" onClick={() => openDetail(item.id)}>Open</button>
                  </div>
                </div>
              )) : <p className="muted-copy">No validated reports are waiting in the queue right now.</p>}
            </div>
          </article>
        ) : null}
      </section>

      {detail ? (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <article className="modal-panel report-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Report Submission</p>
                <h3>{detail.report.title}</h3>
              </div>
              <div className="modal-actions">
                <span className="panel-tag">{formatStatus(detail.report.status)}</span>
                <button type="button" className="ghost-button" onClick={() => setDetail(null)}>Close</button>
              </div>
            </div>

            {isLoadingDetail ? <p className="muted-copy">Loading report detail...</p> : null}

            <div className="report-summary-grid">
              <div className="report-summary-card"><span>Prepared by</span><strong>{detail.report.prepared_by_name}</strong><small>{detail.report.prepared_by_role}</small></div>
              <div className="report-summary-card"><span>Branch</span><strong>{detail.report.branch_name}</strong><small>{detail.report.month}</small></div>
              <div className="report-summary-card"><span>Validated by</span><strong>{detail.report.validated_by_name || 'Pending GM review'}</strong><small>{detail.report.validated_at || 'Not validated yet'}</small></div>
              <div className="report-summary-card"><span>Pushed to CEO</span><strong>{detail.report.pushed_to_ceo_by_name || 'Not yet pushed'}</strong><small>{detail.report.pushed_to_ceo_at || 'Pending delivery'}</small></div>
            </div>

            {detail.report.accountant_notes ? (
              <div className="message-banner">
                Accountant note: {detail.report.accountant_notes}
              </div>
            ) : null}
            {detail.report.gm_notes ? (
              <div className="message-banner">
                GM note: {detail.report.gm_notes}
              </div>
            ) : null}

            <div className="report-summary-grid">
              {detail.report.accountant_signature_url ? <SignatureCard label="Accountant signature" url={detail.report.accountant_signature_url} /> : null}
              {detail.report.gm_signature_url ? <SignatureCard label="GM signature" url={detail.report.gm_signature_url} /> : null}
            </div>

            <StoredReportPreview payload={detail.payload} />

            {(detail.approvals ?? []).length ? (
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Approval Trail</p>
                    <h3>Submission history</h3>
                  </div>
                </div>
                <div className="stack-list">
                  {detail.approvals.map((item) => (
                    <div key={item.id} className="stack-item">
                      <div>
                        <strong>{item.approver_name}</strong>
                        <span>{item.approver_role} | {formatStatus(item.action)}</span>
                      </div>
                      <div className="stack-meta">
                        <strong>{item.created_at}</strong>
                        <span>{item.notes || 'No notes'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            {isManager && detail.report.status === 'submitted' ? (
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">GM Validation</p>
                    <h3>Validate or reject this final report</h3>
                  </div>
                </div>

                <div className="patient-form-grid">
                  <label className="full-span">
                    Review notes
                    <textarea rows="4" value={gmNotes} onChange={(event) => setGmNotes(event.target.value)} placeholder="Write the validation note or rejection reason." />
                  </label>
                  <label className="full-span">
                    GM signature
                    <input type="file" accept="image/*" onChange={(event) => setGmSignatureFile(event.target.files?.[0] ?? null)} />
                  </label>
                  <div className="filter-actions-row full-span">
                    <button type="button" className="ghost-button danger-outline" disabled={isSubmitting || !gmSignatureFile} onClick={() => reviewReport('rejected')}>
                      {isSubmitting ? 'Working...' : 'Reject report'}
                    </button>
                    <button type="button" className="primary-button" disabled={isSubmitting || !gmSignatureFile} onClick={() => reviewReport('validated')}>
                      {isSubmitting ? 'Working...' : 'Validate report'}
                    </button>
                  </div>
                </div>
              </article>
            ) : null}

            {isManager && detail.report.status === 'validated' ? (
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">CEO Delivery</p>
                    <h3>Push this validated report to the CEO</h3>
                  </div>
                </div>

                <div className="patient-form-grid">
                  <label className="full-span">
                    Push note
                    <textarea rows="3" value={pushNotes} onChange={(event) => setPushNotes(event.target.value)} placeholder="Optional note to accompany this validated report to the CEO." />
                  </label>
                  <div className="filter-actions-row full-span">
                    <button type="button" className="primary-button" disabled={isSubmitting} onClick={pushToCeo}>
                      {isSubmitting ? 'Pushing report...' : 'Push to CEO'}
                    </button>
                  </div>
                </div>
              </article>
            ) : null}
          </article>
        </div>
      ) : null}
    </section>
  )
}

function SignatureCard({ label, url }) {
  return (
    <div className="report-summary-card">
      <span>{label}</span>
      <img src={url} alt={label} className="memo-signature-preview" />
    </div>
  )
}

function StoredReportPreview({ payload }) {
  const rows = payload?.rows ?? []
  const summary = payload?.snapshotItems ?? []
  const monthlyRows = payload?.showMonthlyOverview ? (payload?.monthlyRows ?? []) : []
  const showComparison = Boolean(payload?.showComparison)

  return (
    <article className="panel report-sheet">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{payload?.reportMode?.label ?? 'Submitted'} Report</p>
          <h3>{payload?.title ?? 'Submitted report preview'}</h3>
        </div>
        <span className="panel-tag">{payload?.primary?.month_label ?? payload?.month ?? 'Report'}</span>
      </div>

      {!!summary.length ? (
        <div className="report-summary-grid">
          {summary.map(([label, value, note]) => (
            <div key={label} className="report-summary-card">
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </div>
          ))}
        </div>
      ) : null}

      {monthlyRows.length ? (
        <div className="table-shell">
          <table className="portal-table report-table report-monthly-table">
            <thead>
              <tr>
                <th>SN</th>
                <th>Month</th>
                <th>Revenue</th>
                <th>Expenses</th>
                <th>Profit</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map((row, index) => (
                <tr key={`stored-month-${row.month}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{row.month_label}</td>
                  <td>{formatMoney(row.revenue)}</td>
                  <td>{formatMoney(row.expenses)}</td>
                  <td>{formatMoney(row.profit)}</td>
                  <td>{formatMoney(row.outstanding_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="table-shell">
        <table className={showComparison ? 'portal-table report-table report-detail-table' : 'portal-table report-table report-simple-table'}>
          <thead>
            <tr>
              <th>SN</th>
              <th>Description</th>
              <th>{showComparison ? `${payload?.primary?.branch_name ?? 'Primary'} Amount` : 'Amount'}</th>
              {showComparison ? <th>{payload?.comparison?.branch_name ?? 'Comparison'} Amount</th> : null}
              {showComparison ? <th>Variance</th> : null}
              <th>Accountant Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((item) => item.type === 'section' ? (
              <tr key={item.key} className="report-section-row">
                <td colSpan={showComparison ? 6 : 4}>{item.title}</td>
              </tr>
            ) : (
              <tr key={item.key}>
                <td>{item.sn}</td>
                <td>
                  <div className="report-row-copy">
                    <strong>{item.description}</strong>
                    {item.systemNote ? <small>{item.systemNote}</small> : null}
                  </div>
                </td>
                <td>{formatMoney(item.amount)}</td>
                {showComparison ? <td>{formatMoney(item.comparisonAmount)}</td> : null}
                {showComparison ? <td>{typeof item.variance === 'number' ? formatMoney(item.variance) : item.variance}</td> : null}
                <td>{item.note || 'No note'}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={showComparison ? 6 : 4}>No report rows were stored for this submission.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}

function formatStatus(value) {
  return String(value ?? '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatMoney(value) {
  return currency.format(Number(value ?? 0))
}
