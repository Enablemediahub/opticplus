import { useEffect, useMemo, useRef, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const defaultFilters = () => ({ search: '', status: 'all', category: 'all', scope: 'workspace', page: 1, per_page: 12 })
const defaultForm = (session) => ({
  subject: '',
  memo_to: 'General Manager',
  memo_from: session?.name ?? '',
  memo_date: todayIso(),
  reference: buildMemoReference(todayIso()),
  category: 'finance',
  priority: 'medium',
  cc: '',
  body: '',
  requires_approval: true,
  accountant_signature: null,
  attachments: [],
})
const defaultDecisionForm = () => ({ decision: 'approved', approval_notes: '', gm_signature: null })

function buildMemoReference(memoDate = todayIso()) {
  const parsed = new Date(`${memoDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  const month = parsed.toLocaleString('en-US', { month: 'short' }).toUpperCase()
  const year = parsed.getFullYear()
  return `MEMO-${month}-${year}-01`
}

function resolveAssetUrl(url) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1')
    .replace(/\/api\/v1\/?$/i, '')
    .replace(/\/$/, '')
  return `${base}/${trimmed.replace(/^\//, '')}`
}

function MemoSignatureCard({ label, url, signer, emptyMessage, missingMessage }) {
  const [isBroken, setIsBroken] = useState(false)
  const resolvedUrl = resolveAssetUrl(url)
  const showImage = Boolean(resolvedUrl) && !isBroken

  return (
    <div className="memo-signature-block">
      <strong>{label}</strong>
      {signer ? <span className="muted-copy">{signer}</span> : null}
      {showImage ? (
        <img
          src={resolvedUrl}
          alt={label}
          className="memo-signature-preview"
          onError={() => setIsBroken(true)}
        />
      ) : (
        <p className="muted-copy">{resolvedUrl ? (missingMessage || 'Signature image could not be loaded.') : emptyMessage}</p>
      )}
    </div>
  )
}

export default function MemosSection({ apiFetch, token, session, selectedBranchId, pushSuccessToast }) {
  const [meta, setMeta] = useState(null)
  const [memoData, setMemoData] = useState(null)
  const [detail, setDetail] = useState(null)
  const [filters, setFilters] = useState(defaultFilters())
  const [query, setQuery] = useState(defaultFilters())
  const [form, setForm] = useState(() => defaultForm(session))
  const [decisionForm, setDecisionForm] = useState(defaultDecisionForm())
  const [selectedMemoId, setSelectedMemoId] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeciding, setIsDeciding] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [editingDraftId, setEditingDraftId] = useState(null)
  const [existingAttachments, setExistingAttachments] = useState([])
  const [existingSignatureUrl, setExistingSignatureUrl] = useState('')
  const composerRef = useRef(null)

  const branchId = session?.is_admin ? selectedBranchId : session?.branch_id
  const canApprove = Boolean(['manager', 'ceo'].includes(session?.role))
  const memoRecipientOptions = ['General Manager']
  const scopeOptions = useMemo(() => (
    canApprove
      ? [
          { value: 'workspace', label: 'Workspace' },
          { value: 'approvals', label: 'Approvals' },
          { value: 'mine', label: 'My memos' },
        ]
      : [
          { value: 'workspace', label: 'Workspace' },
          { value: 'mine', label: 'My memos' },
        ]
  ), [canApprove])

  useEffect(() => {
    setForm((current) => ({ ...current, memo_from: session?.name ?? current.memo_from }))
  }, [session?.name])

  useEffect(() => {
    setForm(defaultForm(session))
    setEditingDraftId(null)
    setExistingAttachments([])
    setExistingSignatureUrl('')
  }, [session])

  useEffect(() => {
    setForm((current) => {
      if (String(current.reference || '').trim() !== '') return current
      return { ...current, reference: buildMemoReference(current.memo_date) }
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadMeta() {
      if (!token || !session) return
      try {
        const response = await apiFetch(`/memos/meta?branch_id=${branchId}`, { token })
        if (!cancelled) setMeta(response)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      }
    }

    loadMeta()
    return () => {
      cancelled = true
    }
  }, [apiFetch, branchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadMemos() {
      if (!token || !session) return
      setIsLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          branch_id: String(branchId),
          page: String(query.page),
          per_page: String(query.per_page),
          scope: query.scope,
        })
        if (query.search) params.set('search', query.search)
        if (query.status !== 'all') params.set('status', query.status)
        if (query.category !== 'all') params.set('category', query.category)
        const response = await apiFetch(`/memos?${params.toString()}`, { token })
        if (!cancelled) setMemoData(response)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadMemos()
    return () => {
      cancelled = true
    }
  }, [apiFetch, branchId, query, session, token])

  useEffect(() => {
    if (!memoData?.memos?.length) {
      setSelectedMemoId(null)
      setDetail(null)
      return
    }

    if (!selectedMemoId) {
      setSelectedMemoId(memoData.memos[0].id)
    }
  }, [memoData, selectedMemoId])

  useEffect(() => {
    if (!selectedMemoId || !token) return
    loadDetail(selectedMemoId)
  }, [selectedMemoId, token])

  function openMemoModal(memoId) {
    setSelectedMemoId(memoId)
    setIsViewModalOpen(true)
  }

  function closeMemoModal() {
    setIsViewModalOpen(false)
  }

  async function loadDetail(memoId) {
    setIsLoadingDetail(true)
    try {
      const response = await apiFetch(`/memos/${memoId}?branch_id=${branchId}`, { token })
      setDetail(response)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  async function reloadListAndDetail(memoId = selectedMemoId) {
    setQuery((current) => ({ ...current }))
    if (memoId) {
      await loadDetail(memoId)
    }
  }

  async function saveMemo(saveAsDraft = false) {
    setIsSaving(true)
    setError('')
    setSuccess('')

    try {
      const payload = new FormData()
      payload.append('subject', form.subject)
      payload.append('memo_to', form.memo_to)
      payload.append('memo_from', form.memo_from)
      payload.append('memo_date', form.memo_date)
      payload.append('reference', form.reference)
      payload.append('category', form.category)
      payload.append('priority', form.priority)
      payload.append('cc', form.cc)
      payload.append('body', form.body)
      payload.append('requires_approval', form.requires_approval ? '1' : '0')
      payload.append('save_as_draft', saveAsDraft ? '1' : '0')
      if (form.accountant_signature) payload.append('accountant_signature', form.accountant_signature)
      form.attachments.forEach((file) => payload.append('attachments[]', file))

      const isEditingDraft = Boolean(editingDraftId)
      const response = await apiFetch(isEditingDraft ? `/memos/${editingDraftId}/update?branch_id=${branchId}` : `/memos?branch_id=${branchId}`, {
        method: 'POST',
        token,
        body: payload,
      })

      setSuccess(response.message)
      pushSuccessToast?.(response.message)
      setForm({
        ...defaultForm(session),
        reference: buildMemoReference(todayIso()),
      })
      setEditingDraftId(null)
      setExistingAttachments([])
      setExistingSignatureUrl('')
      setDecisionForm(defaultDecisionForm())
      setSelectedMemoId(response.memo_id ?? null)
      await reloadListAndDetail(response.memo_id)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function loadDraftIntoComposer(memoId) {
    setError('')
    setSuccess('')

    try {
      const response = await apiFetch(`/memos/${memoId}?branch_id=${branchId}`, { token })
      const draftMemo = response.memo
      setForm({
        subject: draftMemo.subject ?? '',
        memo_to: draftMemo.memo_to ?? 'General Manager',
        memo_from: draftMemo.memo_from ?? (session?.name ?? ''),
        memo_date: draftMemo.memo_date ?? todayIso(),
        reference: draftMemo.reference ?? buildMemoReference(draftMemo.memo_date ?? todayIso()),
        category: draftMemo.category ?? 'finance',
        priority: draftMemo.priority ?? 'medium',
        cc: draftMemo.cc ?? '',
        body: draftMemo.body ?? '',
        requires_approval: Boolean(draftMemo.requires_approval),
        accountant_signature: null,
        attachments: [],
      })
      setEditingDraftId(draftMemo.id)
      setExistingAttachments(response.attachments ?? [])
      setExistingSignatureUrl(draftMemo.digital_signature_url ?? '')
      setSelectedMemoId(draftMemo.id)
      setDetail(response)
      closeMemoModal()
      window.setTimeout(() => {
        composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    } catch (loadError) {
      setError(loadError.message)
    }
  }

  function cancelDraftEditing() {
    setEditingDraftId(null)
    setExistingAttachments([])
    setExistingSignatureUrl('')
    setForm({
      ...defaultForm(session),
      reference: buildMemoReference(todayIso()),
    })
  }

  async function submitDecision(event) {
    event.preventDefault()
    if (!selectedMemoId) return

    setIsDeciding(true)
    setError('')
    setSuccess('')

    try {
      const payload = new FormData()
      payload.append('decision', decisionForm.decision)
      payload.append('approval_notes', decisionForm.approval_notes)
      if (decisionForm.gm_signature) payload.append('gm_signature', decisionForm.gm_signature)

      const response = await apiFetch(`/memos/${selectedMemoId}/decision?branch_id=${branchId}`, {
        method: 'POST',
        token,
        body: payload,
      })

      setSuccess(response.message)
      setDecisionForm(defaultDecisionForm())
      await reloadListAndDetail(selectedMemoId)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsDeciding(false)
    }
  }

  const memo = detail?.memo
  const isPendingApproval = memo?.approval_status === 'pending' && memo?.requires_approval

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Memos</p>
          <h3>Draft, sign, and route internal memos for approval</h3>
          <p className="header-copy">Accountants can compose memos with their signature and attachments, then forward them to management for approval or rejection.</p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="All Memos" value={String(memoData?.stats?.total ?? 0)} note="Visible in your current workspace" icon="message" className="total" />
        <StatWidget label="Pending Approval" value={String(memoData?.stats?.pending_approval ?? 0)} note="Waiting for management review" icon="briefcase" className="pending" />
        <StatWidget label="Approved" value={String(memoData?.stats?.approved ?? 0)} note="Signed off and archived" icon="shield" className="seen" />
        <StatWidget label="Rejected" value={String(memoData?.stats?.rejected ?? 0)} note="Returned for corrections or closure" icon="alert" className="today" />
      </section>

      <section className="memo-page-flow">
        <article ref={composerRef} className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Compose Memo</p>
              <h3>{editingDraftId ? 'Continue and send your saved draft' : 'Prepare the memo for management review'}</h3>
            </div>
            <span className="panel-tag">{editingDraftId ? 'Draft loaded' : (meta?.branch_name ?? 'Branch memo desk')}</span>
          </div>

          {editingDraftId ? (
            <div className="message-banner">
              You are editing draft memo `#{editingDraftId}`. Save it again to keep it as a draft, or send it now for approval.
            </div>
          ) : null}

          <form className="patient-filter-grid" onSubmit={(event) => event.preventDefault()}>
            <label>
              Subject
              <input value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Monthly expense approval memo" />
            </label>
            <label>
              Memo to
              <select value={form.memo_to} onChange={(event) => setForm((current) => ({ ...current, memo_to: event.target.value }))}>
                {memoRecipientOptions.map((recipient) => (
                  <option key={recipient} value={recipient}>{recipient}</option>
                ))}
              </select>
            </label>
            <label>
              Memo from
              <input value={form.memo_from} readOnly />
            </label>
            <label>
              Memo date
              <input
                type="date"
                value={form.memo_date}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  memo_date: event.target.value,
                  reference: buildMemoReference(event.target.value),
                }))}
              />
            </label>
            <label>
              Reference
              <input value={form.reference} readOnly placeholder="MEMO-APR-2026-01" />
            </label>
            <label>
              Category
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                {(meta?.categories ?? []).map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
              </select>
            </label>
            <label>
              Priority
              <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                {(meta?.priorities ?? []).map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
              </select>
            </label>
            <label>
              CC
              <input value={form.cc} onChange={(event) => setForm((current) => ({ ...current, cc: event.target.value }))} placeholder="CEO, HR, Operations" />
            </label>
            <label className="full-span">
              Memo body
              <textarea rows="8" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder="Write the memo details, reason, and requested approval here." />
            </label>
            <div className="memo-upload-field">
              <span className="memo-upload-label">Accountant signature</span>
              <label className="memo-upload-trigger">
                <input
                  className="hidden-file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => setForm((current) => ({ ...current, accountant_signature: event.target.files?.[0] ?? null }))}
                />
                <strong>{form.accountant_signature ? 'Replace signature image' : 'Select signature image'}</strong>
                <span>Upload the accountant signature that will be attached to this memo.</span>
              </label>
              {form.accountant_signature ? (
                <div className="memo-file-pill-list">
                  <span className="memo-file-pill">{form.accountant_signature.name}</span>
                </div>
              ) : existingSignatureUrl ? (
                <MemoSignatureCard
                  label="Saved signature on this draft"
                  url={existingSignatureUrl}
                  signer={form.memo_from || session?.name || 'Accountant'}
                  missingMessage="This saved signature file is no longer available in uploads."
                />
              ) : (
                <p className="muted-copy">No signature image selected yet.</p>
              )}
            </div>
            <div className="memo-upload-field">
              <span className="memo-upload-label">Attach supporting files</span>
              <label className="memo-upload-trigger">
                <input
                  className="hidden-file-input"
                  type="file"
                  multiple
                  onChange={(event) => setForm((current) => ({ ...current, attachments: Array.from(event.target.files ?? []) }))}
                />
                <strong>Select files</strong>
                <span>Upload receipts, schedules, approval notes, or any supporting document.</span>
              </label>
              {form.attachments.length ? (
                <div className="memo-file-pill-list">
                  {form.attachments.map((file) => (
                    <span key={`${file.name}-${file.lastModified}`} className="memo-file-pill">
                      {file.name}
                    </span>
                  ))}
                </div>
              ) : existingAttachments.length ? (
                <div className="memo-file-pill-list">
                  {existingAttachments.map((file) => (
                    <span key={file.id} className="memo-file-pill">
                      {file.original_name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">No files selected yet.</p>
              )}
            </div>
            <label className="memo-checkbox">
              <input type="checkbox" checked={form.requires_approval} onChange={(event) => setForm((current) => ({ ...current, requires_approval: event.target.checked }))} />
              <span>Route this memo for management approval</span>
            </label>
          </form>

          <div className="header-actions">
            {editingDraftId ? (
              <button type="button" className="ghost-button" disabled={isSaving} onClick={cancelDraftEditing}>
                Cancel Draft Edit
              </button>
            ) : null}
            <button type="button" className="ghost-button" disabled={isSaving} onClick={() => saveMemo(true)}>
              {isSaving ? 'Saving...' : editingDraftId ? 'Update Draft' : 'Save Draft'}
            </button>
            <button type="button" className="primary-button" disabled={isSaving} onClick={() => saveMemo(false)}>
              {isSaving ? 'Saving...' : editingDraftId ? 'Send Draft for Approval' : 'Send for Approval'}
            </button>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Filters</p>
              <h3>Find the right memo fast</h3>
            </div>
            <span className="panel-tag">{memoData?.pagination?.total ?? 0} memos</span>
          </div>

          <form className="memo-filter-bar" onSubmit={(event) => {
            event.preventDefault()
            setQuery((current) => ({ ...current, ...filters, page: 1 }))
          }}>
            <label className="memo-filter-search">
              Search
              <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Subject, reference, or recipient" />
            </label>
            <label>
              Status
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="all">All statuses</option>
                {(meta?.statuses ?? []).map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
              </select>
            </label>
            <label>
              Category
              <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
                <option value="all">All categories</option>
                {(meta?.categories ?? []).map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
              </select>
            </label>
            <label>
              Scope
              <select value={filters.scope} onChange={(event) => setFilters((current) => ({ ...current, scope: event.target.value }))}>
                {scopeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <div className="memo-filter-actions">
              <button type="submit" className="primary-button">Apply</button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const next = defaultFilters()
                  setFilters(next)
                  setQuery(next)
                }}
              >
                Reset
              </button>
            </div>
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{canApprove ? 'Approval Queue' : 'My Drafts'}</p>
              <h3>{canApprove ? 'Needs management action' : 'Continue unfinished memos'}</h3>
            </div>
          </div>

          <div className="stack-list">
            {(canApprove ? memoData?.pending_approvals : memoData?.my_drafts)?.length ? (canApprove ? memoData.pending_approvals : memoData.my_drafts).map((item) => (
              <div key={item.id} className="module-card memo-list-card">
                <strong>{item.subject}</strong>
                <span>{item.memo_from} to {item.memo_to}</span>
                <span>{formatDate(item.memo_date)} | {titleize(item.priority)}</span>
                <div className="header-actions">
                  <button type="button" className="ghost-button" onClick={() => openMemoModal(item.id)}>
                    View
                  </button>
                  {!canApprove ? (
                    <button type="button" className="primary-button" onClick={() => loadDraftIntoComposer(item.id)}>
                      Continue Draft
                    </button>
                  ) : null}
                </div>
              </div>
            )) : (
              <p className="muted-copy">{canApprove ? 'No memos are waiting for approval right now.' : 'No draft memos available.'}</p>
            )}
          </div>
        </article>
      </section>

      <section className="memo-page-flow">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Memo Register</p>
              <h3>Submitted, approved, and rejected memos</h3>
            </div>
          </div>

          <div className="table-shell">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Author</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Approval</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan="7">Loading memo register...</td></tr>
                ) : (memoData?.memos ?? []).length ? (
                  memoData.memos.map((item) => (
                    <tr key={item.id}>
                      <td>{item.subject}</td>
                      <td>{titleize(item.category)}</td>
                      <td>{item.memo_from}</td>
                      <td>{formatDate(item.memo_date)}</td>
                      <td><span className={`memo-status-pill is-${item.status}`}>{titleize(item.status)}</span></td>
                      <td><span className={`memo-status-pill is-${item.approval_status}`}>{titleize(item.approval_status)}</span></td>
                      <td>
                        <button type="button" className="ghost-button" onClick={() => openMemoModal(item.id)}>View</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="7">No memos match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Memo Reader</p>
              <h3>Open memos in a popup workspace</h3>
            </div>
            <span className="panel-tag">{memoData?.memos?.length ?? 0} available</span>
          </div>
          <p className="muted-copy">Use the `View` button on any memo row to open a focused reading modal with the full memo, signatures, attachments, and approval controls.</p>
        </article>
      </section>

      {isViewModalOpen ? (
        <div className="modal-overlay" onClick={closeMemoModal}>
          <article className="modal-panel memo-read-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Memo Detail</p>
                <h3>{memo?.subject ?? 'Loading memo'}</h3>
              </div>
              <div className="header-actions">
                <span className="panel-tag">{memo ? titleize(memo.approval_status) : 'Loading'}</span>
                <button type="button" className="ghost-button" onClick={closeMemoModal}>Close</button>
              </div>
            </div>

            {isLoadingDetail ? <p className="muted-copy">Loading memo detail...</p> : memo ? (
              <div className="stack-list memo-detail-flow">
                <div className="memo-detail-meta">
                  <div className="memo-detail-chip">
                    <strong>Routing</strong>
                    <span>{memo.memo_from} to {memo.memo_to}</span>
                  </div>
                  <div className="memo-detail-chip">
                    <strong>Memo Date</strong>
                    <span>{formatDate(memo.memo_date)}</span>
                  </div>
                  <div className="memo-detail-chip">
                    <strong>Reference</strong>
                    <span>{memo.reference || 'No reference'}</span>
                  </div>
                  <div className="memo-detail-chip">
                    <strong>Category</strong>
                    <span>{titleize(memo.category)}</span>
                  </div>
                </div>

                <div className="memo-body-card">
                  <strong>Memo body</strong>
                  <p>{memo.body}</p>
                </div>

                <div className="memo-signature-grid">
                  <MemoSignatureCard
                    label="Accountant signature"
                    url={memo.digital_signature_url}
                    signer={memo.memo_from || memo.created_by || 'Accountant'}
                    emptyMessage="No accountant signature was attached to this memo."
                    missingMessage="This legacy accountant signature file is missing from server uploads."
                  />
                  <MemoSignatureCard
                    label="Management signature"
                    url={memo.gm_signature_url}
                    signer={memo.approved_by || 'General Manager'}
                    emptyMessage={memo.approval_status === 'pending'
                      ? 'Management has not signed this memo yet.'
                      : memo.approval_status === 'rejected'
                        ? 'This memo was rejected without a management signature image.'
                        : 'No management signature was attached to this memo.'}
                    missingMessage="This legacy management signature file is missing from server uploads."
                  />
                </div>

                {(detail?.attachments ?? []).length ? (
                  <div className="memo-file-list">
                    <strong>Attachments</strong>
                    {(detail.attachments ?? []).map((file) => (
                      <a key={file.id} href={file.file_url} target="_blank" rel="noreferrer" className="ghost-button">{file.original_name}</a>
                    ))}
                  </div>
                ) : null}

                {(detail?.approvals ?? []).length ? (
                  <div className="stack-list">
                    {(detail.approvals ?? []).map((item) => (
                      <div key={item.id} className="stack-item">
                        <div>
                          <strong>{titleize(item.action)}</strong>
                          <span>{item.approver_name} | {titleize(item.approver_role)}</span>
                        </div>
                        <div className="stack-meta">
                          <strong>{formatDateTime(item.created_at)}</strong>
                          <span>{item.notes || 'No note provided'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {!canApprove && memo?.status === 'draft' ? (
                  <div className="header-actions">
                    <button type="button" className="ghost-button" onClick={() => loadDraftIntoComposer(memo.id)}>
                      Continue Draft
                    </button>
                  </div>
                ) : null}

                {canApprove && isPendingApproval ? (
                  <form className="memo-decision-form" onSubmit={submitDecision}>
                    <label className="memo-decision-field">
                      Decision
                      <select value={decisionForm.decision} onChange={(event) => setDecisionForm((current) => ({ ...current, decision: event.target.value }))}>
                        <option value="approved">Approve</option>
                        <option value="rejected">Reject</option>
                      </select>
                    </label>
                    <label className="memo-decision-field">
                      Approval note
                      <textarea rows="4" value={decisionForm.approval_notes} onChange={(event) => setDecisionForm((current) => ({ ...current, approval_notes: event.target.value }))} placeholder="Add the approval reason or rejection note." />
                    </label>
                    <div className="memo-upload-field">
                      <span className="memo-upload-label">Approval signature</span>
                      <label className="memo-upload-trigger">
                        <input
                          className="hidden-file-input"
                          type="file"
                          accept="image/*"
                          onChange={(event) => setDecisionForm((current) => ({ ...current, gm_signature: event.target.files?.[0] ?? null }))}
                        />
                        <strong>{decisionForm.gm_signature ? 'Replace signature image' : 'Select signature image'}</strong>
                        <span>Upload the signature that will be applied to this approval decision.</span>
                      </label>
                      {decisionForm.gm_signature ? (
                        <div className="memo-file-pill-list">
                          <span className="memo-file-pill">{decisionForm.gm_signature.name}</span>
                        </div>
                      ) : (
                        <p className="muted-copy">No approval signature image selected yet.</p>
                      )}
                    </div>
                    <button type="submit" className="primary-button" disabled={isDeciding}>
                      {isDeciding ? 'Saving decision...' : 'Submit Decision'}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : (
              <p className="muted-copy">Choose a memo from the register to review its body, signatures, attachments, and approval trail.</p>
            )}
          </article>
        </div>
      ) : null}
    </section>
  )
}

function titleize(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

function formatDate(value) {
  if (!value) return 'No date'
  return new Date(value).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(value) {
  if (!value) return 'No date'
  return new Date(value).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
